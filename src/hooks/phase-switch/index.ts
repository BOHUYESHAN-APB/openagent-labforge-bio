/**
 * Phase Switch — 合成消息基础设施
 *
 * 核心信令机制，用于在 agent/phase 切换时注入标准化合成消息。
 * 合成消息格式: [phase:{name}|agent:{name}|think:{level}]
 *
 * 工作流:
 * 1. 任意 hook 调 injectPhaseSwitch(sessionID, msg)
 * 2. chat.message hook 检测 pendingSwitch → prepend 合成消息
 * 3. 新回合 AI 以新 agent + 新提示词 + 新思考强度工作
 *
 * 挂载:
 * - index.ts 的 chat.message hook 中调 tryInjectPhaseSwitch()
 */

/** 合成消息内容 */
export interface PhaseSwitchMessage {
  /** 阶段名称 */
  phase: 'interview' | 'execute' | 'review' | 'redesign' | 'done';
  /** 目标 agent 名称 */
  agent: string;
  /** 思考强度（默认 inherit） */
  think?: 'none' | 'inherit' | 'low' | 'medium' | 'high' | 'max';
  /** 额外参数 */
  extras?: {
    /** 本阶段禁用的工具列表 */
    deny?: string[];
    /** 本阶段允许的工具列表 */
    allow?: string[];
    /** 修复说明（scope=executor 时） */
    fixInstructions?: string;
    /** 返回的 agent（phase=done 时） */
    returnAgent?: string;
  };
}

/**
 * 构建合成消息文本
 */
export function buildPhaseSwitchText(msg: PhaseSwitchMessage): string {
  const parts = [`phase:${msg.phase}`, `agent:${msg.agent}`];
  if (msg.think) parts.push(`think:${msg.think}`);
  const extras = msg.extras ?? {};
  if (extras.fixInstructions) parts.push(`fix:${extras.fixInstructions}`);
  if (extras.returnAgent) parts.push(`return:${extras.returnAgent}`);
  return `[${parts.join('|')}]`;
}

/**
 * Pending switch 管理器
 * 每个 session 最多一个 pending switch，避免堆积
 */
const pendingSwitches = new Map<string, PhaseSwitchMessage>();

/**
 * 注入阶段切换标志
 * 由任意 hook 调用（plan-mode/todo-continuation/loop 等）
 */
export function injectPhaseSwitch(
  sessionID: string,
  msg: PhaseSwitchMessage,
): void {
  pendingSwitches.set(sessionID, msg);
}

/**
 * 读取并清除 pending switch
 * 由 chat.message hook 调用
 */
export function tryConsumePhaseSwitch(
  sessionID: string,
): PhaseSwitchMessage | undefined {
  const msg = pendingSwitches.get(sessionID);
  if (msg) pendingSwitches.delete(sessionID);
  return msg;
}

// ──────────────────────────────────────────
// Thinking level → reasoning_effort 映射
// ──────────────────────────────────────────

/**
 * 规则表：phase×agent → think level
 * 通配符 '*' 表示任意 agent
 */
export interface ThinkRule {
  phase: string;
  agent: string; // '*' = any
  think: PhaseSwitchMessage['think'];
}

const THINK_RULES: ThinkRule[] = [
  // planner 始终 max（覆盖 overlay phase='plan' 兜底）
  { phase: 'plan', agent: 'prometheus', think: 'max' },
  { phase: 'interview', agent: 'prometheus', think: 'max' },
  { phase: 'redesign', agent: 'prometheus', think: 'max' },
  // executor 继承
  { phase: 'execute', agent: '*', think: 'inherit' },
  // reviewer 高
  { phase: 'review', agent: 'reviewer', think: 'high' },
  // done 继承
  { phase: 'done', agent: '*', think: 'inherit' },
  // compaction 高
  { phase: 'compaction', agent: '*', think: 'high' },
];

/**
 * 查询 thinking level
 * 按 (phase, agent) 精确匹配 → (phase, '*') 通配 → default inherit
 */
export function getThinkLevel(
  phase: string | undefined,
  agent: string | undefined,
): PhaseSwitchMessage['think'] {
  if (!phase) return 'inherit';

  // 精确匹配
  for (const rule of THINK_RULES) {
    if (rule.phase === phase && rule.agent === agent) return rule.think;
  }
  // 通配
  for (const rule of THINK_RULES) {
    if (rule.phase === phase && rule.agent === '*') return rule.think;
  }
  return 'inherit';
}

/**
 * max/xhigh 归一化 + 模型适配
 *
 * 不同模型对 reasoning_effort 的值要求不同:
 * - deepseek: high 是最高档（max/xhigh 不识别）
 * - claude: max/xhigh 都认
 * - gpt: 默认用 max
 */
export function resolveThinkingEffort(
  level: string | undefined,
  modelID?: string,
): string | undefined {
  if (!level || level === 'inherit' || level === 'none') return undefined;

  // max/xhigh → 模型适配
  if (level === 'max' || level === 'xhigh') {
    const id = modelID?.toLowerCase() ?? '';
    if (id.includes('deepseek')) return 'high'; // deepseek 最高档
    if (id.includes('claude')) return 'max'; // claude 用 max
    if (id.includes('gemini')) return 'high'; // gemini 用 high
    return 'max'; // 默认
  }

  return level;
}

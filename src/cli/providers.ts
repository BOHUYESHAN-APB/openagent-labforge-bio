import { DEFAULT_AGENT_MCPS } from '../config/agent-mcps';
import { PACKAGE_NAME, SCHEMA_FILE_NAME } from '../config/product';
import { CUSTOM_SKILLS } from './custom-skills';
import { RECOMMENDED_SKILLS } from './skills';
import type { InstallConfig } from './types';

const SCHEMA_URL = `https://unpkg.com/${PACKAGE_NAME}@latest/${SCHEMA_FILE_NAME}`;

// ── Five presets ──────────────────────────────────────────────────
//   free       — 默认，不绑定模型，无侵入（DEFAULT）
//   ds-first   — DS 优先，适配 OpenCode Go 订阅
//   openai     — OpenAI 订阅优化
//   openai-go  — 双订阅最优组合
//   custom     — 用户自配每个 agent
export const GENERATED_PRESETS = [
  'free',
  'ds-first',
  'openai',
  'openai-go',
  'custom',
] as const;

// ── Agent → (model, variant) per preset ───────────────────────────
//
// Variant = reasoning effort:
//   max   — DeepSeek 最强推理（DS-Pro 主力）
//   high  — 高推理（审查、规划位）
//   medium— 中等（视觉分析、日常编码）
//   low   — 快速便宜（搜索、批量实现）

interface AgentModelEntry {
  model: string;
  variant?: string;
}

export const MODEL_MAPPINGS: Record<string, Record<string, AgentModelEntry>> = {
  'ds-first': {
    // 强推理主力
    orchestrator: { model: 'opencode-go/deepseek-v4-pro', variant: 'max' },
    'deep-worker': { model: 'opencode-go/deepseek-v4-pro', variant: 'max' },
    'bio-orchestrator': { model: 'opencode-go/deepseek-v4-pro', variant: 'max' },
    // 审查位 — 花钱在刀刃上
    oracle: { model: 'opencode-go/deepseek-v4-pro', variant: 'high' },
    reviewer: { model: 'opencode-go/deepseek-v4-pro', variant: 'high' },
    council: { model: 'opencode-go/deepseek-v4-pro', variant: 'high' },
    momus: { model: 'opencode-go/deepseek-v4-pro', variant: 'high' },
    // 规划 — 需大上下文
    prometheus: { model: 'opencode-go/glm-5.1', variant: 'high' },
    // 轻量快速
    explorer: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    librarian: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    fixer: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    atlas: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    metis: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    councillor: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    // 视觉 — MiMo 1M上下文 + 视觉
    designer: { model: 'opencode-go/mimo-v2.5', variant: 'medium' },
    observer: { model: 'opencode-go/mimo-v2.5', variant: 'medium' },
    'multimodal-looker': { model: 'opencode-go/mimo-v2.5', variant: 'medium' },
  },

  openai: {
    // 日常主力 — 5.4 够了
    orchestrator: { model: 'openai/gpt-5.4', variant: 'high' },
    'deep-worker': { model: 'openai/gpt-5.4', variant: 'high' },
    'bio-orchestrator': { model: 'openai/gpt-5.4', variant: 'high' },
    // 审查位 — 5.5（token 消耗少但质量关键）
    oracle: { model: 'openai/gpt-5.5', variant: 'xhigh' },
    reviewer: { model: 'openai/gpt-5.5', variant: 'xhigh' },
    council: { model: 'openai/gpt-5.5', variant: 'high' },
    momus: { model: 'openai/gpt-5.5', variant: 'high' },
    prometheus: { model: 'openai/gpt-5.5', variant: 'high' },
    // 轻量快速 — mini 有视觉
    explorer: { model: 'openai/gpt-5.4-mini', variant: 'low' },
    librarian: { model: 'openai/gpt-5.4-mini', variant: 'low' },
    fixer: { model: 'openai/gpt-5.4-mini', variant: 'low' },
    atlas: { model: 'openai/gpt-5.4-mini', variant: 'low' },
    metis: { model: 'openai/gpt-5.4-mini', variant: 'low' },
    councillor: { model: 'openai/gpt-5.4-mini', variant: 'low' },
    // 视觉 — mini 有视觉
    designer: { model: 'openai/gpt-5.4-mini', variant: 'medium' },
    observer: { model: 'openai/gpt-5.4-mini', variant: 'medium' },
    'multimodal-looker': { model: 'openai/gpt-5.4-mini', variant: 'medium' },
  },

  'openai-go': {
    // 强推理主力 — GPT-5.4
    orchestrator: { model: 'openai/gpt-5.4', variant: 'high' },
    'deep-worker': { model: 'openai/gpt-5.4', variant: 'high' },
    'bio-orchestrator': { model: 'openai/gpt-5.4', variant: 'high' },
    // 审查位 — GPT-5.5（token 少但关键）
    oracle: { model: 'openai/gpt-5.5', variant: 'xhigh' },
    reviewer: { model: 'openai/gpt-5.5', variant: 'xhigh' },
    council: { model: 'openai/gpt-5.5', variant: 'high' },
    momus: { model: 'openai/gpt-5.5', variant: 'high' },
    prometheus: { model: 'openai/gpt-5.5', variant: 'high' },
    // 轻量快速 — DS-Flash 比 GPT-mini 更便宜
    explorer: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    librarian: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    fixer: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    atlas: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    metis: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    councillor: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    // 视觉 — GPT-mini（有视觉）
    designer: { model: 'openai/gpt-5.4-mini', variant: 'medium' },
    observer: { model: 'openai/gpt-5.4-mini', variant: 'medium' },
    'multimodal-looker': { model: 'openai/gpt-5.4-mini', variant: 'medium' },
  },
} as const;

export type PresetName = keyof typeof MODEL_MAPPINGS | 'free' | 'custom';
export type GeneratedPresetName = (typeof GENERATED_PRESETS)[number];

export function isPresetName(value: string): value is PresetName {
  if (value === 'free' || value === 'custom') return true;
  return Object.hasOwn(MODEL_MAPPINGS, value);
}

export function getPresetNames(): PresetName[] {
  return ['free', ...Object.keys(MODEL_MAPPINGS), 'custom'] as PresetName[];
}

export function isGeneratedPresetName(
  value: string,
): value is GeneratedPresetName {
  return GENERATED_PRESETS.includes(value as GeneratedPresetName);
}

export function getGeneratedPresetNames(): GeneratedPresetName[] {
  return [...GENERATED_PRESETS];
}

export function generateLiteConfig(
  installConfig: InstallConfig,
): Record<string, unknown> {
  const preset = installConfig.preset ?? 'free';
  if (!isGeneratedPresetName(preset)) {
    throw new Error(
      `Unsupported preset "${preset}". Available: ${getGeneratedPresetNames().join(', ')}`,
    );
  }

  const config: Record<string, unknown> = {
    $schema: SCHEMA_URL,
    preset,
    presets: {},
  };

  const createAgentConfig = (
    agentName: string,
    modelInfo: AgentModelEntry | undefined,
  ) => {
    const isOrchestrator = agentName === 'orchestrator';

    const skills = isOrchestrator
      ? ['*']
      : [
          ...RECOMMENDED_SKILLS.filter(
            (s) =>
              s.allowedAgents.includes('*') ||
              s.allowedAgents.includes(agentName),
          ).map((s) => s.skillName),
          ...CUSTOM_SKILLS.filter(
            (s) =>
              s.allowedAgents.includes('*') ||
              s.allowedAgents.includes(agentName),
          ).map((s) => s.name),
        ];

    if (agentName === 'designer' && !skills.includes('agent-browser')) {
      skills.push('agent-browser');
    }

    // free/custom 预设不绑定模型
    if (!modelInfo) {
      return { skills, mcps: DEFAULT_AGENT_MCPS[agentName as keyof typeof DEFAULT_AGENT_MCPS] ?? [] };
    }

    return {
      model: modelInfo.model,
      variant: modelInfo.variant,
      skills,
      mcps: DEFAULT_AGENT_MCPS[agentName as keyof typeof DEFAULT_AGENT_MCPS] ?? [],
    };
  };

  const presets = config.presets as Record<string, unknown>;

  // free — no model bindings
  presets.free = Object.fromEntries(
    Object.keys(DEFAULT_AGENT_MCPS).map((agentName) => [
      agentName,
      createAgentConfig(agentName, undefined),
    ]),
  );

  // ds-first / openai / openai-go — from MODEL_MAPPINGS
  for (const [mappingName, mapping] of Object.entries(MODEL_MAPPINGS)) {
    presets[mappingName] = Object.fromEntries(
      Object.entries(mapping).map(([agentName, modelInfo]) => [
        agentName,
        createAgentConfig(agentName, modelInfo),
      ]),
    );
  }

  // custom — placeholder (user fills in via customModels)
  presets.custom = Object.fromEntries(
    Object.keys(DEFAULT_AGENT_MCPS).map((agentName) => [
      agentName,
      createAgentConfig(agentName, undefined),
    ]),
  );

  if (installConfig.hasTmux) {
    config.tmux = {
      enabled: true,
      layout: 'main-vertical',
      main_pane_size: 60,
    };
  }

  return config;
}

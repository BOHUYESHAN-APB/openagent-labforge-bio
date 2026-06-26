/**
 * LoopStateMachine — 持久化有限状态机
 *
 * 管理 Loop Engineering 的全部状态和阶段转换。所有状态（包括瞬态标记）
 * 原子写入 .opencode/loops/active.json，跨 OpenCode 重启可恢复。
 *
 * 合法转换:
 *   idle → interview  (/ol-loop-start)
 *   interview → execute (save_plan → auto-exit)
 *   execute → review    (task_complete / todos done)
 *   review → execute    (REJECT scope=executor — 小修)
 *   review → redesign   (REJECT scope=planner — 重做)
 *   review → done       (APPROVED)
 *   redesign → execute  (save_plan → auto-exit)
 *   redesign → done     (超过最大迭代)
 *
 * 文件结构:
 *   .opencode/loops/active.json      — 完整 FSM 状态
 *   .opencode/loops/plans/{id}/       — 内部 plan (redesign 用)
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

// ──────────────────────────────────────────
// 类型
// ──────────────────────────────────────────

export type LoopPhase =
  | 'idle'
  | 'interview'
  | 'execute'
  | 'review'
  | 'redesign'
  | 'done';

export interface LoopVerdictEntry {
  phase: string;
  verdict: string;
  scope?: string;
  timestamp: number;
}

export interface LoopStateData {
  loop_id: string;
  description: string;
  phase: LoopPhase;
  executor_type: string;
  return_agent: string;
  iteration: number;
  max_iterations: number;
  verdict_history: LoopVerdictEntry[];
  created_at: number;
  updated_at: number;

  // ── 瞬态标记（持久化以支持重启恢复）──
  /** 是否需要注入 kickstart 提示词 */
  needs_kickstart: boolean;
  /** 待消费的 phase switch（用于 chat.message hook） */
  pending_switch: { phase: string; agent: string; think?: string } | null;
  /** 过渡序号，每次转换 +1，用于去重 */
  transition_seq: number;
  /** 上次 kickstart 消费时的 transition_seq，防止重复注入 */
  last_kickstart_seq: number;
}

// ──────────────────────────────────────────
// 合法转换表
// ──────────────────────────────────────────

const VALID_TRANSITIONS: Record<LoopPhase, LoopPhase[]> = {
  idle: ['interview'],
  interview: ['execute', 'done'],
  execute: ['review', 'done'],
  review: ['execute', 'redesign', 'done'],
  redesign: ['execute', 'done'],
  done: [],
};

// ──────────────────────────────────────────
// 路径
// ──────────────────────────────────────────

const LOOP_DIR = '.opencode/loops';
const PLANS_DIR = join(LOOP_DIR, 'plans');

function getStatePath(workspaceRoot: string): string {
  return join(workspaceRoot, LOOP_DIR, 'active.json');
}

function getInternalPlanDir(workspaceRoot: string, loop_id: string): string {
  return join(workspaceRoot, PLANS_DIR, loop_id);
}

function findWorkspaceRoot(): string {
  return process.cwd();
}

// ──────────────────────────────────────────
// LoopStateMachine
// ──────────────────────────────────────────

export class LoopStateMachine {
  state: LoopStateData;
  private workspaceRoot: string;

  private constructor(state: LoopStateData, workspaceRoot: string) {
    this.state = state;
    this.workspaceRoot = workspaceRoot;
  }

  // ── 工厂方法 ──

  /** 创建新 FSM（idle → interview） */
  static create(
    description: string,
    executor_type: string,
    return_agent: string,
    workspaceRoot?: string,
    max_iterations?: number,
  ): LoopStateMachine {
    const root = workspaceRoot ?? findWorkspaceRoot();
    const now = Date.now();
    const state: LoopStateData = {
      loop_id: `loop_${now.toString(36)}`,
      description,
      phase: 'idle',
      executor_type,
      return_agent,
      iteration: 1,
      max_iterations: max_iterations ?? 12,
      verdict_history: [],
      created_at: now,
      updated_at: now,
      needs_kickstart: false,
      pending_switch: null,
      transition_seq: 0,
      last_kickstart_seq: -1,
    };
    const fsm = new LoopStateMachine(state, root);
    fsm.persist();
    // 初始转换: idle → interview
    fsm.transition('interview');
    return fsm;
  }

  /** 从磁盘恢复已有 FSM */
  static recover(workspaceRoot?: string): LoopStateMachine | null {
    const root = workspaceRoot ?? findWorkspaceRoot();
    const path = getStatePath(root);
    if (!existsSync(path)) return null;
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8')) as LoopStateData;
      return new LoopStateMachine(data, root);
    } catch {
      return null;
    }
  }

  // ── 持久化 ──

  /** 原子写入状态到磁盘（写临时文件 → rename） */
  persist(): void {
    this.state.updated_at = Date.now();
    const path = getStatePath(this.workspaceRoot);
    const dir = dirname(path);
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error('[LoopFSM] mkdir failed:', dir, err);
      return; // Don't crash — just skip persist
    }

    const tmpPath = path + '.tmp';
    try {
      writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf-8');
      try {
        renameSync(tmpPath, path);
      } catch {
        // Windows fallback
        writeFileSync(path, JSON.stringify(this.state, null, 2), 'utf-8');
        try {
          unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.error('[LoopFSM] persist failed:', path, err);
    }
  }

  /** 删除 FSM 状态文件 */
  destroy(): void {
    const path = getStatePath(this.workspaceRoot);
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      /* ignore */
    }
  }

  // ── 转换 ──

  /**
   * 执行状态转换。
   * @returns true 如果转换成功，false 如果是非法转换
   */
  transition(to: LoopPhase): boolean {
    const from = this.state.phase;
    if (!VALID_TRANSITIONS[from].includes(to)) {
      return false;
    }

    this.state.phase = to;
    this.state.transition_seq++;

    // 自动设置 kickstart 标志
    this.state.needs_kickstart = to === 'execute' || to === 'redesign';

    // 设置 phase switch（供 chat.message hook 消费）
    this.state.pending_switch = {
      phase: to,
      agent: this.effectiveAgent,
      think: to === 'redesign' ? 'max' : to === 'review' ? 'high' : 'inherit',
    };

    this.persist();
    return true;
  }

  // ── 派生属性 ──

  /** 当前阶段对应的有效 agent */
  get effectiveAgent(): string {
    switch (this.state.phase) {
      case 'interview':
        return 'prometheus';
      case 'redesign':
        return 'prometheus';
      case 'review':
        return 'reviewer';
      case 'execute':
        return this.state.executor_type;
      default:
        return this.state.return_agent;
    }
  }

  /** 当前阶段对应的 overlay phase */
  get overlayPhase(): string {
    switch (this.state.phase) {
      case 'interview':
        return 'plan';
      case 'redesign':
        return 'plan';
      case 'review':
        return 'review';
      case 'execute':
        return 'execute';
      default:
        return 'execute';
    }
  }

  /** 是否需要注入 kickstart 提示词（消费后清除） */
  get needsKickstart(): boolean {
    return (
      this.state.needs_kickstart &&
      this.state.last_kickstart_seq < this.state.transition_seq
    );
  }

  // ── Kickstart ──

  /**
   * 消费 kickstart 标志并返回要注入的提示词。
   * 幂等：同一 transition_seq 只返回一次。
   */
  consumeKickstart(): string | null {
    if (!this.needsKickstart) return null;

    this.state.last_kickstart_seq = this.state.transition_seq;
    this.state.needs_kickstart = false;
    this.persist();

    if (this.state.phase === 'interview') {
      return `## Loop: Interview Phase

You are prometheus (planner) in an autonomous Loop. **Do NOT stop to ask the user for confirmation.**

Your task:
1. Explore the codebase using read, glob, grep — find all needed information yourself
2. If you absolutely need clarification, use the Question tool (non-blocking, keep working)
3. Create a detailed, structured plan based on your findings
4. Call save_plan to persist it
5. Call /ol-plan-exit immediately — the loop handles the transition to execute

**CRITICAL**: Do NOT present findings to the user and wait for approval. Just plan, save, and exit.
Loop ID: ${this.state.loop_id} | Iteration: ${this.state.iteration}/${this.state.max_iterations}`;
    }

    if (this.state.phase === 'execute') {
      return `## Loop: Execute Phase

The planner has saved the plan. You are the executor (${this.state.executor_type}).
1. Read the plan from .opencode/extendai-lab/plans/
2. Create a todo list from the plan tasks
3. Execute each task systematically
4. Call task_complete when all work is done

Loop ID: ${this.state.loop_id} | Iteration: ${this.state.iteration}/${this.state.max_iterations}`;
    }

    if (this.state.phase === 'redesign') {
      return `## Loop: Redesign Phase

The reviewer rejected the plan for major rework. You are the internal planner (autonomous mode).

Your task:
1. Read the review feedback above carefully — every finding must be addressed
2. Use task(explorer) to search the codebase for relevant context
3. Use task(librarian) to check external documentation
4. Use task(oracle) for architectural guidance
5. Create a revised plan that addresses ALL findings
6. Call save_plan when done — the loop system handles the transition back to execute

CRITICAL: Do NOT ask the user questions. All investigation is autonomous.
Loop ID: ${this.state.loop_id} | Iteration: ${this.state.iteration}/${this.state.max_iterations}`;
    }

    return null;
  }

  // ── Phase Switch ──

  /** 消费 phase switch（供 chat.message hook 调用） */
  consumePhaseSwitch(): {
    phase: string;
    agent: string;
    think?: string;
  } | null {
    const sw = this.state.pending_switch;
    if (!sw) return null;
    this.state.pending_switch = null;
    this.persist();
    return sw;
  }

  // ── Verdict ──

  /** 记录审查结果并路由到下一阶段 */
  handleVerdict(
    verdict: string,
    scope?: string,
    findings?: string,
  ): { phase: LoopPhase; agent: string; message?: string } | null {
    // 记录
    this.state.verdict_history.push({
      phase: this.state.phase,
      verdict,
      scope,
      timestamp: Date.now(),
    });

    if (verdict === 'approve') {
      return { phase: 'done', agent: this.state.return_agent };
    }

    if (verdict === 'reject') {
      if (scope === 'planner') {
        const next = this.state.iteration + 1;
        if (next > this.state.max_iterations) {
          this.transition('done');
          return {
            phase: 'done',
            agent: this.state.return_agent,
            message: 'Max iterations reached',
          };
        }
        this.state.iteration = next;
        this.transition('redesign');
        return { phase: 'redesign', agent: 'prometheus', message: findings };
      }
      // scope=executor: 回到 execute
      this.transition('execute');
      return {
        phase: 'execute',
        agent: this.state.executor_type,
        message: findings,
      };
    }

    return null;
  }

  /** 进入 review 阶段 */
  enterReview(): boolean {
    return this.transition('review');
  }

  // ── 内部 plan 路径 ──

  get internalPlanDir(): string {
    return getInternalPlanDir(this.workspaceRoot, this.state.loop_id);
  }

  get internalPlanPath(): string {
    return join(this.internalPlanDir, 'plan.md');
  }

  ensureInternalPlanDir(): void {
    const dir = this.internalPlanDir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

// ──────────────────────────────────────────
// 兼容性导出（保持现有 API 可用）
// ──────────────────────────────────────────

let _activeFsm: LoopStateMachine | null = null;

function getOrRecover(): LoopStateMachine | null {
  // Always read from disk for correctness (no in-memory cache that
  // would cause test isolation issues or stale state after restart).
  return LoopStateMachine.recover();
}

/** Reset module state — for tests only */
export function resetLoopModule(): void {
  _activeFsm = null;
}

export function createLoop(
  description: string,
  executor_type: string,
  return_agent: string,
  max_iterations?: number,
): LoopStateMachine {
  _activeFsm = LoopStateMachine.create(
    description,
    executor_type,
    return_agent,
    undefined,
    max_iterations,
  );
  return _activeFsm;
}

export function getLoop(): LoopStateMachine | null {
  return getOrRecover();
}

export function isLoopActive(): boolean {
  const fsm = getOrRecover();
  return fsm !== null && fsm.state.phase !== 'done';
}

export function deleteLoop(): void {
  if (_activeFsm) {
    _activeFsm.destroy();
    _activeFsm = null;
  }
}

/** @deprecated 使用 fsm.transition() 代替 */
export function updateLoop(_updates: Record<string, unknown>): void {
  // 保留兼容，但实际应通过 FSM 方法操作
  const fsm = getOrRecover();
  if (!fsm) return;
  if (_updates.phase && typeof _updates.phase === 'string') {
    fsm.transition(_updates.phase as LoopPhase);
  }
  if (typeof _updates.iteration === 'number') {
    fsm.state.iteration = _updates.iteration;
    fsm.persist();
  }
}

/**
 * 标记 loop kickstart（由 plan-mode 的 autoExitPlanMode 调用）。
 * 现在改为直接通过 FSM transition + consumeKickstart 处理，
 * 不再需要单独的 kickstart Map。
 */
export function markLoopKickstart(
  _sessionID: string,
  _phase: string,
  _agent: string,
  _extra?: string,
): void {
  // FSM 在 transition('execute') 时自动设置 needs_kickstart。
  // 此函数保留兼容，实际不再使用。
}

/**
 * 消费 loop kickstart（由 todo-continuation 的 session.idle 调用）。
 * 现在改为直接调用 fsm.consumeKickstart()。
 */
export function consumeLoopKickstart(_sessionID: string): string | null {
  const fsm = getOrRecover();
  if (!fsm) return null;
  return fsm.consumeKickstart();
}

/** @deprecated 使用 fsm.handleVerdict() 代替 */
export function routeVerdict(
  verdict: string,
  scope?: string,
  fixInstructions?: string,
): { phase: LoopPhase; agent?: string; fixInstructions?: string } | null {
  const fsm = getOrRecover();
  if (!fsm) return null;
  const result = fsm.handleVerdict(verdict, scope, fixInstructions);
  if (!result) return null;
  return {
    phase: result.phase,
    agent: result.agent,
    fixInstructions: result.message,
  };
}

export function classifyTaskExecutor(description: string): string {
  const lower = description.toLowerCase();
  if (
    lower.includes('rna') ||
    lower.includes('基因') ||
    lower.includes('dna') ||
    lower.includes('蛋白') ||
    lower.includes('生物') ||
    lower.includes('genome') ||
    lower.includes('seq') ||
    lower.includes('转录') ||
    lower.includes('pca') ||
    lower.includes('聚类')
  ) {
    return 'bio-orchestrator';
  }
  if (
    lower.includes('化学') ||
    lower.includes('分子') ||
    lower.includes('反应') ||
    lower.includes('material') ||
    lower.includes('chemistry') ||
    lower.includes('reaction') ||
    lower.includes('synthesis') ||
    lower.includes('catalyst') ||
    lower.includes('compound')
  ) {
    return 'chem-orchestrator';
  }
  return 'engineer';
}

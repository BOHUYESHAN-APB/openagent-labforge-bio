/**
 * Loop 框架
 *
 * 管理循环执行的状态、阶段切换、迭代控制。
 *
 * 状态文件: .opencode/loops/active.json
 * 内部 plan: .opencode/loops/plans/{loop_id}/plan.md
 *
 * 生命周期:
 *   /ol-loop-start "xxx"
 *     → createLoop() → phase=interview → planner 问用户
 *     → save_plan → auto-exit → phase=execute
 *     → executor 执行 → todos done → auto-review
 *     → verdict 路由:
 *       approve → loop_done()
 *       reject+executor → phase=execute (fix)
 *       reject+planner → phase=redesign (replan)
 *     → redesign: planner 自主调子代理
 *     → 循环直到 approve 或 max_iterations
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { injectPhaseSwitch } from '../phase-switch';

// ──────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────

export interface LoopState {
  loop_id: string;
  description: string;
  phase: 'interview' | 'execute' | 'review' | 'redesign' | 'done';
  executor_type: string; // engineer | bio-orch | chem-orch | deep-worker
  return_agent: string;
  plan_path_original?: string; // 用户可见 plan（第一轮）
  plan_path_internal?: string; // 内部不可见 plan（重做时）
  iteration: number;
  max_iterations: number;
  verdict_history: Array<{
    phase: string;
    verdict: string;
    scope?: string;
    timestamp: number;
  }>;
  created_at: number;
  updated_at: number;
}

// ──────────────────────────────────────────
// 路径
// ──────────────────────────────────────────

const LOOP_DIR = '.opencode/loops';
const PLANS_DIR = join(LOOP_DIR, 'plans');

function getLoopStatePath(workspaceRoot: string): string {
  return join(workspaceRoot, LOOP_DIR, 'active.json');
}

function getInternalPlanDir(workspaceRoot: string, loop_id: string): string {
  return join(workspaceRoot, PLANS_DIR, loop_id);
}

/** 获取 workspace root（从 cwd 向上找 .opencode） */
function findWorkspaceRoot(): string {
  // 用当前工作目录
  // 生产环境应该从 session 配置读取
  return process.cwd();
}

// ──────────────────────────────────────────
// CRUD
// ──────────────────────────────────────────

export function createLoop(description: string, executor_type: string, return_agent: string): LoopState {
  const now = Date.now();
  const loop: LoopState = {
    loop_id: `loop_${now.toString(36)}`,
    description,
    phase: 'interview',
    executor_type,
    return_agent,
    iteration: 1,
    max_iterations: 3,
    verdict_history: [],
    created_at: now,
    updated_at: now,
  };

  const workspaceRoot = findWorkspaceRoot();
  const statePath = getLoopStatePath(workspaceRoot);
  const dir = dirname(statePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(statePath, JSON.stringify(loop, null, 2), 'utf-8');

  return loop;
}

export function getLoop(): LoopState | null {
  const workspaceRoot = findWorkspaceRoot();
  const statePath = getLoopStatePath(workspaceRoot);
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, 'utf-8')) as LoopState;
  } catch {
    return null;
  }
}

export function updateLoop(updates: Partial<LoopState>): LoopState | null {
  const loop = getLoop();
  if (!loop) return null;
  Object.assign(loop, updates, { updated_at: Date.now() });
  const workspaceRoot = findWorkspaceRoot();
  writeFileSync(getLoopStatePath(workspaceRoot), JSON.stringify(loop, null, 2), 'utf-8');
  return loop;
}

export function deleteLoop(): void {
  const workspaceRoot = findWorkspaceRoot();
  const statePath = getLoopStatePath(workspaceRoot);
  try {
    if (existsSync(statePath)) unlinkSync(statePath);
  } catch {
    // ignore cleanup errors
  }
}

/** Check if a loop is active */
export function isLoopActive(): boolean {
  return getLoop() !== null;
}

// ──────────────────────────────────────────
// 阶段路由
// ──────────────────────────────────────────

/**
 * 根据 verdict 路由到下一个阶段
 * 返回要注入的 phase switch 消息参数
 */
export function routeVerdict(
  verdict: string,
  scope?: string,
  fixInstructions?: string,
): { phase: LoopState['phase']; agent?: string; fixInstructions?: string } | null {
  const loop = getLoop();
  if (!loop) return null;

  switch (verdict) {
    case 'approve':
      deleteLoop();
      return { phase: 'done', agent: loop.return_agent };

    case 'reject':
      if (scope === 'planner') {
        // 重做：迭代计数 + 1
        const nextIter = loop.iteration + 1;
        if (nextIter > loop.max_iterations) {
          // 超过上限，强制退出
          deleteLoop();
          return { phase: 'done', agent: loop.return_agent, fixInstructions: 'Max loop iterations reached' };
        }
        updateLoop({ phase: 'redesign', iteration: nextIter });
        return { phase: 'redesign', agent: 'prometheus' };
      }
      // scope=executor 或默认：直接修
      updateLoop({ phase: 'execute' });
      return { phase: 'execute', agent: loop.executor_type, fixInstructions };

    case 'needs_user':
    case 'blocked':
      // 需要用户介入，暂停循环但保持状态
      return { phase: 'execute', agent: loop.return_agent, fixInstructions: `Loop paused: ${verdict}` };

    default:
      return null;
  }
}

/**
 * 根据任务描述判断 executor 类型
 */
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
    lower.includes('chemistry')
  ) {
    return 'chem-orchestrator';
  }
  return 'engineer';
}

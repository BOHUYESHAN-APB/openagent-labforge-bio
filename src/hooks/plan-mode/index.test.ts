/**
 * Plan-mode hook 测试
 *
 * 测试 auto-exit、agent 切换注入、deny 逻辑
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import type { EffectiveAgentOverlayManager } from '../../utils/effective-agent-overlay';
import { createPlanModeHook } from './index';

// ──────────────────────────────────────────
// Mock overlay manager
// ──────────────────────────────────────────

function createMockOverlayManager(initialState?: {
  phase?: string;
  agent?: string;
  returnAgent?: string;
}) {
  let current = initialState
    ? {
        phase: initialState.phase ?? 'plan',
        agent: initialState.agent ?? 'prometheus',
        source: 'test',
        returnAgent: initialState.returnAgent ?? 'engineer',
      }
    : null;

  return {
    getCurrent: () => current,
    activate: (sessionID: string, overlay: Record<string, unknown>) => {
      current = overlay as typeof current;
    },
    clear: (sessionID: string, phase: string) => {
      current = null;
    },
  } as EffectiveAgentOverlayManager;
}

function createMockGetCurrentAgent(agent = 'engineer') {
  return () => agent;
}

// ──────────────────────────────────────────
// 测试: auto-exit 在 write/edit/bash 时触发
// ──────────────────────────────────────────

describe('plan-mode auto-exit', () => {
  test('write in plan mode triggers auto-exit and returns returnAgent in error', () => {
    const overlayManager = createMockOverlayManager({
      phase: 'plan',
      agent: 'prometheus',
      returnAgent: 'engineer',
    });
    const hook = createPlanModeHook({
      overlayManager,
      getCurrentAgent: createMockGetCurrentAgent(),
    });

    const output: { args?: Record<string, unknown> } = {};
    hook['tool.execute.before']({ tool: 'write', sessionID: 's1' }, output);

    expect(output.args).toBeDefined();
    expect(output.args!._denied).toBe(true);
    const error = output.args!.error as string;
    expect(error).toContain('Auto-exited');
    expect(error).toContain('Returning to engineer');

    // Overlay should be cleared
    expect(overlayManager.getCurrent()).toBeNull();
  });

  test('edit in plan mode triggers auto-exit', () => {
    const overlayManager = createMockOverlayManager({
      phase: 'plan',
      agent: 'prometheus',
      returnAgent: 'bio-orchestrator',
    });
    const hook = createPlanModeHook({
      overlayManager,
      getCurrentAgent: createMockGetCurrentAgent(),
    });

    const output: { args?: Record<string, unknown> } = {};
    hook['tool.execute.before']({ tool: 'edit', sessionID: 's1' }, output);

    expect(output.args!._denied).toBe(true);
    expect(output.args!.error as string).toContain('bio-orchestrator');
  });

  test('bash in plan mode triggers auto-exit', () => {
    const overlayManager = createMockOverlayManager({
      phase: 'plan',
      agent: 'prometheus',
      returnAgent: 'engineer',
    });
    const hook = createPlanModeHook({
      overlayManager,
      getCurrentAgent: createMockGetCurrentAgent(),
    });

    const output: { args?: Record<string, unknown> } = {};
    hook['tool.execute.before']({ tool: 'bash', sessionID: 's1' }, output);

    expect(output.args!._denied).toBe(true);
  });

  test('no auto-exit when no plan overlay active', () => {
    const overlayManager = createMockOverlayManager(); // null overlay
    const hook = createPlanModeHook({
      overlayManager,
      getCurrentAgent: createMockGetCurrentAgent(),
    });

    const output: { args?: Record<string, unknown> } = {};
    hook['tool.execute.before']({ tool: 'write', sessionID: 's1' }, output);

    // No denial - write proceeds normally
    expect(output.args).toBeUndefined();
  });
});

// ──────────────────────────────────────────
// 测试: enter_plan_mode / exit_plan_mode
// ──────────────────────────────────────────

describe('plan-mode enter/exit', () => {
  test('enter_plan_mode injects phase switch and activates overlay', () => {
    const overlayManager = createMockOverlayManager(); // null
    const hook = createPlanModeHook({
      overlayManager,
      getCurrentAgent: createMockGetCurrentAgent('engineer'),
    });

    const output: { args?: Record<string, unknown> } = {};
    hook['tool.execute.before'](
      { tool: 'enter_plan_mode', sessionID: 's1' },
      output,
    );

    // Overlay activated
    const overlay = overlayManager.getCurrent();
    expect(overlay).not.toBeNull();
    expect(overlay!.agent).toBe('prometheus');
    expect(overlay!.returnAgent).toBe('engineer');
  });

  test('exit_plan_mode clears overlay', () => {
    const overlayManager = createMockOverlayManager({
      phase: 'plan',
      agent: 'prometheus',
      returnAgent: 'engineer',
    });
    const hook = createPlanModeHook({
      overlayManager,
      getCurrentAgent: createMockGetCurrentAgent(),
    });

    const output: { args?: Record<string, unknown> } = {};
    hook['tool.execute.before'](
      { tool: 'exit_plan_mode', sessionID: 's1' },
      output,
    );

    expect(overlayManager.getCurrent()).toBeNull();
  });
});

// ──────────────────────────────────────────
// 测试: select_agent 拦截
// ──────────────────────────────────────────

describe('select_agent interception', () => {
  test('blocks manual reviewer selection when no loop active', () => {
    const overlayManager = createMockOverlayManager(); // null
    const hook = createPlanModeHook({
      overlayManager,
      getCurrentAgent: createMockGetCurrentAgent(),
    });

    const output: { args?: Record<string, unknown> } = {
      args: { name: 'reviewer' },
    };
    hook['tool.execute.before'](
      { tool: 'select_agent', sessionID: 's1' },
      output,
    );

    expect(output.args!._denied).toBe(true);
    expect(output.args!.error as string).toContain('loop-managed');
  });

  test('allows non-reviewer agent selection', () => {
    const overlayManager = createMockOverlayManager(); // null
    const hook = createPlanModeHook({
      overlayManager,
      getCurrentAgent: createMockGetCurrentAgent(),
    });

    const output: { args?: Record<string, unknown> } = {
      args: { name: 'explorer' },
    };
    hook['tool.execute.before'](
      { tool: 'select_agent', sessionID: 's1' },
      output,
    );

    expect(output.args!._denied).toBeUndefined();
  });
});

/**
 * Phase-switch 基础设施测试
 */
import { describe, expect, test } from 'bun:test';
import {
  buildPhaseSwitchText,
  getThinkLevel,
  injectPhaseSwitch,
  resolveThinkingEffort,
  tryConsumePhaseSwitch,
} from './index';

describe('buildPhaseSwitchText', () => {
  test('builds minimal message with phase and agent', () => {
    const text = buildPhaseSwitchText({
      phase: 'execute',
      agent: 'engineer',
    });
    expect(text).toBe('[phase:execute|agent:engineer]');
  });

  test('includes think level when provided', () => {
    const text = buildPhaseSwitchText({
      phase: 'review',
      agent: 'reviewer',
      think: 'high',
    });
    expect(text).toBe('[phase:review|agent:reviewer|think:high]');
  });

  test('includes extras: fixInstructions and returnAgent', () => {
    const text = buildPhaseSwitchText({
      phase: 'redesign',
      agent: 'prometheus',
      think: 'max',
      extras: {
        returnAgent: 'engineer',
        fixInstructions: 'scope=planner, design needs restructuring',
      },
    });
    expect(text).toContain('[phase:redesign|agent:prometheus|think:max');
    expect(text).toContain('fix:scope=planner, design needs restructuring');
    expect(text).toContain('return:engineer');
  });
});

describe('injectPhaseSwitch / tryConsumePhaseSwitch', () => {
  test('inject and consume roundtrip', () => {
    injectPhaseSwitch('session-1', {
      phase: 'interview',
      agent: 'prometheus',
      think: 'max',
    });

    const msg = tryConsumePhaseSwitch('session-1');
    expect(msg).toBeDefined();
    expect(msg!.phase).toBe('interview');
    expect(msg!.agent).toBe('prometheus');
    expect(msg!.think).toBe('max');
  });

  test('consume clears the pending switch', () => {
    injectPhaseSwitch('session-2', {
      phase: 'execute',
      agent: 'engineer',
    });

    const first = tryConsumePhaseSwitch('session-2');
    expect(first).toBeDefined();

    const second = tryConsumePhaseSwitch('session-2');
    expect(second).toBeUndefined();
  });

  test('non-existent session returns undefined', () => {
    const msg = tryConsumePhaseSwitch('non-existent');
    expect(msg).toBeUndefined();
  });

  test('latest injection overrides previous one for same session', () => {
    injectPhaseSwitch('session-3', {
      phase: 'interview',
      agent: 'prometheus',
    });
    injectPhaseSwitch('session-3', {
      phase: 'execute',
      agent: 'bio-orch',
    });

    const msg = tryConsumePhaseSwitch('session-3');
    expect(msg!.phase).toBe('execute');
    expect(msg!.agent).toBe('bio-orch');
  });

  test('sessions are independent', () => {
    injectPhaseSwitch('session-a', { phase: 'interview', agent: 'prometheus' });
    injectPhaseSwitch('session-b', { phase: 'execute', agent: 'engineer' });

    expect(tryConsumePhaseSwitch('session-a')!.phase).toBe('interview');
    expect(tryConsumePhaseSwitch('session-b')!.phase).toBe('execute');
    // Second consume for each returns undefined
    expect(tryConsumePhaseSwitch('session-a')).toBeUndefined();
    expect(tryConsumePhaseSwitch('session-b')).toBeUndefined();
  });
});

describe('getThinkLevel', () => {
  test('planner interview → max', () => {
    expect(getThinkLevel('interview', 'prometheus')).toBe('max');
  });

  test('planner redesign → max', () => {
    expect(getThinkLevel('redesign', 'prometheus')).toBe('max');
  });

  test('reviewer → high', () => {
    expect(getThinkLevel('review', 'reviewer')).toBe('high');
  });

  test('execute → inherit (wildcard *)', () => {
    expect(getThinkLevel('execute', 'engineer')).toBe('inherit');
    expect(getThinkLevel('execute', 'bio-orchestrator')).toBe('inherit');
  });

  test('done → inherit', () => {
    expect(getThinkLevel('done', 'engineer')).toBe('inherit');
  });

  test('compaction → high', () => {
    expect(getThinkLevel('compaction', '*')).toBe('high');
  });

  test('unknown phase → inherit', () => {
    expect(getThinkLevel('unknown', 'anything')).toBe('inherit');
  });

  test('undefined phase → inherit', () => {
    expect(getThinkLevel(undefined, 'engineer')).toBe('inherit');
  });
});

describe('resolveThinkingEffort', () => {
  test('max on deepseek → high (deepseek highest)', () => {
    expect(resolveThinkingEffort('max', 'deepseek/deepseek-v4')).toBe('high');
    expect(resolveThinkingEffort('max', 'deepseek-reasoner')).toBe('high');
  });

  test('max on claude → max', () => {
    expect(
      resolveThinkingEffort('max', 'anthropic/claude-sonnet-4-20250514'),
    ).toBe('max');
  });

  test('max on default → max', () => {
    expect(resolveThinkingEffort('max', 'openai/gpt-5')).toBe('max');
    expect(resolveThinkingEffort('max', undefined)).toBe('max');
  });

  test('max on gemini → high', () => {
    expect(resolveThinkingEffort('max', 'gemini/gemini-2.5-pro')).toBe('high');
  });

  test('high → high (passthrough)', () => {
    expect(resolveThinkingEffort('high', 'any/model')).toBe('high');
  });

  test('inherit → undefined (no change)', () => {
    expect(resolveThinkingEffort('inherit', 'any/model')).toBeUndefined();
  });

  test('none → undefined', () => {
    expect(resolveThinkingEffort('none', 'any/model')).toBeUndefined();
  });

  test('undefined level → undefined', () => {
    expect(resolveThinkingEffort(undefined, 'any/model')).toBeUndefined();
  });

  test('xhigh equals max on deepseek', () => {
    expect(resolveThinkingEffort('xhigh', 'deepseek/deepseek-v4')).toBe('high');
  });
});

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  clearGoal,
  getGoal,
  hasGoal,
  incrementGoalReact,
  parseVerdict,
  setGoal,
  buildJudgePrompt,
  buildGoalReentryPrompt,
  MAX_GOAL_REACT,
} from './index';

// Clean up goal state between tests
beforeEach(() => {
  // Clear all goals by clearing known sessions
  // (in-memory map, so we just test fresh state)
});

describe('Goal State Management', () => {
  test('setGoal creates goal state', () => {
    setGoal('session-1', 'All tests pass');
    const goal = getGoal('session-1');
    expect(goal).toBeDefined();
    expect(goal?.condition).toBe('All tests pass');
    expect(goal?.reactCount).toBe(0);
  });

  test('hasGoal returns true when goal is set', () => {
    setGoal('session-1', 'All tests pass');
    expect(hasGoal('session-1')).toBe(true);
  });

  test('hasGoal returns false when no goal', () => {
    expect(hasGoal('session-none')).toBe(false);
  });

  test('clearGoal removes the goal', () => {
    setGoal('session-1', 'All tests pass');
    clearGoal('session-1');
    expect(hasGoal('session-1')).toBe(false);
    expect(getGoal('session-1')).toBeUndefined();
  });

  test('incrementGoalReact increments counter', () => {
    setGoal('session-1', 'All tests pass');
    expect(incrementGoalReact('session-1')).toBe(1);
    expect(incrementGoalReact('session-1')).toBe(2);
    expect(incrementGoalReact('session-1')).toBe(3);
  });

  test('incrementGoalReact returns 0 for unknown session', () => {
    expect(incrementGoalReact('session-none')).toBe(0);
  });

  test('MAX_GOAL_REACT is 12', () => {
    expect(MAX_GOAL_REACT).toBe(12);
  });

  test('different sessions have independent goals', () => {
    setGoal('session-1', 'Goal A');
    setGoal('session-2', 'Goal B');
    expect(getGoal('session-1')?.condition).toBe('Goal A');
    expect(getGoal('session-2')?.condition).toBe('Goal B');
    clearGoal('session-1');
    expect(hasGoal('session-1')).toBe(false);
    expect(hasGoal('session-2')).toBe(true);
  });
});

describe('parseVerdict', () => {
  test('parses JSON verdict with ok: true', () => {
    const result = parseVerdict('{"ok": true, "reason": "All tests pass"}');
    expect(result).toEqual({ ok: true, reason: 'All tests pass' });
  });

  test('parses JSON verdict with ok: false', () => {
    const result = parseVerdict('{"ok": false, "reason": "Tests failing"}');
    expect(result).toEqual({ ok: false, reason: 'Tests failing' });
  });

  test('parses JSON verdict with impossible', () => {
    const result = parseVerdict(
      '{"ok": false, "impossible": true, "reason": "Cannot reach API"}',
    );
    expect(result).toEqual({
      ok: false,
      impossible: true,
      reason: 'Cannot reach API',
    });
  });

  test('parses [approve] text', () => {
    const result = parseVerdict('[APPROVE] All requirements met');
    expect(result?.ok).toBe(true);
  });

  test('parses [goal met] text', () => {
    const result = parseVerdict('[GOAL MET] Done');
    expect(result?.ok).toBe(true);
  });

  test('parses [not yet] text', () => {
    const result = parseVerdict('[NOT YET] Still need to fix tests');
    expect(result?.ok).toBe(false);
    expect(result?.impossible).toBeUndefined();
  });

  test('parses [impossible] text', () => {
    const result = parseVerdict('[IMPOSSIBLE] API is down');
    expect(result?.ok).toBe(false);
    expect(result?.impossible).toBe(true);
  });

  test('returns null for unparseable output', () => {
    const result = parseVerdict('I have reviewed the code and it looks good');
    expect(result).toBeNull();
  });

  test('handles JSON embedded in text', () => {
    const result = parseVerdict(
      'Here is my verdict: {"ok": true, "reason": "Done"} based on my review.',
    );
    expect(result?.ok).toBe(true);
  });
});

describe('buildJudgePrompt', () => {
  test('includes the goal condition', () => {
    const prompt = buildJudgePrompt('All tests pass and lint is clean');
    expect(prompt).toContain('All tests pass and lint is clean');
  });

  test('instructs to return JSON', () => {
    const prompt = buildJudgePrompt('Goal');
    expect(prompt).toContain('"ok"');
    expect(prompt).toContain('"reason"');
  });

  test('warns about partial completion', () => {
    const prompt = buildJudgePrompt('Goal');
    expect(prompt.toLowerCase()).toContain('partial completion is not success');
  });
});

describe('buildGoalReentryPrompt', () => {
  test('includes judge reason', () => {
    const verdict = { ok: false, reason: 'Tests still failing' };
    const prompt = buildGoalReentryPrompt(verdict);
    expect(prompt).toContain('Tests still failing');
  });

  test('wrapped in system-reminder', () => {
    const verdict = { ok: false, reason: 'Not done' };
    const prompt = buildGoalReentryPrompt(verdict);
    expect(prompt).toContain('<system-reminder>');
    expect(prompt).toContain('</system-reminder>');
  });

  test('tells agent to continue working', () => {
    const verdict = { ok: false, reason: 'Not done' };
    const prompt = buildGoalReentryPrompt(verdict);
    expect(prompt).toContain('Continue working');
  });
});

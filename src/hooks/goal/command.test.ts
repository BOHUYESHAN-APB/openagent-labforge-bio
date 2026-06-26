import { describe, expect, test } from 'bun:test';
import { handleGoalCommand } from './command';
import { hasGoal, getGoal } from './index';

describe('handleGoalCommand', () => {
  test('set goal with condition', () => {
    const result = handleGoalCommand('All tests pass', 'session-1');
    expect(result.action).toBe('set');
    expect(result.condition).toBe('All tests pass');
    expect(result.message).toContain('Goal set');
    expect(hasGoal('session-1')).toBe(true);
  });

  test('clear goal with "clear" argument', () => {
    handleGoalCommand('Some goal', 'session-1');
    const result = handleGoalCommand('clear', 'session-1');
    expect(result.action).toBe('clear');
    expect(hasGoal('session-1')).toBe(false);
  });

  test('clear goal with no arguments', () => {
    handleGoalCommand('Some goal', 'session-1');
    const result = handleGoalCommand('', 'session-1');
    expect(result.action).toBe('clear');
    expect(hasGoal('session-1')).toBe(false);
  });

  test('set goal with complex condition', () => {
    const condition =
      'All tests pass, lint is clean, and documentation is updated';
    const result = handleGoalCommand(condition, 'session-1');
    expect(result.action).toBe('set');
    expect(result.condition).toBe(condition);
  });

  test('goal message mentions independent judge', () => {
    const result = handleGoalCommand('Done', 'session-1');
    expect(result.message).toContain('independent judge');
  });

  test('clear message confirms clearing', () => {
    const result = handleGoalCommand('clear', 'session-1');
    expect(result.message).toContain('Goal cleared');
  });

  test('different sessions have independent goals', () => {
    handleGoalCommand('Goal A', 'session-1');
    handleGoalCommand('Goal B', 'session-2');
    expect(getGoal('session-1')?.condition).toBe('Goal A');
    expect(getGoal('session-2')?.condition).toBe('Goal B');
  });

  test('overwriting goal replaces condition', () => {
    handleGoalCommand('Old goal', 'session-1');
    handleGoalCommand('New goal', 'session-1');
    expect(getGoal('session-1')?.condition).toBe('New goal');
  });
});

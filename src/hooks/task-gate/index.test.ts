import { describe, expect, test } from 'bun:test';
import {
  type Decision,
  type GateMode,
  decideStopGate,
  MAX_TASK_GATE_MAIN_REACT,
  MAX_TASK_GATE_SUBAGENT_REACT,
} from './index';

function makeTodo(
  id: string,
  status: string,
  summary?: string,
): { id: string; status: string; summary?: string } {
  return { id, status, summary };
}

describe('decideStopGate', () => {
  describe('no incomplete tasks', () => {
    test('empty list → no reentry', () => {
      const result = decideStopGate({
        incompleteTodos: [],
        reactCount: 0,
        maxReact: 3,
        mode: 'main',
      });
      expect(result.needReentry).toBe(false);
      expect(result.capExceeded).toBe(false);
      expect(result.incompleteTasks).toEqual([]);
    });

    test('all completed → no reentry', () => {
      const result = decideStopGate({
        incompleteTodos: [
          makeTodo('T1', 'completed', 'Task 1'),
          makeTodo('T2', 'completed', 'Task 2'),
        ],
        reactCount: 0,
        maxReact: 3,
        mode: 'main',
      });
      expect(result.needReentry).toBe(false);
      expect(result.incompleteTasks).toEqual([]);
    });

    test('all cancelled → no reentry', () => {
      const result = decideStopGate({
        incompleteTodos: [
          makeTodo('T1', 'cancelled', 'Task 1'),
          makeTodo('T2', 'cancelled', 'Task 2'),
        ],
        reactCount: 0,
        maxReact: 3,
        mode: 'main',
      });
      expect(result.needReentry).toBe(false);
    });

    test('mixed completed and cancelled → no reentry', () => {
      const result = decideStopGate({
        incompleteTodos: [
          makeTodo('T1', 'completed'),
          makeTodo('T2', 'cancelled'),
        ],
        reactCount: 0,
        maxReact: 3,
        mode: 'main',
      });
      expect(result.needReentry).toBe(false);
    });
  });

  describe('incomplete tasks exist', () => {
    test('open tasks → need reentry', () => {
      const result = decideStopGate({
        incompleteTodos: [makeTodo('T1', 'open', 'Fix auth')],
        reactCount: 0,
        maxReact: 3,
        mode: 'main',
      });
      expect(result.needReentry).toBe(true);
      expect(result.capExceeded).toBe(false);
      expect(result.incompleteTasks).toEqual(['T1']);
    });

    test('in_progress tasks → need reentry', () => {
      const result = decideStopGate({
        incompleteTodos: [
          makeTodo('T1', 'in_progress', 'Implement login'),
        ],
        reactCount: 0,
        maxReact: 3,
        mode: 'main',
      });
      expect(result.needReentry).toBe(true);
      expect(result.incompleteTasks).toEqual(['T1']);
    });

    test('blocked tasks → NOT actionable (excluded)', () => {
      const result = decideStopGate({
        incompleteTodos: [makeTodo('T1', 'blocked', 'Waiting for API')],
        reactCount: 0,
        maxReact: 3,
        mode: 'main',
      });
      expect(result.needReentry).toBe(false);
      expect(result.incompleteTasks).toEqual([]);
    });

    test('mixed actionable and blocked → only actionable counted', () => {
      const result = decideStopGate({
        incompleteTodos: [
          makeTodo('T1', 'open', 'Fix bug'),
          makeTodo('T2', 'blocked', 'Waiting for deps'),
          makeTodo('T3', 'in_progress', 'Write tests'),
        ],
        reactCount: 0,
        maxReact: 3,
        mode: 'main',
      });
      expect(result.needReentry).toBe(true);
      expect(result.incompleteTasks).toEqual(['T1', 'T3']);
    });
  });

  describe('reentry cap', () => {
    test('below cap → need reentry', () => {
      const result = decideStopGate({
        incompleteTodos: [makeTodo('T1', 'open')],
        reactCount: 2,
        maxReact: 3,
        mode: 'main',
      });
      expect(result.needReentry).toBe(true);
      expect(result.capExceeded).toBe(false);
    });

    test('at cap → cap exceeded', () => {
      const result = decideStopGate({
        incompleteTodos: [makeTodo('T1', 'open')],
        reactCount: 3,
        maxReact: 3,
        mode: 'main',
      });
      expect(result.needReentry).toBe(false);
      expect(result.capExceeded).toBe(true);
      expect(result.incompleteTasks).toEqual(['T1']);
    });

    test('above cap → cap exceeded', () => {
      const result = decideStopGate({
        incompleteTodos: [makeTodo('T1', 'open')],
        reactCount: 5,
        maxReact: 3,
        mode: 'main',
      });
      expect(result.needReentry).toBe(false);
      expect(result.capExceeded).toBe(true);
    });

    test('subagent cap (2) is lower than main cap (3)', () => {
      expect(MAX_TASK_GATE_SUBAGENT_REACT).toBeLessThan(
        MAX_TASK_GATE_MAIN_REACT,
      );
    });
  });

  describe('reentry text', () => {
    test('main mode uses session-level language', () => {
      const result = decideStopGate({
        incompleteTodos: [makeTodo('T1', 'open', 'Fix auth')],
        reactCount: 0,
        maxReact: 3,
        mode: 'main',
      });
      expect(result.needReentry).toBe(true);
      const text = (result as { needReentry: true; reentryText: string })
        .reentryText;
      expect(text).toContain('in this session');
      expect(text).toContain('Then continue or respond');
    });

    test('subagent mode uses ownership language', () => {
      const result = decideStopGate({
        incompleteTodos: [makeTodo('T1', 'open', 'Fix auth')],
        reactCount: 0,
        maxReact: 2,
        mode: 'subagent',
      });
      expect(result.needReentry).toBe(true);
      const text = (result as { needReentry: true; reentryText: string })
        .reentryText;
      expect(text).toContain('tasks you own');
      expect(text).toContain('Status**/**Summary');
    });

    test('reentry text includes task details', () => {
      const result = decideStopGate({
        incompleteTodos: [
          makeTodo('T1', 'open', 'Implement login'),
          makeTodo('T2', 'in_progress', 'Write tests'),
        ],
        reactCount: 0,
        maxReact: 3,
        mode: 'main',
      });
      const text = (result as { needReentry: true; reentryText: string })
        .reentryText;
      expect(text).toContain('T1');
      expect(text).toContain('open');
      expect(text).toContain('Implement login');
      expect(text).toContain('T2');
      expect(text).toContain('in_progress');
      expect(text).toContain('Write tests');
    });

    test('reentry text includes task done/abandon instructions', () => {
      const result = decideStopGate({
        incompleteTodos: [makeTodo('T1', 'open', 'Fix bug')],
        reactCount: 0,
        maxReact: 3,
        mode: 'main',
      });
      const text = (result as { needReentry: true; reentryText: string })
        .reentryText;
      expect(text).toContain('task done <id> <summary>');
      expect(text).toContain('task abandon <id> <reason>');
    });
  });

  describe('edge cases', () => {
    test('reactCount=0, maxReact=1 → still allows one nudge', () => {
      const result = decideStopGate({
        incompleteTodos: [makeTodo('T1', 'open')],
        reactCount: 0,
        maxReact: 1,
        mode: 'main',
      });
      expect(result.needReentry).toBe(true);
    });

    test('reactCount=1, maxReact=1 → cap exceeded', () => {
      const result = decideStopGate({
        incompleteTodos: [makeTodo('T1', 'open')],
        reactCount: 1,
        maxReact: 1,
        mode: 'main',
      });
      expect(result.needReentry).toBe(false);
      expect(result.capExceeded).toBe(true);
    });

    test('todo without summary uses id as fallback', () => {
      const result = decideStopGate({
        incompleteTodos: [makeTodo('T1', 'open')],
        reactCount: 0,
        maxReact: 3,
        mode: 'main',
      });
      const text = (result as { needReentry: true; reentryText: string })
        .reentryText;
      expect(text).toContain('T1');
    });
  });
});

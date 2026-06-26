/**
 * Task Stop-Gate
 *
 * Prevents the agent from stopping when there are incomplete tasks.
 * Runs AFTER auto-continue detects all todos complete, BEFORE auto-review.
 *
 * Inspired by MiMo Code's task/gate.ts — a pure decision layer that checks
 * the task registry for non-terminal tasks and injects a nudge if needed.
 *
 * Re-entry caps:
 *   - Main session: 3 (configurable via loop.taskGateReentryCap)
 *   - Subagent: 2
 */

import { log as baseLog } from '../../utils/logger';

const HOOK_NAME = 'task-gate';
const log = (...args: unknown[]) => baseLog(`[${HOOK_NAME}]`, ...args);

// Re-entry caps
export const MAX_TASK_GATE_MAIN_REACT = 3;
export const MAX_TASK_GATE_SUBAGENT_REACT = 2;

export type GateMode = 'main' | 'subagent';

export type Decision =
  | { needReentry: false; capExceeded: false; incompleteTasks: [] }
  | {
      needReentry: true;
      reentryText: string;
      incompleteTasks: string[];
      capExceeded: false;
    }
  | {
      needReentry: false;
      capExceeded: true;
      incompleteTasks: string[];
    };

interface TodoItem {
  id: string;
  status: string;
  summary?: string;
}

const TERMINAL_STATUSES = ['completed', 'cancelled'];
const NON_ACTIONABLE_STATUSES = [...TERMINAL_STATUSES, 'blocked'];

/**
 * Decide whether to nudge the agent to continue or allow it to stop.
 *
 * Pure function — no side effects. Caller owns injection and cap-state.
 */
export function decideStopGate(input: {
  incompleteTodos: TodoItem[];
  reactCount: number;
  maxReact: number;
  mode: GateMode;
}): Decision {
  const actionable = input.incompleteTodos.filter(
    (t) => !NON_ACTIONABLE_STATUSES.includes(t.status),
  );

  if (actionable.length === 0) {
    return { needReentry: false, capExceeded: false, incompleteTasks: [] };
  }

  if (input.reactCount >= input.maxReact) {
    return {
      needReentry: false,
      capExceeded: true,
      incompleteTasks: actionable.map((t) => t.id),
    };
  }

  return {
    needReentry: true,
    reentryText: buildReentryText(actionable, input.mode),
    incompleteTasks: actionable.map((t) => t.id),
    capExceeded: false,
  };
}

function buildReentryText(todos: TodoItem[], mode: GateMode): string {
  const headline =
    mode === 'subagent'
      ? 'You are about to finish, these tasks you own are still unfinished:'
      : 'You are about to finish, but these tasks in this session are still unfinished:';

  const closing =
    mode === 'subagent'
      ? 'Then re-emit your final message starting with the **Status**/**Summary** header.'
      : 'Then continue or respond.';

  const lines = todos.map((t) => {
    const summary = t.summary || t.id;
    return `- ${t.id} (${t.status}): ${summary}`;
  });

  return `<system-reminder>
${headline}
${lines.join('\n')}
For EACH: complete the work then \`task done <id> <summary>\`, or \`task abandon <id> <reason>\` if it is genuinely not needed.
${closing}
</system-reminder>`;
}

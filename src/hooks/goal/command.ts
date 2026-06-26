/**
 * /goal command handler
 *
 * Sets a stopping condition for the current session.
 * Usage: /goal "All tests pass and lint is clean"
 */

import { clearGoal, setGoal } from './index';

export interface GoalCommandResult {
  action: 'set' | 'clear' | 'error';
  message: string;
  condition?: string;
}

export function handleGoalCommand(
  args: string,
  sessionId: string,
): GoalCommandResult {
  const trimmed = args.trim();

  // /goal (no args) → show current goal or clear
  if (!trimmed) {
    clearGoal(sessionId);
    return {
      action: 'clear',
      message:
        'Goal cleared. The agent will stop when it decides to, without external judgment.',
    };
  }

  // /goal clear
  if (trimmed.toLowerCase() === 'clear') {
    clearGoal(sessionId);
    return {
      action: 'clear',
      message: 'Goal cleared.',
    };
  }

  // /goal <condition>
  setGoal(sessionId, trimmed);
  return {
    action: 'set',
    message: `Goal set: "${trimmed}"\n\nThe agent will now run until an independent judge confirms this condition is met. The judge uses a separate LLM call to evaluate completion objectively.`,
    condition: trimmed,
  };
}

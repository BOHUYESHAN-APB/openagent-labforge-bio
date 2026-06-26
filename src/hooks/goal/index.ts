/**
 * Goal System
 *
 * Allows setting a stopping condition for a session. When the agent tries to
 * stop, an independent judge model evaluates whether the goal is truly met.
 *
 * Inspired by MiMo Code's session/goal.ts:
 * - Structured Verdict output from judge
 * - Re-entry when judge says "not yet"
 * - Cap on re-entries (fail-open on errors)
 */

import { log as baseLog } from '../../utils/logger';

const HOOK_NAME = 'goal';
const log = (...args: unknown[]) => baseLog(`[${HOOK_NAME}]`, ...args);

export const MAX_GOAL_REACT = 12;

export interface GoalState {
  sessionId: string;
  condition: string;
  reactCount: number;
  createdAt: number;
}

export interface Verdict {
  ok: boolean;
  impossible?: boolean;
  reason: string;
}

// In-memory goal state per session
const goalBySession = new Map<string, GoalState>();

export function setGoal(sessionId: string, condition: string): void {
  goalBySession.set(sessionId, {
    sessionId,
    condition,
    reactCount: 0,
    createdAt: Date.now(),
  });
  log('Goal set', { sessionId, condition });
}

export function getGoal(sessionId: string): GoalState | undefined {
  return goalBySession.get(sessionId);
}

export function clearGoal(sessionId: string): void {
  goalBySession.delete(sessionId);
  log('Goal cleared', { sessionId });
}

export function incrementGoalReact(sessionId: string): number {
  const goal = goalBySession.get(sessionId);
  if (!goal) return 0;
  goal.reactCount++;
  return goal.reactCount;
}

export function hasGoal(sessionId: string): boolean {
  return goalBySession.has(sessionId);
}

/**
 * Parse a structured Verdict from judge output.
 * Expected format: { ok: boolean, impossible?: boolean, reason: string }
 */
export function parseVerdict(text: string): Verdict | null {
  try {
    // Try JSON extraction first
    const jsonMatch = text.match(/\{[^}]*"ok"\s*:\s*(?:true|false)[^}]*\}/s);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Verdict;
      return {
        ok: parsed.ok,
        impossible: parsed.impossible,
        reason: parsed.reason || '',
      };
    }
  } catch {
    // Fall through to text patterns
  }

  // Fallback: text-based verdict patterns
  const lower = text.toLowerCase();
  if (lower.includes('[approve]') || lower.includes('[goal met]')) {
    return { ok: true, reason: text };
  }
  if (lower.includes('[impossible]') || lower.includes('[goal impossible]')) {
    return { ok: false, impossible: true, reason: text };
  }
  if (lower.includes('[not yet]') || lower.includes('[incomplete]')) {
    return { ok: false, reason: text };
  }

  return null;
}

/**
 * Build the judge system prompt.
 */
export function buildJudgePrompt(goalCondition: string): string {
  return `<Role>
You are an independent judge evaluating whether a goal has been achieved.
You are NOT the agent doing the work — you are a neutral evaluator.
</Role>

<Goal>
${goalCondition}
</Goal>

<Task>
Review the full conversation transcript and determine whether the goal has been achieved.
Be rigorous — partial completion is NOT success.

Return a JSON verdict:
- { "ok": true, "reason": "..." } if the goal is fully met (quote specific evidence)
- { "ok": false, "reason": "..." } if work remains (describe what's missing)
- { "ok": false, "impossible": true, "reason": "..." } if the goal is genuinely unachievable

Rules:
1. You MUST cite specific evidence from the transcript
2. "Almost done" or "mostly complete" = NOT ok
3. Tests passing = good evidence; no tests = weak evidence
4. If the agent stopped early without finishing, that is NOT ok
</Task>`;
}

/**
 * Build a re-entry prompt when judge says "not yet".
 */
export function buildGoalReentryPrompt(verdict: Verdict): string {
  return `<system-reminder>
The goal has NOT been met yet. An independent judge reviewed the work and found issues:

${verdict.reason}

Continue working to meet the goal. Do not stop until the judge approves.
</system-reminder>`;
}

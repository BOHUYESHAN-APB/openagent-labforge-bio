/**
 * Goal Gate
 *
 * Runs on session.idle when a goal is set. Evaluates completion via
 * an independent judge LLM call. Injects re-entry if not done.
 *
 * This is a SEPARATE handler from auto-continue — it doesn't modify
 * the todo-continuation hook. It only activates when a goal is set.
 */

import type { PluginInput } from '@opencode-ai/plugin';
import { log as baseLog } from '../../utils/logger';
import {
  clearGoal,
  getGoal,
  hasGoal,
  incrementGoalReact,
  type Verdict,
  buildGoalReentryPrompt,
  buildJudgePrompt,
  parseVerdict,
  MAX_GOAL_REACT,
} from './index';

const HOOK_NAME = 'goal-gate';
const log = (...args: unknown[]) => baseLog(`[${HOOK_NAME}]`, ...args);

interface GoalGateConfig {
  ctx: PluginInput;
}

/**
 * Handle session.idle for the goal gate.
 * Returns true if it handled the event (injected re-entry or allowed stop).
 */
export async function handleGoalGateIdle(
  config: GoalGateConfig,
  sessionId: string,
): Promise<boolean> {
  if (!hasGoal(sessionId)) return false;

  const goal = getGoal(sessionId);
  if (!goal) return false;

  log('Goal active, evaluating via judge', {
    sessionId,
    condition: goal.condition,
    reactCount: goal.reactCount,
  });

  // Check re-entry cap
  if (goal.reactCount >= MAX_GOAL_REACT) {
    log('Goal re-entry cap exceeded, allowing stop', { sessionId });
    clearGoal(sessionId);
    return false; // Don't block — allow normal stop flow
  }

  try {
    // Fetch conversation for judge evaluation
    const messagesResult = await config.ctx.client.session.messages({
      path: { id: sessionId },
    });
    const messages = messagesResult.data as Array<{
      info?: { role?: string };
      parts?: Array<{ text?: string }>;
    }>;

    // Build judge prompt with conversation context
    const transcript = messages
      .map((m) => {
        const role = m.info?.role ?? 'unknown';
        const text = m.parts?.map((p) => p.text ?? '').join(' ') ?? '';
        return `[${role}]: ${text}`;
      })
      .join('\n\n');

    const judgePrompt = buildJudgePrompt(goal.condition);
    const judgeInput = `${judgePrompt}\n\n<Transcript>\n${transcript}\n</Transcript>`;

    // Call judge LLM
    const judgeResult = await config.ctx.client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: 'text', text: judgeInput }],
      },
    });

    const judgeOutput =
      typeof judgeResult === 'string'
        ? judgeResult
        : JSON.stringify(judgeResult);

    const verdict = parseVerdict(judgeOutput);

    if (!verdict) {
      // Judge returned unparseable output — fail open
      log('Judge returned unparseable output, allowing stop (fail-open)', {
        sessionId,
      });
      clearGoal(sessionId);
      return false;
    }

    if (verdict.ok || verdict.impossible) {
      // Goal met or impossible — allow stop
      log('Goal gate: allowing stop', {
        sessionId,
        ok: verdict.ok,
        impossible: verdict.impossible,
      });
      clearGoal(sessionId);
      return false;
    }

    // Goal not met — inject re-entry
    const reactCount = incrementGoalReact(sessionId);
    log('Goal gate: injecting re-entry', {
      sessionId,
      reactCount,
      reason: verdict.reason.slice(0, 100),
    });

    const reentryText = buildGoalReentryPrompt(verdict);
    await config.ctx.client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: 'text', text: reentryText }],
      },
    });

    return true; // Handled — re-entry injected
  } catch (error) {
    // Judge call failed — fail open
    log('Goal gate error (fail-open)', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    clearGoal(sessionId);
    return false;
  }
}

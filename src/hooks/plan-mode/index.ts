/**
 * Plan Mode Hook
 *
 * Handles plan mode lifecycle across two entry points:
 *
 * 1. Command path (/ol-plan-enter, /ol-plan-exit):
 *    - command.execute.before in index.ts activates/deactivates overlay
 *    - Works for user-invoked or system-invoked plan mode
 *
 * 2. Tool path (enter_plan_mode, exit_plan_mode):
 *    - tool.execute.before intercepts these tool calls
 *    - Activates overlay + saves returnAgent for enter_plan_mode
 *    - Clears overlay for exit_plan_mode
 *    - On the next LLM turn, chat.message handler picks up overlay
 *      and switches agent via output.message.agent
 *
 * Common deny logic:
 * - tool.execute.before denies write/edit/bash/task/subtask when plan
 *   overlay is active (regardless of activation path)
 *
 * Common prompt injection:
 * - system.transform injects PLAN_MODE_INSTRUCTIONS when prometheus
 *   prompt is isolated with plan overlay active
 */
import { PLAN_MODE_INSTRUCTIONS } from '../../agents/prompts/prometheus/plan-mode-instructions';
import type { EffectiveAgentOverlayManager } from '../../utils/effective-agent-overlay';

export interface PlanModeHookOptions {
  overlayManager: EffectiveAgentOverlayManager;
  getCurrentAgent: (sessionID: string) => string | undefined;
}

export function createPlanModeHook(options: PlanModeHookOptions) {
  return {
    'tool.execute.before': (
      input: { tool: string; sessionID?: string },
      output: { args?: Record<string, unknown>; [key: string]: unknown },
    ): void => {
      const { tool, sessionID } = input;
      if (!sessionID) return;

      // If plan overlay is active, deny dangerous tools
      const activeOverlay = options.overlayManager.getCurrent(sessionID);
      const DENIED_IN_PLAN_MODE = new Set([
        'write',
        'edit',
        'bash',
        'exec',
        'execute_command',
        'powershell',
        'shell',
        'task',
        'subtask',
      ]);

      if (
        activeOverlay?.phase === 'plan' &&
        DENIED_IN_PLAN_MODE.has(tool)
      ) {
        output.args = {
          _denied: true,
          error:
            `Plan mode is read-only. Tool "${tool}" is not allowed during planning. ` +
            'Use /ol-plan-exit to return to the original agent if you need to modify files or run commands.',
        };
        return;
      }

      if (tool === 'enter_plan_mode') {
        // Already in plan mode? Deny.
        const currentOverlay = options.overlayManager.getCurrent(sessionID);
        if (currentOverlay?.phase === 'plan') {
          output.args = {
            _denied: true,
            error:
              'Already in plan mode. Only the main agent (not prometheus) can call enter_plan_mode.',
          };
          return;
        }

        // Save current agent as returnAgent, then activate plan overlay
        const returnAgent =
          options.getCurrentAgent(sessionID) ?? 'orchestrator';
        options.overlayManager.activate(sessionID, {
          phase: 'plan',
          agent: 'prometheus',
          source: 'enter-plan-mode-tool',
          returnAgent,
        });
        return;
      }

      if (tool === 'exit_plan_mode') {
        // Not in plan mode? Nothing to exit.
        const currentOverlay = options.overlayManager.getCurrent(sessionID);
        if (currentOverlay?.phase !== 'plan') {
          output.args = {
            _denied: true,
            error: 'Not in plan mode. Nothing to exit.',
          };
          return;
        }

        // Clear plan overlay — chat.message handler will restore agent
        options.overlayManager.clear(sessionID, 'plan');
        return;
      }
    },

    'experimental.chat.system.transform': (
      input: { sessionID?: string },
      output: { system: string[] },
    ): void => {
      if (!input.sessionID) return;

      const overlay = options.overlayManager.getCurrent(input.sessionID);
      if (overlay?.phase === 'plan') {
        // Append plan-mode instructions to the already-isolated prometheus prompt
        output.system.push(PLAN_MODE_INSTRUCTIONS);
      }
    },
  };
}

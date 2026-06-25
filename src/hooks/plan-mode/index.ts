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
 * Auto-exit:
 * - save_plan tool → auto-exit plan mode (plan saved, time to execute)
 * - write/edit/bash denied → auto-exit plan mode (AI needs to execute)
 * - Prevents AI getting stuck in plan mode
 *
 * Common prompt injection:
 * - system.transform injects PLAN_MODE_INSTRUCTIONS when prometheus
 *   prompt is isolated with plan overlay active
 */
import { PLAN_MODE_INSTRUCTIONS } from '../../agents/prompts/prometheus/plan-mode-instructions';
import { REDESIGN_INSTRUCTIONS } from '../../agents/prompts/prometheus/redesign-instructions';
import type { EffectiveAgentOverlayManager } from '../../utils/effective-agent-overlay';
import { injectPhaseSwitch } from '../phase-switch';
import { getLoop, isLoopActive } from '../loop';

/**
 * 自动退出 plan mode
 * 清除 overlay，注入 phase switch 回到原 agent
 */
function autoExitPlanMode(
  overlayManager: EffectiveAgentOverlayManager,
  sessionID: string,
  reason: string,
): { returnAgent: string } | null {
  const overlay = overlayManager.getCurrent(sessionID);
  if (!overlay || overlay.phase !== 'plan') return null;

  const returnAgent = overlay.returnAgent ?? 'orchestrator';
  overlayManager.clear(sessionID, 'plan');

  injectPhaseSwitch(sessionID, {
    phase: 'done',
    agent: returnAgent,
    think: 'inherit',
    extras: { returnAgent, fixInstructions: `auto-exit: ${reason}` },
  });

  return { returnAgent };
}

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

      if (activeOverlay?.phase === 'plan' || activeOverlay?.agent === 'prometheus') {
        // Check if loop redesign mode — different permission model
        const loop = isLoopActive() ? getLoop() : null;
        const isRedesign = loop?.phase === 'redesign';

        if (tool === 'question' && isRedesign) {
          // Redesign mode: deny question tool
          output.args = {
            _denied: true,
            error: 'Redesign mode: you cannot ask the user. Use sub-agents (task/subtask) to investigate autonomously.',
          };
          return;
        }

        // Deny write/edit/bash in all plan/redesign modes
        const DENIED_WRITE = new Set([
          'write', 'edit', 'bash', 'exec', 'execute_command',
          'powershell', 'shell',
        ]);
        if (DENIED_WRITE.has(tool)) {
          // Auto-exit plan mode
          const exit = autoExitPlanMode(
            options.overlayManager, sessionID,
            `${tool} attempted in plan mode — auto-exiting`,
          );
          output.args = {
            _denied: true,
            error:
              `Plan mode is read-only. Tool "${tool}" is not allowed. ` +
              (exit ? `Auto-exited. Returning to ${exit.returnAgent}.` : ''),
          };
          return;
        }

        // Deny task/subtask only in interview mode (not redesign)
        const DENIED_TASK = new Set(['task', 'subtask']);
        if (DENIED_TASK.has(tool) && !isRedesign) {
          output.args = {
            _denied: true,
            error: `Tool "${tool}" is not allowed during planning. Use /ol-plan-exit to return to the original agent if you need to spawn sub-agents.`,
          };
          return;
        }
      }

      // save_plan in plan/redesign mode: auto-exit (plan is saved, time to execute)
      if (
        tool === 'save_plan' &&
        activeOverlay &&
        (activeOverlay.phase === 'plan' || activeOverlay.agent === 'prometheus')
      ) {
        autoExitPlanMode(
          options.overlayManager,
          sessionID,
          'save_plan called — plan saved, auto-exiting',
        );
        // Allow save_plan to proceed (don't deny)
      }

      // Block manual selection of reviewer outside of loop context
      // Reviewer is UI-visible but should only be activated by the loop system
      if (tool === 'select_agent') {
        const target = (output.args as { name?: string })?.name;
        if (target === 'reviewer') {
          const overlay = options.overlayManager.getCurrent(sessionID);
          if (!overlay || overlay.agent !== 'reviewer') {
            output.args = {
              _denied: true,
              error:
                'Reviewer is a loop-managed agent. ' +
                'It can only be activated by /ol-loop-start or auto-review.',
            };
            return;
          }
        }
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

        // Inject phase switch synthetic message for UI refresh.
        // The next user message will be prepended with [phase:interview|agent:prometheus|think:max]
        // This forces OpenCode to start a new assistant turn with prometheus.
        injectPhaseSwitch(sessionID, {
          phase: 'interview',
          agent: 'prometheus',
          think: 'max',
          extras: { returnAgent },
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

        const returnAgent = currentOverlay.returnAgent ?? 'orchestrator';
        // Clear plan overlay — chat.message handler will restore agent
        options.overlayManager.clear(sessionID, 'plan');

        // Inject phase switch to restore original agent
        injectPhaseSwitch(sessionID, {
          phase: 'done',
          agent: returnAgent,
          think: 'inherit',
          extras: { returnAgent },
        });
        return;
      }
    },

    'experimental.chat.system.transform': (
      input: { sessionID?: string },
      output: { system: string[] },
    ): void => {
      if (!input.sessionID) return;

      const overlay = options.overlayManager.getCurrent(input.sessionID);
      if (!overlay) return;

      if (overlay.phase === 'plan' || overlay.agent === 'prometheus') {
        // Check if a loop redesign is active
        const loop = isLoopActive() ? getLoop() : null;
        if (loop?.phase === 'redesign') {
          // Inject redesign instructions (autonomous mode, no questioning)
          output.system.push(REDESIGN_INSTRUCTIONS);
        } else {
          // Inject standard plan-mode instructions (interview mode)
          output.system.push(PLAN_MODE_INSTRUCTIONS);
        }
      }
      // Reviewer uses its own built-in prompt — no extra injection needed
    },
  };
}

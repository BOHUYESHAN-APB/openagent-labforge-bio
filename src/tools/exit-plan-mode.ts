import { type ToolDefinition, tool } from '@opencode-ai/plugin';

/**
 * exit_plan_mode tool — alternative name to avoid any naming conflicts.
 *
 * This registers as a plugin tool with a unique name (exit_plan_mode instead
 * of plan_exit) to test if the original plan_exit tool's invisibility was
 * caused by a naming conflict with OpenCode built-in tools.
 */
export function createExitPlanModeTool(): ToolDefinition {
  return tool({
    description: `Exit plan mode — return to the original agent.

Call this when planning is complete and the plan has been saved via save_plan.
Note: save_plan in Loop mode auto-exits plan mode — you usually don't need
to call this manually.

Effects:
- Clears plan overlay, restores the original agent (engineer/bio/chem/deep-worker)
- The original agent receives the saved plan and begins execution
- A user message is injected to notify the agent to start working

Usage: call with no arguments. The return agent is resolved automatically.`,
    args: {},
    async execute() {
      return [
        'Plan mode exit triggered.',
        'Returning to the original agent.',
      ].join('\n');
    },
  });
}

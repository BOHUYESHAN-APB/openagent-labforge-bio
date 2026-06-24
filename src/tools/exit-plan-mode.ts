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
    description: `Exit plan mode — return to the agent that was active before entering plan mode.

Use this when: planning is complete and the plan has been saved via save_plan.

Effects:
- Clears the plan overlay, restoring the original agent (engineer/bio/chem/deep-worker)
- The original agent receives the saved plan and begins execution
- prometheus (planner) MUST call this before stopping — otherwise the session stays in read-only plan mode

Usage: call this tool with no arguments. The return agent is automatically resolved from the saved overlay state.`,
    args: {},
    async execute() {
      return [
        'Plan mode exit triggered.',
        'Overlay will clear on the next turn. Returning to the original agent.',
      ].join('\n');
    },
  });
}

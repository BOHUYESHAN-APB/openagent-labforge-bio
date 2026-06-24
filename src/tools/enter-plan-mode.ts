import { type ToolDefinition, tool } from '@opencode-ai/plugin';

/**
 * enter_plan_mode tool — alternative name to avoid any naming conflicts.
 *
 * This registers as a plugin tool with a unique name (enter_plan_mode instead
 * of plan_enter) to test if the original plan_enter tool's invisibility was
 * caused by a naming conflict with OpenCode built-in tools.
 */
export function createEnterPlanModeTool(): ToolDefinition {
  return tool({
    description: `Enter plan mode — switch the active agent to prometheus (planner) for strategic planning.

Use this when the current task is complex enough to need a structured plan before execution.

Effects:
- The active agent switches to prometheus (planner), who works through a 5-phase planning workflow
- prometheus has read-only access (read/glob/grep/webfetch/Question/save_plan)
- prometheus CANNOT edit files, run commands, or call sub-agents
- Call /ol-plan-exit to return to the original agent with the completed plan

Usage: call this tool with no arguments. The current session's active agent is automatically saved for return.`,
    args: {},
    async execute() {
      return [
        'Plan mode entry triggered.',
        'The overlay will activate on the next turn. Your agent should now switch to prometheus (planner).',
        'Use /ol-plan-exit when planning is complete to return to the original agent.',
      ].join('\n');
    },
  });
}

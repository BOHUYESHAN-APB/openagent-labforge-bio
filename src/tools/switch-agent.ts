import { type ToolDefinition, tool } from '@opencode-ai/plugin';

const z = tool.schema;

/**
 * switch_agent tool — internal agent switching mechanism.
 *
 * Called by reviewer or loop-planner to switch to another agent.
 * The actual switch is handled by tool.execute.before in plan-mode hook.
 *
 * Modes:
 * - fix (reviewer→executor): minor fixes, agent goes back to executor + fix instructions
 * - redesign (reviewer→loop-planner): major issues, switch to internal planner
 * - complete (loop-planner→executor): redesign done, switch back to executor
 */
export function createSwitchAgentTool(): ToolDefinition {
  return tool({
    description: `Switch the active agent to another agent. Internal use only.

Available modes:
- fix: reviewer switches back to executor with fix instructions (minor issues)
- redesign: reviewer switches to loop-planner for autonomous re-planning (major issues)
- complete: loop-planner switches back to executor after saving revised plan

This tool is for internal loop orchestration. Do NOT call it directly unless
you are reviewer or loop-planner.`,
    args: {
      target: z
        .string()
        .describe(
          'Target agent: "executor" (go back to working agent), "loop-planner" (internal redesign planner)',
        ),
      mode: z
        .string()
        .describe(
          'Switch mode: "fix" (minor rework), "redesign" (major re-planning), "complete" (redesign finished)',
        ),
      instructions: z
        .string()
        .optional()
        .describe(
          'Optional: fix instructions or review feedback for the target agent.',
        ),
    },
    async execute(args) {
      const target = args?.target as string | undefined;
      const mode = args?.mode as string | undefined;
      const instructions = args?.instructions as string | undefined;
      if (!target || !mode) {
        return 'switch_agent requires both "target" and "mode" arguments.';
      }
      // The actual switch happens in tool.execute.before (plan-mode hook).
      // This return value is shown to the calling agent before the switch.
      return [
        `## Agent Switch: ${mode}`,
        instructions ? `\nInstructions: ${instructions}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    },
  });
}

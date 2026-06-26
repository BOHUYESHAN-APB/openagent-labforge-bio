import { type ToolDefinition, tool } from '@opencode-ai/plugin';

/**
 * redesign_complete tool — internal planner signals redesign is done.
 *
 * Called by the internal planner after saving the revised plan via save_plan.
 * Returns control to the executor with the new plan.
 * The executor will re-read the plan and continue working.
 */
export function createRedesignCompleteTool(): ToolDefinition {
  return tool({
    description: `Signal that the redesign is complete and the executor can resume.

Call this when you are the internal planner and you have:
1. Investigated the issues using sub-agents
2. Created a revised plan
3. Saved the plan via save_plan

Effects:
- The executor agent is reactivated
- The executor will re-read the revised plan automatically
- The executor continues working with the new plan

Usage: internal planner calls this after save_plan. No arguments needed —
the plan is already saved and the executor will find it.`,
    args: {},
    async execute() {
      return [
        '## Redesign Complete — Returning to Executor',
        '',
        'The revised plan has been saved. The executor will re-read it and continue.',
      ].join('\n');
    },
  });
}

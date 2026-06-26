import { type ToolDefinition, tool } from '@opencode-ai/plugin';

const z = tool.schema;

/**
 * task_complete tool — the executor declares "I finished my work, review it".
 *
 * This is the explicit signal that replaces the idle-hook-detection fallback.
 *
 * Flow:
 * - Loop active  → system routes to reviewer via overlay + injected user message
 * - No loop      → system triggers auto-review via existing idle-hook mechanism
 */
export function createTaskCompleteTool(): ToolDefinition {
  return tool({
    description: `Declare work complete and request review.

CRITICAL: Call this when you finish executing all planned todos.
The system activates the reviewer agent and injects a user message
telling the reviewer to inspect your work.

Routing (what happens after you call this):
- In Loop mode: reviewer activates → uses review_approve / request_fix /
  request_redesign to route the verdict
- In auto-continue mode: auto-review triggers via session.idle
- No loop/auto: nothing happens (work is just marked complete)

After routing:
  APPROVED  → review_approve → done
  MINOR FIX → request_fix → back to executor with fix instructions
  MAJOR REWORK → request_redesign → internal planner (autonomous)
                 → redesign_complete → back to executor

DO NOT stop without calling this tool when work is done.`,
    args: {
      summary: z
        .string()
        .describe('Brief summary of what was completed (1-2 sentences).'),
    },
    async execute(args) {
      const summary = args?.summary as string | undefined;
      if (!summary) {
        return 'task_complete was called without a summary. Please provide a brief description of what was done.';
      }
      // The actual routing happens in tool.execute.before (plan-mode hook)
      // This return value is shown to the calling agent before the switch.
      return `## Work Complete — Review Requested\n\nSummary: ${summary}\n\nThe reviewer is now inspecting your work.`;
    },
  });
}

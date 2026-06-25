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
    description: `Declare that the current batch of work is complete and ready for review.

CRITICAL: You MUST call this tool when you finish executing all planned todos.
This triggers the review phase (reviewer agent inspects your work).

- If in loop mode (/ol-loop-start): the reviewer will produce a verdict
  ([APPROVED] / [REJECT: scope=executor] / [REJECT: scope=planner]).
- If in auto-continue mode: the system will auto-review.

DO NOT stop without calling this tool when work is done.`,
    args: {
      summary: z
        .string()
        .describe(
          'Brief summary of what was completed (1-2 sentences).',
        ),
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

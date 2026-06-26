import { type ToolDefinition, tool } from '@opencode-ai/plugin';

const z = tool.schema;

/**
 * review_approve tool — reviewer approves the completed work.
 *
 * Called by the reviewer agent when all work meets requirements.
 * Triggers the loop to transition to "done" state.
 */
export function createReviewApproveTool(): ToolDefinition {
  return tool({
    description: `Approve the completed work and finish the current loop iteration.

Call this when you are the reviewer and all work meets the plan requirements,
code quality standards, and acceptance criteria. This signals that the loop
is complete and no further changes are needed.

Effects:
- The loop transitions to "done" state
- The original agent is restored
- No further changes will be requested on this work unit

Usage: reviewer calls this when work is approved. Include a brief summary
of what was verified.`,
    args: {
      summary: z
        .string()
        .describe('Brief summary of verification results (1-2 sentences).'),
    },
    async execute(args) {
      const summary = (args as { summary?: string })?.summary ?? '';
      return [
        '## Review Approved',
        '',
        summary ? `Summary: ${summary}` : '',
        'The loop will now complete. Returning to the original agent.',
      ]
        .filter(Boolean)
        .join('\n');
    },
  });
}

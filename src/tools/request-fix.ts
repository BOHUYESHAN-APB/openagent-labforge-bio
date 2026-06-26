import { type ToolDefinition, tool } from '@opencode-ai/plugin';

const z = tool.schema;

/**
 * request_fix tool — reviewer sends work back to executor for minor fixes.
 *
 * Called by the reviewer when work is mostly correct but needs minor fixes.
 * The executor is reactivated with specific fix instructions.
 * The system injects a user message to notify the executor of the fix request.
 */
export function createRequestFixTool(): ToolDefinition {
  return tool({
    description: `Send work back to the executor for minor fixes.

Call this when you are the reviewer and the work is mostly correct but needs
targeted fixes — small changes, edge cases, style issues, or test gaps.

Effects:
- The executor agent is reactivated with your fix instructions
- A user message is injected telling the executor what to fix
- After fixes, the executor must call task_complete again for re-review

Usage: reviewer calls this with specific, actionable fix instructions.
Include file paths and expected changes where possible.

Example: fix instructions for "the login form should validate email format"`,
    args: {
      instructions: z
        .string()
        .describe(
          'Specific, actionable fix instructions for the executor. Include file paths and expected changes.',
        ),
    },
    async execute(args) {
      const instructions = (args as { instructions?: string })?.instructions ?? '';
      return [
        '## Fix Requested — Returning to Executor',
        '',
        instructions ? `Fix instructions:\n${instructions}` : '',
        'The executor has been notified and will make the requested changes.',
      ]
        .filter(Boolean)
        .join('\n');
    },
  });
}

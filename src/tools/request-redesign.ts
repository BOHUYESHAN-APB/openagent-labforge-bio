import { type ToolDefinition, tool } from '@opencode-ai/plugin';

const z = tool.schema;

/**
 * request_redesign tool — reviewer sends work to internal planner for major rework.
 *
 * Called by the reviewer when the work has fundamental issues that require
 * a complete redesign. The internal planner is activated autonomously —
 * it does NOT ask the user questions, it uses sub-agents to investigate.
 */
export function createRequestRedesignTool(): ToolDefinition {
  return tool({
    description: `Request a complete redesign from the internal planner.

Call this when you are the reviewer and the issues are fundamental —
architecture problems, wrong approach, missing key requirements. The executor
cannot fix this with minor changes; it needs a new plan.

Effects:
- The internal planner (autonomous, hidden agent) is activated
- The internal planner works WITHOUT asking the user any questions
- It uses sub-agents (explorer, librarian, oracle) to investigate
- It produces a revised plan and calls redesign_complete when done
- After redesign_complete, the executor resumes with the new plan

Usage: reviewer calls this with clear findings about what went wrong
and what the redesign should address.

Example findings: "The architecture does not handle concurrent access.
Redesign needed: add mutex locking to shared state."`,
    args: {
      findings: z
        .string()
        .describe(
          'Clear findings about what went wrong and what the redesign must address.',
        ),
    },
    async execute(args) {
      const findings = (args as { findings?: string })?.findings ?? '';
      return [
        '## Redesign Requested — Activating Internal Planner',
        '',
        findings ? `Review findings:\n${findings}` : '',
        'The internal planner is now working on a revised plan.',
      ]
        .filter(Boolean)
        .join('\n');
    },
  });
}

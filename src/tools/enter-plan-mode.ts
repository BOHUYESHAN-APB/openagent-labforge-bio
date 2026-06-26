import { type ToolDefinition, tool } from '@opencode-ai/plugin';

/**
 * enter_plan_mode tool — activates plan overlay and switches to prometheus.
 *
 * On the next turn, prometheus receives the return value of this tool as
 * a conversation message. The return is designed as a direct instruction
 * that forces prometheus to immediately use the Question tool.
 */
export function createEnterPlanModeTool(): ToolDefinition {
  return tool({
    description: `Enter plan mode — switch to prometheus (planner) for structured planning.

Any primary executor (engineer, bio-analyst, chem-analyst) can call this when
they need to make a plan before executing. The planner creates the plan, saves
it via save_plan, then auto-exits plan mode.

Effects:
- Switches to prometheus (planner) — read-only, can write plan files
- prometheus explores, creates a plan, and calls save_plan
- save_plan auto-exits plan mode and returns to the calling executor
- After exit, the system injects a user message telling the executor to start work

Usage: engineeer/bio-analyst/chem-analyst call this when they need a plan.
No arguments needed — the planner will explore the current context.`,
    args: {},
    async execute() {
      return [
        '## Plan Mode Activated — prometheus (planner) is now active',
        '',
        'Explore the codebase and gather requirements autonomously.',
        'Create the plan, call save_plan to persist it, then auto-exit.',
        'Do NOT wait for user confirmation — plan, save, and continue.',
      ].join('\n');
    },
  });
}

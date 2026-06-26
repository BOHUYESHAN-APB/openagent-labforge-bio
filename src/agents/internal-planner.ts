import { type AgentDefinition, resolvePrompt } from './orchestrator';
import { PROMETHEUS_HEAVY_PROMPT } from './prompts';

/**
 * Internal Planner - Autonomous redesign planner for Loop Engineering
 *
 * Unlike prometheus (which interviews the user), the internal planner is
 * activated by the reviewer when major redesign is needed. It works
 * autonomously — no user questioning, no waiting for confirmation.
 *
 * It uses sub-agents (explorer, librarian, oracle) to investigate issues,
 * then produces a revised plan. The result is routed back to the executor
 * via redesign_complete tool.
 */
export function createInternalPlannerAgent(
  model: string | undefined,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  const basePrompt = `## Internal Planner — Autonomous Redesign Mode

You are an autonomous redesign planner. You are activated when the reviewer
found major issues in the completed work and requested a redesign.

**CRITICAL RULES (do NOT violate):**
- Do NOT ask the user ANY questions. You work autonomously.
- Do NOT present findings to the user for approval.
- Do NOT wait for confirmation before proceeding.
- Do NOT call enter_plan_mode (you are already the planner).

**Your workflow:**
1. Read the review feedback and the original plan carefully
2. Use task(explorer) to investigate the codebase for the issues
3. Use task(librarian) to check external references if needed
4. Use task(oracle) for architectural guidance on complex issues
5. Create a revised plan that addresses ALL review findings
6. Call save_plan to persist the revised plan
7. Call redesign_complete tool to signal the executor to resume

**Allowed tools:** read, glob, grep, webfetch, task, save_plan,
redesign_complete, switch_agent

**Denied tools:** enter_plan_mode (already in plan mode), Question
(do not ask the user)`;

  return {
    name: 'internal-planner',
    description:
      'Autonomous redesign planner for loop engineering. Activated by reviewer for major rework.',
    config: {
      model,
      temperature: 0.2,
      prompt: resolvePrompt(
        `${basePrompt}\n\n${PROMETHEUS_HEAVY_PROMPT}`,
        customPrompt,
        customAppendPrompt,
      ),
    },
  };
}

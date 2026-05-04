import { readFileSync } from 'node:fs';
import type { PluginInput } from '@opencode-ai/plugin';
import {
  appendSessionId,
  createBoulderState,
  findPlanFile,
  getPlanProgress,
  listPlanFiles,
  readBoulderState,
  writeBoulderState,
} from '../../boulder';
import {
  getProjectBoulderFile,
  getProjectPlansDir,
} from '../../paths/plugin-paths';

const COMMAND_NAME = 'ol-start-work';
const EXECUTOR_AGENT = 'atlas';

interface ParsedArgs {
  planName?: string;
  worktreePath?: string;
}

export function createStartWorkHook(ctx: PluginInput) {
  async function handleCommandExecuteBefore(
    input: {
      command: string;
      sessionID: string;
      arguments: string;
    },
    output: { parts: Array<{ type: string; text?: string }> },
  ): Promise<void> {
    if (input.command !== COMMAND_NAME) return;

    const parsed = parseArgs(input.arguments);
    const workspaceRoot = ctx.directory;
    const activeState = readBoulderState(workspaceRoot);
    const activePlanProgress = activeState
      ? getProgressForPlan(activeState.active_plan)
      : null;

    let isActivePlan = false;
    const selectedPlan =
      activeState && activePlanProgress && !activePlanProgress.isComplete
        ? ((isActivePlan = true),
          {
            name: activeState.plan_name,
            path: activeState.active_plan,
            progress: activePlanProgress,
          })
        : findPlanFile(workspaceRoot, parsed.planName);

    if (!selectedPlan) {
      output.parts.push({ type: 'text', text: noPlanMessage(workspaceRoot) });
      return;
    }

    const state = isActivePlan
      ? appendSessionId(
          { ...activeState!, agent: activeState!.agent || EXECUTOR_AGENT },
          input.sessionID,
        )
      : createBoulderState({
          planPath: selectedPlan.path,
          sessionID: input.sessionID,
          agent: EXECUTOR_AGENT,
          worktreePath: parsed.worktreePath,
        });

    const nextState = parsed.worktreePath
      ? { ...state, worktree_path: parsed.worktreePath }
      : state;
    writeBoulderState(workspaceRoot, nextState);

    output.parts.push({
      type: 'text',
      text: buildStartWorkContext({
        planName: selectedPlan.name,
        planPath: selectedPlan.path,
        boulderPath: getProjectBoulderFile(workspaceRoot),
        progress: selectedPlan.progress,
        sessionID: input.sessionID,
        worktreePath: nextState.worktree_path,
      }),
    });

    if (output && 'message' in output) {
      const message = (output as { message?: { agent?: string } }).message;
      if (message) message.agent = EXECUTOR_AGENT;
    }
  }

  return { handleCommandExecuteBefore };
}

function getProgressForPlan(planPath: string) {
  try {
    return getPlanProgress(readFileSync(planPath, 'utf8'));
  } catch {
    return null;
  }
}

function parseArgs(args: string): ParsedArgs {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const result: ParsedArgs = {};
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === '--worktree') {
      result.worktreePath = parts[index + 1];
      index += 1;
      continue;
    }
    if (part.startsWith('--worktree=')) {
      result.worktreePath = part.slice('--worktree='.length);
      continue;
    }
    result.planName = result.planName ? `${result.planName} ${part}` : part;
  }
  return result;
}

function noPlanMessage(workspaceRoot: string): string {
  const plans = listPlanFiles(workspaceRoot);
  const planList = plans
    .map(
      (plan) =>
        `- ${plan.name} (${plan.progress.completed}/${plan.progress.total}, ${plan.progress.percent}%) — ${plan.path}`,
    )
    .join('\n');

  return `## No matching Prometheus plan found

Expected plan files under:
- ${getProjectPlansDir(workspaceRoot)}
- .sisyphus/plans/ (legacy compatibility)

${planList ? `Available plans:\n${planList}\n\n` : ''}Ask Prometheus to create and save a plan first. The planner must end with:

Plan saved to: ${getProjectPlansDir(workspaceRoot)}/<plan-name>.md
Next command: /ol-start-work <plan-name>`;
}

function buildStartWorkContext(input: {
  planName: string;
  planPath: string;
  boulderPath: string;
  progress: {
    total: number;
    completed: number;
    remaining: number;
    percent: number;
  };
  sessionID: string;
  worktreePath?: string;
}): string {
  return `## OL START WORK

You are starting a plan execution session. Use Atlas behavior for execution.

### Runtime context
- Executor agent: @atlas
- Plan name: ${input.planName}
- Plan file: ${input.planPath}
- Boulder state: ${input.boulderPath}
- Session ID: ${input.sessionID}
- Progress: ${input.progress.completed}/${input.progress.total} completed (${input.progress.percent}%), ${input.progress.remaining} remaining
${input.worktreePath ? `- Worktree path: ${input.worktreePath}\n` : ''}
### Required workflow
1. Read the full plan file before doing any work.
2. Create todos for every incomplete top-level plan checkbox before starting.
3. Execute from the first unchecked top-level checkbox.
4. When a top-level plan task is complete, update the plan file checkbox from [ ] to [x].
5. Keep boulder.json as the active execution state; do not delete it until all plan and final review tasks are complete.
6. Do not stop with incomplete todos unless blocked, needing user input, or explicitly paused by the user.
7. Use @council only for multi-model consensus/review on high-risk decisions; do not use council as the executor.
8. Run the final review wave before claiming completion.

If the UI agent selector did not switch automatically, tell the user to switch the visible agent to Atlas, but continue with this injected execution context.`;
}

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
import type { EffectiveAgentOverlayManager } from '../../utils';

const COMMAND_NAME = 'ol-start-work';
const EXECUTOR_AGENT = 'atlas';

interface ParsedArgs {
  planName?: string;
  worktreePath?: string;
}

interface StartWorkHook {
  handleCommandExecuteBefore: (
    input: {
      command: string;
      sessionID: string;
      arguments: string;
    },
    output: { parts: Array<{ type: string; text?: string }> },
  ) => Promise<void>;
  handleToolExecuteAfter: (
    input: { tool: string; sessionID?: string },
    output?: { output?: unknown },
  ) => Promise<void>;
  handleEvent: (input: {
    event: {
      type: string;
      properties?: { info?: { id?: string }; sessionID?: string };
    };
  }) => void;
}

export function createStartWorkHook(
  ctx: PluginInput,
  options?: {
    overlayManager?: EffectiveAgentOverlayManager;
    getCurrentAgent?: (sessionID: string) => string | undefined;
  },
): StartWorkHook {
  const lastSavedPlanNameBySession = new Map<string, string>();

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

    const shouldResumeActivePlan = Boolean(
      activeState && activePlanProgress && !activePlanProgress.isComplete,
    );
    const preferredPlanName = shouldResumeActivePlan
      ? undefined
      : lastSavedPlanNameBySession.get(input.sessionID);
    const incompletePlans = listPlanFiles(workspaceRoot).filter(
      (plan) => !plan.progress.isComplete,
    );
    if (
      !parsed.planName &&
      !shouldResumeActivePlan &&
      incompletePlans.length > 1 &&
      !preferredPlanName
    ) {
      output.parts.push({
        type: 'text',
        text: multiplePlansMessage(incompletePlans),
      });
      return;
    }
    let selectedPlan = findPlanFile(workspaceRoot, parsed.planName);
    if (!parsed.planName && !selectedPlan && preferredPlanName) {
      selectedPlan =
        incompletePlans.find((plan) => plan.name === preferredPlanName) ?? null;
    }
    if (!parsed.planName && preferredPlanName) {
      selectedPlan =
        incompletePlans.find((plan) => plan.name === preferredPlanName) ??
        selectedPlan;
    }
    if (shouldResumeActivePlan && activeState && activePlanProgress) {
      selectedPlan = {
        name: activeState.plan_name,
        path: activeState.active_plan,
        modifiedAt: '',
        progress: activePlanProgress,
      };
    }

    if (!selectedPlan) {
      output.parts.push({ type: 'text', text: noPlanMessage(workspaceRoot) });
      return;
    }

    const state =
      shouldResumeActivePlan && activeState
        ? appendSessionId(
            { ...activeState, agent: activeState.agent || EXECUTOR_AGENT },
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

    options?.overlayManager?.clear(input.sessionID);
    options?.overlayManager?.activate(input.sessionID, {
      phase: 'execute',
      agent: EXECUTOR_AGENT,
      source: COMMAND_NAME,
      returnAgent: options?.getCurrentAgent?.(input.sessionID),
    });

    output.parts.push({
      type: 'text',
      text: buildStartWorkContext({
        planName: selectedPlan.name,
        planPath: selectedPlan.path,
        boulderPath: getProjectBoulderFile(workspaceRoot),
        progress: selectedPlan.progress,
        sessionID: input.sessionID,
        originalAgent: options?.getCurrentAgent?.(input.sessionID),
        worktreePath: nextState.worktree_path,
      }),
    });

    if (output && 'message' in output) {
      const message = (output as { message?: { agent?: string } }).message;
      if (message) message.agent = EXECUTOR_AGENT;
    }
  }

  async function handleToolExecuteAfter(
    input: { tool: string; sessionID?: string },
    output?: { output?: unknown },
  ): Promise<void> {
    if (input.tool !== 'save_plan' || !input.sessionID) {
      return;
    }

    const text = typeof output?.output === 'string' ? output.output : '';
    const match = text.match(/^Next command: \/ol-start-work\s+(.+)$/m);
    if (!match) {
      return;
    }

    const planName = match[1]?.trim();
    if (!planName) {
      return;
    }

    lastSavedPlanNameBySession.set(input.sessionID, planName);
  }

  function handleEvent(input: {
    event: {
      type: string;
      properties?: { info?: { id?: string }; sessionID?: string };
    };
  }): void {
    if (input.event.type !== 'session.deleted') {
      return;
    }

    const sessionID =
      input.event.properties?.info?.id ?? input.event.properties?.sessionID;
    if (!sessionID) {
      return;
    }

    lastSavedPlanNameBySession.delete(sessionID);
  }

  return { handleCommandExecuteBefore, handleToolExecuteAfter, handleEvent };
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

  return `## No matching planner plan found

Expected plan files under:
- ${getProjectPlansDir(workspaceRoot)}
- .sisyphus/plans/ (legacy compatibility)

${planList ? `Available plans:\n${planList}\n\n` : ''}Ask the planner agent (internal id: prometheus) to create and save a plan first. The planner must end with:

Plan saved to: ${getProjectPlansDir(workspaceRoot)}/<plan-name>.md
Next command: /ol-start-work <plan-name>`;
}

function multiplePlansMessage(
  plans: Array<{
    name: string;
    path: string;
    description?: string;
    progress: {
      completed: number;
      total: number;
      percent: number;
      nextTaskLabel?: string;
    };
  }>,
): string {
  const maxOptions = 5;
  const showAll = plans.length <= maxOptions;
  const listed = showAll ? plans : plans.slice(0, maxOptions);

  const planList = listed
    .map((plan) => {
      const desc = plan.description
        ? ` — ${plan.description}`
        : '';
      const next = plan.progress.nextTaskLabel
        ? `\n      Next: ${plan.progress.nextTaskLabel}`
        : '';
      return `- ${plan.name} (${plan.progress.completed}/${plan.progress.total}, ${plan.progress.percent}%)${desc}${next}`;
    })
    .join('\n');

  const overflow =
    !showAll && plans.length > maxOptions
      ? `\n... and ${plans.length - maxOptions} more plans.`
      : '';

  return `## Multiple incomplete plans found

Execution is ambiguous because more than one saved plan is still incomplete.

Use the question tool to ask the user which saved plan to execute.

Incomplete plans:
${planList}${overflow}

**If there are too many options, let the user type the plan name manually.**
When the user picks one, run: /ol-start-work <selected-plan-name>`;
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
  originalAgent?: string;
  worktreePath?: string;
}): string {
  return `## OL START WORK

You are starting a plan execution session. Use executor behavior for execution.

### Runtime context
- Current phase: execute
- Executor agent: @executor (internal id: atlas)
- Effective execution agent: @executor (internal id: atlas)
- Control returns to: ${input.originalAgent ?? 'the original main agent'} after execution and final review complete
- Plan name: ${input.planName}
- Plan file: ${input.planPath}
- Boulder state: ${input.boulderPath}
- Session ID: ${input.sessionID}
- Progress: ${input.progress.completed}/${input.progress.total} completed (${input.progress.percent}%), ${input.progress.remaining} remaining
${input.worktreePath ? `- Worktree path: ${input.worktreePath}\n` : ''}
### Cross-window state recovery

This command may be executed in a NEW window (isolated context). The hook has already:
1. Located the plan file at: ${input.planPath}
2. Created/updated boulder.json at: ${input.boulderPath}
3. Appended your session ID: ${input.sessionID}
4. Injected this execution context into your session

You have ALL the information needed to execute. Do NOT ask where the plan is or claim you cannot find it. The plan path is above.

### Required workflow
1. Read the full plan file before doing any work.
2. Create todos for every incomplete top-level plan checkbox before starting.
3. Execute from the first unchecked top-level checkbox.
4. When a top-level plan task is complete, update the plan file checkbox from [ ] to [x].
5. Keep boulder.json as the active execution state; do not delete it until all plan and final review tasks are complete.
6. Do not stop with incomplete todos unless blocked, needing user input, or explicitly paused by the user.
7. Use @council only for multi-model consensus/review on high-risk decisions; do not use council as the executor.
8. Run the final review wave before claiming completion.

If the UI agent selector did not switch automatically, tell the user to switch the visible agent to executor, but continue with this injected execution context.`;
}

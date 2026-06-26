import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginInput } from '@opencode-ai/plugin';
import {
  appendSessionId,
  createBoulderState,
  findPlanFile,
  getPlanProgress,
  readBoulderState,
  writeBoulderState,
} from '../../boulder';
import {
  readCheckpointFile,
  readLatestCheckpoint,
} from '../../checkpoint/persistence';
import {
  getProjectBoulderFile,
  getProjectPlansDir,
} from '../../paths/plugin-paths';
import type { EffectiveAgentOverlayManager } from '../../utils';

const COMMAND_NAME = 'ol-checkpoint-resume';
const EXECUTOR_AGENT = 'atlas';

interface CheckpointResumeHook {
  handleCommandExecuteBefore: (
    input: {
      command: string;
      sessionID: string;
      arguments: string;
    },
    output: {
      parts: Array<{ type: string; text?: string }>;
      message?: { agent?: string };
    },
  ) => Promise<void>;
}

export function createCheckpointResumeHook(
  ctx: PluginInput,
  options?: {
    overlayManager?: EffectiveAgentOverlayManager;
    getCurrentAgent?: (sessionID: string) => string | undefined;
  },
): CheckpointResumeHook {
  async function handleCommandExecuteBefore(
    input: {
      command: string;
      sessionID: string;
      arguments: string;
    },
    output: {
      parts: Array<{ type: string; text?: string }>;
      message?: { agent?: string };
    },
  ): Promise<void> {
    if (input.command !== COMMAND_NAME) {
      return;
    }

    const checkpointText = resolveCheckpointText(ctx.directory, input);
    if (!checkpointText) {
      return;
    }

    const executionState = extractExecutionState(checkpointText, ctx.directory);
    const loopState = extractLoopState(checkpointText);

    // Must have at least one of executionState or loopState to proceed
    if (!executionState && !loopState) {
      return;
    }

    const priorPhase = extractPriorPhase(checkpointText);
    const resumeAgent = priorPhase === 'plan' ? 'prometheus' : EXECUTOR_AGENT;
    const resumePhase = priorPhase === 'plan' ? 'plan' : 'execute';

    if (executionState) {
      restoreBoulderExecutionState(
        ctx.directory,
        input.sessionID,
        executionState,
      );
    }

    markCheckpointConsumed(ctx.directory, input.sessionID);

    options?.overlayManager?.clear(input.sessionID);
    options?.overlayManager?.activate(input.sessionID, {
      phase: resumePhase,
      agent: resumeAgent,
      source: COMMAND_NAME,
      returnAgent: options?.getCurrentAgent?.(input.sessionID),
    });

    output.parts.unshift({
      type: 'text',
      text: buildResumeExecutionContext({
        checkpointArgument: input.arguments.trim() || '(current session)',
        boulderPath: getProjectBoulderFile(ctx.directory),
        plansDir: getProjectPlansDir(ctx.directory),
        originalAgent: options?.getCurrentAgent?.(input.sessionID),
        executionState,
        loopState,
        resumeAgent,
        resumePhase,
      }),
    });

    if (output.message) {
      output.message.agent = resumeAgent;
    }
  }

  return { handleCommandExecuteBefore };
}

function resolveCheckpointText(
  workspaceRoot: string,
  input: { sessionID: string; arguments: string },
): string | null {
  const arg = input.arguments.trim();

  // "latest" → read workspace-level latest.md (cross-session reference)
  if (arg === 'latest') {
    return readLatestCheckpoint(workspaceRoot);
  }

  // Session ID provided → read that session's by-session/{id}.md
  // This is the primary cross-session handoff path.
  // readCheckpointFile tries by-session/{id} then by-session-auto/{id}.
  if (arg) {
    return readCheckpointFile(workspaceRoot, arg);
  }

  // No argument → read current session's own checkpoint.
  // Session isolation: never silently fall back to latest.md
  // (which may belong to a different session).
  return readCheckpointFile(workspaceRoot, input.sessionID);
}

function extractLoopState(checkpointText: string): {
  loop_id: string;
  phase: string;
  iteration: number;
  max_iterations: number;
} | null {
  const loopIdMatch = checkpointText.match(/^Active Loop: (.+)$/m);
  const loopPhaseMatch = checkpointText.match(/^Loop phase: (.+)$/m);
  if (!loopIdMatch) return null;

  const loop_id = loopIdMatch[1]?.trim().split(' ')[0] ?? '';
  if (!loop_id) return null;
  const phase = loopPhaseMatch?.[1]?.trim() ?? '';
  const iteration = 1;
  const max_iterations = 3;

  return { loop_id, phase, iteration, max_iterations };
}

function extractPriorPhase(
  checkpointText: string,
): 'plan' | 'execute' | 'review' {
  const match = checkpointText.match(/^Prior phase: (.+)$/m);
  const phase = match?.[1]?.trim().toLowerCase();
  if (phase === 'review') return 'review';
  if (phase === 'plan') return 'plan';
  return 'execute';
}

function extractExecutionState(
  checkpointText: string,
  workspaceRoot: string,
): {
  planName: string;
  planPath: string;
  remainingTasks: number;
  progress: {
    total: number;
    completed: number;
    remaining: number;
    percent: number;
  };
} | null {
  const planPathMatch = checkpointText.match(
    /^Active execution plan path: (.+)$/m,
  );
  const planNameMatch = checkpointText.match(
    /^Active execution plan name: (.+)$/m,
  );
  const legacyPlanLineMatch = checkpointText.match(
    /^Active execution plan: (.+)$/m,
  );

  const planPath = planPathMatch?.[1]?.trim();
  const planName =
    planNameMatch?.[1]?.trim() ?? legacyPlanLineMatch?.[1]?.trim();
  if (!planPath || !planName) {
    return null;
  }

  const resolved = findPlanFile(workspaceRoot, planName);
  const resolvedPlanPath = resolved?.path ?? planPath;
  const progress = readPlanProgress(resolvedPlanPath, checkpointText);

  return {
    planName,
    planPath: resolvedPlanPath,
    remainingTasks: progress.remaining,
    progress,
  };
}

function readPlanProgress(
  planPath: string,
  checkpointText: string,
): {
  total: number;
  completed: number;
  remaining: number;
  percent: number;
} {
  if (existsSync(planPath)) {
    try {
      return getPlanProgress(readFileSync(planPath, 'utf8'));
    } catch {
      // Fall through to checkpoint-derived progress.
    }
  }

  const remainingMatch = checkpointText.match(
    /^(?:- )?Top-level plan tasks remaining: (\d+)$/m,
  );
  const remaining = Number.parseInt(remainingMatch?.[1] ?? '0', 10);
  return {
    total: remaining,
    completed: 0,
    remaining,
    percent: 0,
  };
}

function restoreBoulderExecutionState(
  workspaceRoot: string,
  sessionID: string,
  executionState: {
    planName: string;
    planPath: string;
  },
): void {
  const existingState = readBoulderState(workspaceRoot);
  const samePlan =
    existingState?.plan_name === executionState.planName ||
    existingState?.active_plan === executionState.planPath;

  const nextState =
    samePlan && existingState
      ? appendSessionId({ ...existingState, agent: EXECUTOR_AGENT }, sessionID)
      : createBoulderState({
          planPath: executionState.planPath,
          sessionID,
          agent: EXECUTOR_AGENT,
        });

  writeBoulderState(workspaceRoot, nextState);
}

function markCheckpointConsumed(
  workspaceRoot: string,
  sessionID: string,
): void {
  const checkpointDir = join(
    workspaceRoot,
    '.opencode',
    'extendai-lab',
    'checkpoints',
  );

  const candidates = [
    join(checkpointDir, 'latest.meta.json'),
    join(checkpointDir, 'by-session-auto', sessionID + '.meta.json'),
  ];

  for (const metaPath of candidates) {
    if (!existsSync(metaPath)) {
      continue;
    }
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      meta.checkpoint_status = 'consumed';
      meta.consumed_by_session_id = sessionID;
      meta.consumed_at = new Date().toISOString();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    } catch {
      // non-critical: metadata is advisory
    }
  }
}

function buildResumeExecutionContext(input: {
  checkpointArgument: string;
  boulderPath: string;
  plansDir: string;
  originalAgent?: string;
  resumeAgent: string;
  resumePhase: string;
  executionState: {
    planName: string;
    planPath: string;
    remainingTasks: number;
    progress: {
      total: number;
      completed: number;
      remaining: number;
      percent: number;
    };
  } | null;
  loopState?: {
    loop_id: string;
    phase: string;
    iteration: number;
    max_iterations: number;
  } | null;
}): string {
  const agentLabel =
    input.resumeAgent === 'prometheus' ? 'planner' : 'executor';

  // Build loop context if present
  const loopContext = input.loopState
    ? `\n### Restored Loop state
- Loop ID: ${input.loopState.loop_id}
- Loop phase: ${input.loopState.phase} (iteration ${input.loopState.iteration}/${input.loopState.max_iterations})
- Active Loop FSM file: .opencode/loops/active.json`
    : '';

  // Build execution context if present
  const executionContext = input.executionState
    ? `\n### Restored execution state
- Restored plan name: ${input.executionState.planName}
- Restored plan file: ${input.executionState.planPath}
- Restored top-level progress: ${input.executionState.progress.completed}/${input.executionState.progress.total} completed (${input.executionState.progress.percent}%), ${input.executionState.progress.remaining} remaining`
    : '';

  return `## CHECKPOINT RESUME RECOVERY

Loaded checkpoint. Restoring phase: ${input.resumePhase} (${input.resumeAgent}).

### Overview
- Effective execution agent: @${agentLabel} (internal id: ${input.resumeAgent})
- Restored phase: ${input.resumePhase}
- Control returns to: ${input.originalAgent ?? 'the original main agent'} after ${input.resumePhase} and review complete
- Checkpoint source argument: ${input.checkpointArgument}
- Plans directory: ${input.plansDir}
- Boulder state path: ${input.boulderPath}
${executionContext}
${loopContext}

### Required recovery workflow
1. Re-read the restored plan file immediately (if plan exists).
2. If Loop FSM is active, check .opencode/loops/active.json for loop state.
3. Rebuild the todo list from the current top-level plan checkboxes before executing.
4. Continue from the first unfinished top-level task.
5. Keep boulder-backed execution state authoritative until the plan and final review are complete.`;
}

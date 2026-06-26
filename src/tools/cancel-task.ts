import type { PluginInput, ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import type {
  BackgroundJobBoard,
  BackgroundJobRecord,
} from '../utils/background-job-board';

const z = tool.schema;

interface CancelTaskToolOptions {
  client: PluginInput['client'];
  backgroundJobBoard: BackgroundJobBoard;
  shouldManageSession: (sessionID: string) => boolean;
}

export function createCancelTaskTool(
  options: CancelTaskToolOptions,
): ToolDefinition {
  return tool({
    description: `Cancel a tracked background specialist task.

Use only for obsolete, wrong, conflicting, or user-requested cancellation. Accepts either the native task_id/session ID or the parent-scoped alias shown in the Background Job Board. Cancellation is not rollback: if cancelling a writer, inspect and reconcile partial file changes before replacing the lane.`,
    args: {
      task_id: z
        .string()
        .describe('Tracked background task ID or Background Job Board alias'),
      reason: z.string().optional().describe('Short cancellation reason'),
    },
    async execute(args, toolContext) {
      const parentSessionID = toolContext?.sessionID;
      if (!parentSessionID) {
        throw new Error('cancel_task requires sessionID');
      }
      if (toolContext.agent && toolContext.agent !== 'orchestrator') {
        throw new Error('cancel_task can only be used by orchestrator');
      }
      if (!options.shouldManageSession(parentSessionID)) {
        throw new Error(
          'cancel_task can only be used in orchestrator sessions',
        );
      }

      const requested = args.task_id.trim();
      if (!requested) throw new Error('cancel_task requires task_id');

      const job = options.backgroundJobBoard.resolve(
        parentSessionID,
        requested,
      );
      if (!job) {
        return unknownTaskOutput(
          requested,
          'unknown or unowned background task',
        );
      }

      try {
        await options.client.session.abort({ path: { id: job.taskID } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        options.backgroundJobBoard.updateStatus({
          taskID: job.taskID,
          state: 'running',
          statusUncertain: true,
          lastStatusError: message,
        });
        return [
          `task_id: ${job.taskID}`,
          'state: running',
          '',
          '<task_error>',
          message,
          '</task_error>',
        ].join('\n');
      }

      const cancelled = options.backgroundJobBoard.markCancelled(
        job.taskID,
        args.reason,
        Date.now(),
        { force: true },
      );

      return [
        `task_id: ${job.taskID}`,
        `state: ${cancelled?.state ?? 'cancelled'}`,
        '',
        '<task_error>',
        cancelled?.resultSummary ?? 'cancelled',
        '</task_error>',
      ].join('\n');
    },
  });
}

function unknownTaskOutput(taskID: string, reason: string): string {
  return [
    `task_id: ${taskID}`,
    'state: unknown',
    '',
    '<task_error>',
    reason,
    '</task_error>',
  ].join('\n');
}

export type { BackgroundJobBoard, BackgroundJobRecord };

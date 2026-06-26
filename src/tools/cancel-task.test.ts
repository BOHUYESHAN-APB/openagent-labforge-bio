import { describe, expect, mock, test } from 'bun:test';
import type { PluginInput } from '@opencode-ai/plugin';
import type { BackgroundJobBoard } from '../utils/background-job-board';
import { createCancelTaskTool } from './cancel-task';

describe('cancel_task tool', () => {
  const mockJobBoard = {
    resolve: mock((_parentSessionID: string, _taskID: string) => ({
      taskID: 'bg-task-1',
      parentSessionID: _parentSessionID,
      state: 'running' as const,
      createdAt: Date.now(),
      agentType: 'explorer',
    })),
    updateStatus: mock(() => {}),
    markCancelled: mock(
      (
        taskID: string,
        reason?: string,
        _timestamp?: number,
        _options?: { force?: boolean },
      ) => ({
        taskID,
        state: 'cancelled' as const,
        resultSummary: reason ?? 'cancelled',
      }),
    ),
  } as unknown as BackgroundJobBoard;

  const mockClient = {
    session: {
      abort: mock(async () => {}),
    },
  } as unknown as PluginInput['client'];

  test('cancels a known background task', async () => {
    const tool = createCancelTaskTool({
      client: mockClient,
      backgroundJobBoard: mockJobBoard,
      shouldManageSession: () => true,
    });

    const output = await (tool as { execute: Function }).execute(
      { task_id: 'bg-task-1', reason: 'no longer needed' },
      { sessionID: 'session-1', agent: 'orchestrator' },
    );

    expect(output).toContain('state: cancelled');
    expect(output).toContain('bg-task-1');
    expect(mockClient.session.abort).toHaveBeenCalledWith({
      path: { id: 'bg-task-1' },
    });
  });

  test('rejects non-orchestrator callers', async () => {
    const tool = createCancelTaskTool({
      client: mockClient,
      backgroundJobBoard: mockJobBoard,
      shouldManageSession: () => true,
    });

    expect(
      (tool as { execute: Function }).execute(
        { task_id: 'bg-task-1' },
        { sessionID: 'session-1', agent: 'explorer' },
      ),
    ).rejects.toThrow('cancel_task can only be used by orchestrator');
  });

  test('returns unknown for unresolvable task', async () => {
    const emptyBoard = {
      resolve: mock(() => null),
      updateStatus: mock(() => {}),
      markCancelled: mock(() => null),
    } as unknown as BackgroundJobBoard;

    const tool = createCancelTaskTool({
      client: mockClient,
      backgroundJobBoard: emptyBoard,
      shouldManageSession: () => true,
    });

    const output = await (tool as { execute: Function }).execute(
      { task_id: 'nonexistent' },
      { sessionID: 'session-1', agent: 'orchestrator' },
    );

    expect(output).toContain('state: unknown');
  });
});

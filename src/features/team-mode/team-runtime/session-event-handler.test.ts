/// <reference types="bun-types" />

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createTeamSessionEventHandler } from './session-event-handler';

describe('team session event handler', () => {
  beforeEach(() => {
    mock.restore();
  });

  test('session.idle marks member idle and triggers inbox delivery', async () => {
    const transitionRuntimeState = mock(async () => ({}));
    const lookupTeamSession = mock(() => ({
      teamRunId: 'run-1',
      memberName: 'worker',
    }));
    const loadRuntimeState = mock(async () => ({
      teamRunId: 'run-1',
      teamName: 'team-1',
      members: [{ name: 'worker', status: 'running' }],
    }));
    const onMemberIdle = mock(async () => 1);
    const promptAsync = mock(async () => ({}));

    const handler = createTeamSessionEventHandler(
      {} as never,
      { session: { promptAsync } } as never,
      {
        lookupTeamSession: lookupTeamSession as never,
        loadRuntimeState: loadRuntimeState as never,
        transitionRuntimeState: transitionRuntimeState as never,
        onMemberIdle: onMemberIdle as never,
      },
    );

    await handler({
      type: 'session.idle',
      properties: { sessionID: 'ses_worker' },
    });

    expect(transitionRuntimeState).toHaveBeenCalled();
    expect(onMemberIdle).toHaveBeenCalledWith('run-1', 'worker', {
      session: { promptAsync },
    });
  });
});

/**
 * Team Session Event Handler
 *
 * Listens to OpenCode session events (session.idle, session.deleted)
 * and updates team member status accordingly.
 *
 * Inspired by OMO's team-member-status-handler.
 */

import type { PluginInput } from '@opencode-ai/plugin';
import type { TeamModeConfig } from '../../../config/schema/team-mode';
import { log } from '../../../shared/logger';
import {
  loadRuntimeState,
  transitionRuntimeState,
} from '../team-state-store/store';
import { onMemberIdle } from '../tools/inbox-injector';
import type { RuntimeStateMember } from '../types';
import { lookupTeamSession } from './session-to-team-registry';

type MemberStatus = RuntimeStateMember['status'];

const IDLE_TRANSITION_SOURCE_STATUSES: ReadonlySet<MemberStatus> = new Set([
  'running',
]);
const COMPLETED_TRANSITION_SOURCE_STATUSES: ReadonlySet<MemberStatus> = new Set(
  ['running', 'idle', 'pending'],
);

/**
 * Transition a team member's status.
 */
async function transitionMemberStatus(
  runtimeMember: { teamRunId: string; memberName: string },
  allowedSources: ReadonlySet<MemberStatus>,
  nextStatus: MemberStatus,
  config: TeamModeConfig,
  sessionID: string,
  eventLabel: string,
  deps?: {
    loadRuntimeState?: typeof loadRuntimeState;
    transitionRuntimeState?: typeof transitionRuntimeState;
  },
): Promise<void> {
  const loadRuntimeStateImpl = deps?.loadRuntimeState ?? loadRuntimeState;
  const transitionRuntimeStateImpl =
    deps?.transitionRuntimeState ?? transitionRuntimeState;

  const runtimeState = await loadRuntimeStateImpl(
    runtimeMember.teamRunId,
    config,
  );
  const currentEntry = runtimeState.members.find(
    (member) => member.name === runtimeMember.memberName,
  );
  if (currentEntry === undefined) return;
  if (!allowedSources.has(currentEntry.status)) return;

  await transitionRuntimeStateImpl(
    runtimeState.teamRunId,
    (currentRuntimeState) => ({
      ...currentRuntimeState,
      members: currentRuntimeState.members.map((member) =>
        member.name === runtimeMember.memberName
          ? { ...member, status: nextStatus }
          : member,
      ),
    }),
    config,
  );

  log(`team member ${eventLabel}`, {
    event: `team-mode-member-${eventLabel}`,
    teamRunId: runtimeState.teamRunId,
    teamName: runtimeState.teamName,
    memberName: runtimeMember.memberName,
    sessionID,
    previousStatus: currentEntry.status,
    nextStatus,
  });
}

/**
 * Create an event handler for team session events.
 * Call this from the main event hook.
 */
export function createTeamSessionEventHandler(
  config: TeamModeConfig,
  client?: PluginInput['client'],
  deps?: {
    lookupTeamSession?: typeof lookupTeamSession;
    loadRuntimeState?: typeof loadRuntimeState;
    transitionRuntimeState?: typeof transitionRuntimeState;
    onMemberIdle?: typeof onMemberIdle;
  },
) {
  const lookupTeamSessionImpl = deps?.lookupTeamSession ?? lookupTeamSession;
  const onMemberIdleImpl = deps?.onMemberIdle ?? onMemberIdle;

  return async (event: {
    type: string;
    properties?: unknown;
  }): Promise<void> => {
    // Handle session.idle → member becomes idle
    if (event.type === 'session.idle') {
      const sessionID = resolveSessionID(event.properties);
      if (!sessionID) return;

      try {
        const teamSession = lookupTeamSessionImpl(sessionID);
        if (!teamSession) return;

        await transitionMemberStatus(
          teamSession,
          IDLE_TRANSITION_SOURCE_STATUSES,
          'idle',
          config,
          sessionID,
          'idled',
          deps,
        );

        if (client) {
          await onMemberIdleImpl(
            teamSession.teamRunId,
            teamSession.memberName,
            client,
          );
        }
      } catch (error) {
        log('team session event handler failed on session.idle', {
          event: 'team-mode-session-event-error',
          sessionID,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    // Handle session.deleted → member completed
    if (event.type === 'session.deleted') {
      const sessionID = resolveSessionID(event.properties);
      if (!sessionID) return;

      try {
        const teamSession = lookupTeamSessionImpl(sessionID);
        if (!teamSession) return;

        await transitionMemberStatus(
          teamSession,
          COMPLETED_TRANSITION_SOURCE_STATUSES,
          'completed',
          config,
          sessionID,
          'completed',
          deps,
        );
      } catch (error) {
        log('team session event handler failed on session.deleted', {
          event: 'team-mode-session-event-error',
          sessionID,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
}

/**
 * Extract session ID from event properties.
 */
function resolveSessionID(properties: unknown): string | undefined {
  if (!properties || typeof properties !== 'object') return undefined;
  const props = properties as Record<string, unknown>;

  // Try direct sessionID
  if (typeof props.sessionID === 'string') return props.sessionID;

  // Try info.id (for session.created/deleted)
  if (props.info && typeof props.info === 'object') {
    const info = props.info as Record<string, unknown>;
    if (typeof info.id === 'string') return info.id;
  }

  return undefined;
}

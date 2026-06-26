import type { TeamModeConfig } from '../../config/schema/team-mode';
import { findResolvedMemberSession } from '../../features/team-mode/member-session-resolution';
import { sendMessage } from '../../features/team-mode/team-mailbox/send';
import {
  loadRuntimeState,
  transitionRuntimeState,
} from '../../features/team-mode/team-state-store/store';
import { resolveSessionEventID } from '../../shared/event-session-id';
import { log } from '../../shared/logger';

type HookInput = { event: { type: string; properties?: unknown } };
export type HookImpl = (input: HookInput) => Promise<void>;

function extractErrorText(properties: unknown): string {
  if (properties instanceof Error) {
    return properties.message;
  }
  if (typeof properties === 'object' && properties !== null) {
    const props = properties as Record<string, unknown>;
    if (typeof props.error === 'string') return props.error;
    if (props.error instanceof Error) return props.error.message;
  }
  return 'unknown error';
}

export function createTeamMemberErrorHandler(config: TeamModeConfig): HookImpl {
  return async ({ event }: HookInput): Promise<void> => {
    if (event.type !== 'session.error') return;

    const erroredSessionID = resolveSessionEventID(event.properties);
    if (!erroredSessionID) return;

    try {
      const runtimeMember = await findResolvedMemberSession(
        erroredSessionID,
        config,
        'team member error handler',
      );
      if (runtimeMember === null) return;

      const runtimeState = await loadRuntimeState(
        runtimeMember.teamRunId,
        config,
      );
      const memberEntry = runtimeState.members.find(
        (member) => member.name === runtimeMember.memberName,
      );
      if (!memberEntry) return;

      await transitionRuntimeState(
        runtimeState.teamRunId,
        (currentRuntimeState) => ({
          ...currentRuntimeState,
          members: currentRuntimeState.members.map((member) =>
            member.name === runtimeMember.memberName
              ? { ...member, status: 'errored', pendingInjectedMessageIds: [] }
              : member,
          ),
        }),
        config,
      );

      const leaderMember = runtimeState.members.find(
        (member) => member.agentType === 'leader',
      );
      if (
        leaderMember !== undefined &&
        leaderMember.name !== runtimeMember.memberName
      ) {
        const errorText = extractErrorText(event.properties);
        const errorBody = `Team member "${runtimeMember.memberName}" has entered an error state and will not complete its task.\nError: ${errorText}`;
        try {
          await sendMessage(
            runtimeState.teamName,
            leaderMember.name,
            'system',
            errorBody,
            'announcement',
          );
        } catch (sendError) {
          log(
            'team member error handler: failed to notify lead of member error',
            {
              event: 'team-mode-member-error-notify-failed',
              teamRunId: runtimeState.teamRunId,
              memberName: runtimeMember.memberName,
              error:
                sendError instanceof Error
                  ? sendError.message
                  : String(sendError),
            },
          );
        }
      }

      log('team member session errored', {
        event: 'team-mode-member-errored',
        teamRunId: runtimeState.teamRunId,
        teamName: runtimeState.teamName,
        memberName: runtimeMember.memberName,
        sessionID: erroredSessionID,
        runtimeStatus: runtimeState.status,
      });
    } catch (error) {
      log('team member error handler failed', {
        event: 'team-mode-member-error-handler-error',
        sessionID: erroredSessionID,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

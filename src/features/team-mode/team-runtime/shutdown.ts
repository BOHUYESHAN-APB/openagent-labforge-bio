// Team runtime shutdown — supports both legacy (teamName) and new (teamRunId + config) interfaces
import type { PluginInput } from '@opencode-ai/plugin';
import type { TeamModeConfig } from '../../../config/schema/team-mode';
import { log } from '../../../shared/logger';
import { unregisterTeamSessionsByTeam } from '../team-session-registry';
import {
  deleteRuntimeState,
  loadRuntimeState as loadByTeamName,
  saveRuntimeState as saveByTeamName,
} from '../team-state-store/index';
import type { RuntimeState } from '../types';

// --- Legacy interface (teamName-based, for backward compat) ---

export async function deleteTeam(
  teamName: string,
  client?: PluginInput['client'],
): Promise<void> {
  const state = await loadByTeamName(teamName);

  if (state && client) {
    // Abort all member sessions
    await abortAllMemberSessions(state, client);
  }

  // Unregister all team sessions
  if (state) {
    unregisterTeamSessionsByTeam(state.teamRunId);
  }

  // Delete runtime state
  await deleteRuntimeState(teamName);
}

/**
 * Abort all member sessions in a team.
 */
async function abortAllMemberSessions(
  state: RuntimeState,
  client: PluginInput['client'],
): Promise<void> {
  const directory = process.cwd();

  for (const member of state.members) {
    if (member.sessionId) {
      try {
        await client.session.abort({
          path: { id: member.sessionId },
          query: { directory },
        });
        log('[team-shutdown] Aborted member session', {
          teamRunId: state.teamRunId,
          memberName: member.name,
          sessionId: member.sessionId,
        });
      } catch (error) {
        log('[team-shutdown] Failed to abort member session', {
          teamRunId: state.teamRunId,
          memberName: member.name,
          sessionId: member.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export async function requestShutdown(
  teamName: string,
  memberId: string,
  requesterName: string,
): Promise<RuntimeState | null> {
  const state = await loadByTeamName(teamName);
  if (!state) return null;

  state.shutdownRequests.push({
    memberId,
    requesterName,
    requestedAt: Date.now(),
  });

  state.status = 'shutdown_requested';
  await saveByTeamName(teamName, state);
  return state;
}

export async function approveShutdown(
  teamName: string,
  memberId: string,
  _approverName?: string,
  _config?: TeamModeConfig,
  client?: PluginInput['client'],
): Promise<RuntimeState | null> {
  const state = await loadByTeamName(teamName);
  if (!state) return null;

  const request = state.shutdownRequests.find((r) => r.memberId === memberId);
  if (request) {
    request.approvedAt = Date.now();
  }

  // Find and abort the member's session
  const member = state.members.find((m) => m.name === memberId);
  if (member?.sessionId && client) {
    const directory = process.cwd();
    try {
      await client.session.abort({
        path: { id: member.sessionId },
        query: { directory },
      });
      member.status = 'shutdown_approved';
      log('[team-shutdown] Approved shutdown and aborted member session', {
        teamRunId: state.teamRunId,
        memberName: memberId,
        sessionId: member.sessionId,
      });
    } catch (error) {
      log('[team-shutdown] Failed to abort member session on approval', {
        teamRunId: state.teamRunId,
        memberName: memberId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await saveByTeamName(teamName, state);
  return state;
}

export async function rejectShutdown(
  teamName: string,
  memberId: string,
  reason: string,
  _config?: TeamModeConfig,
): Promise<RuntimeState | null> {
  const state = await loadByTeamName(teamName);
  if (!state) return null;

  const request = state.shutdownRequests.find((r) => r.memberId === memberId);
  if (request) {
    request.rejectedReason = reason;
    request.rejectedAt = Date.now();
  }

  await saveByTeamName(teamName, state);
  return state;
}

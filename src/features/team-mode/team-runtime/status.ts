/**
 * Team Runtime Status
 *
 * Aggregates comprehensive team status including members, tasks,
 * unread messages, and concurrency information.
 *
 * Inspired by OMO's aggregateStatus function.
 */

import type { TeamModeConfig } from '../../../config/schema/team-mode';
import { log } from '../../../shared/logger';
import { loadRuntimeState } from '../team-state-store/store';
import { listTasks } from '../team-tasklist/list';
import type { RuntimeState, Task } from '../types';
import { getTeamSessions } from './session-to-team-registry';

export interface TeamMemberStatus {
  name: string;
  sessionId?: string;
  status: RuntimeState['members'][number]['status'];
  color?: string;
  worktreePath?: string;
  unreadMessages: number;
  paneId?: string;
  agentType: string;
  category?: string;
  subagent_type?: string;
}

export interface TeamTaskStatus {
  pending: number;
  claimed: number;
  in_progress: number;
  completed: number;
  deleted: number;
  total: number;
}

export interface TeamStatus {
  teamName: string;
  teamRunId: string;
  status: RuntimeState['status'];
  leadSessionId?: string;
  createdAt: number;
  members: TeamMemberStatus[];
  tasks: TeamTaskStatus;
  shutdownRequests: RuntimeState['shutdownRequests'];
  bounds: RuntimeState['bounds'];
  registeredSessions: number;
}

/**
 * Count tasks by status.
 */
function countTasks(tasks: Task[]): TeamTaskStatus {
  const counts: TeamTaskStatus = {
    pending: 0,
    claimed: 0,
    in_progress: 0,
    completed: 0,
    deleted: 0,
    total: 0,
  };

  for (const task of tasks) {
    counts[task.status] += 1;
    counts.total += 1;
  }

  return counts;
}

/**
 * Aggregate comprehensive team status.
 */
export async function aggregateStatus(
  teamRunId: string,
  config: TeamModeConfig,
): Promise<TeamStatus | null> {
  try {
    const runtimeState = await loadRuntimeState(teamRunId, config);
    if (!runtimeState) return null;

    // Get tasks
    const tasks = await listTasks(teamRunId, config);

    // Get registered sessions for this team
    const registeredSessions = getTeamSessions(teamRunId);

    // Build member status with session info
    const members: TeamMemberStatus[] = runtimeState.members.map((member) => {
      // Find registered session for this member
      const registeredSession = registeredSessions.find(
        (s) => s.memberName === member.name,
      );

      return {
        name: member.name,
        sessionId: member.sessionId || registeredSession?.sessionId,
        status: member.status,
        color: member.color,
        worktreePath: member.worktreePath,
        unreadMessages: 0, // TODO: integrate with mailbox
        paneId: member.tmuxPaneId,
        agentType: member.agentType,
        category: member.category,
        subagent_type: member.subagent_type,
      };
    });

    return {
      teamName: runtimeState.teamName,
      teamRunId: runtimeState.teamRunId,
      status: runtimeState.status,
      leadSessionId: runtimeState.leadSessionId,
      createdAt: runtimeState.createdAt,
      members,
      tasks: countTasks(tasks),
      shutdownRequests: runtimeState.shutdownRequests,
      bounds: runtimeState.bounds,
      registeredSessions: registeredSessions.length,
    };
  } catch (error) {
    log('team status aggregation failed', {
      event: 'team-status-aggregation-error',
      teamRunId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * List all active teams with their status.
 */
export async function listAllTeamStatuses(
  config: TeamModeConfig,
): Promise<TeamStatus[]> {
  try {
    const { listActiveTeams } = await import('../team-state-store/index');
    const activeTeams = await listActiveTeams();

    const statuses: TeamStatus[] = [];
    for (const team of activeTeams) {
      const status = await aggregateStatus(team.teamRunId, config);
      if (status) {
        statuses.push(status);
      }
    }

    return statuses;
  } catch (error) {
    log('list all team statuses failed', {
      event: 'team-list-statuses-error',
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

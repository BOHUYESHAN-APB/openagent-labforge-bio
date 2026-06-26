// Team registry paths

import { homedir } from 'node:os';
import { join } from 'node:path';
import type { TeamModeConfig } from '../../../config/schema/team-mode';

export function getTeamBaseDir(): string {
  return join(homedir(), '.omo', 'teams');
}

export function resolveBaseDir(config?: TeamModeConfig): string {
  return config?.base_dir || join(homedir(), '.omo');
}

export function getRuntimeStateDir(baseDir: string, teamRunId: string): string {
  return join(baseDir, 'runtime', teamRunId);
}

export function getInboxDir(
  baseDir: string,
  teamRunId: string,
  memberName: string,
): string {
  return join(baseDir, 'runtime', teamRunId, 'inboxes', memberName);
}

export function getTasksDir(baseDir: string, teamRunId: string): string {
  return join(baseDir, 'runtime', teamRunId, 'tasks');
}

export function getTeamDir(teamName: string): string {
  return join(getTeamBaseDir(), teamName);
}

export function getTeamConfigPath(teamName: string): string {
  return join(getTeamDir(teamName), 'config.json');
}

export function getTeamStatePath(teamName: string): string {
  return join(getTeamDir(teamName), 'state.json');
}

export function getTeamMailboxDir(teamName: string): string {
  return join(getTeamDir(teamName), 'mailbox');
}

export function getTeamTasklistPath(teamName: string): string {
  return join(getTeamDir(teamName), 'tasklist.jsonl');
}

export function getTeamWorktreeDir(
  teamName: string,
  memberName: string,
): string {
  return join(getTeamDir(teamName), 'worktrees', memberName);
}

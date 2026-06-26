// Team worktree manager
import { mkdir, rm } from 'node:fs/promises';
import { getTeamWorktreeDir } from '../team-registry/paths';

export async function createWorktree(
  teamName: string,
  memberName: string,
): Promise<string> {
  const worktreeDir = getTeamWorktreeDir(teamName, memberName);
  await mkdir(worktreeDir, { recursive: true });
  return worktreeDir;
}

export async function removeWorktree(
  teamName: string,
  memberName: string,
): Promise<void> {
  const worktreeDir = getTeamWorktreeDir(teamName, memberName);
  try {
    await rm(worktreeDir, { recursive: true, force: true });
  } catch {
    // Ignore if directory doesn't exist
  }
}

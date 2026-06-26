// Team worktree cleanup
import { removeWorktree } from './manager';

export async function cleanupWorktrees(
  teamName: string,
  memberNames: string[],
): Promise<void> {
  for (const memberName of memberNames) {
    await removeWorktree(teamName, memberName);
  }
}

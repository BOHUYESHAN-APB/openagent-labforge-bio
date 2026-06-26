// Team state store
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getTeamBaseDir, getTeamStatePath } from '../team-registry/paths';
import type { RuntimeState } from '../types';
import { RuntimeStateSchema } from '../types';

export async function loadRuntimeState(
  teamName: string,
): Promise<RuntimeState | null> {
  try {
    const statePath = getTeamStatePath(teamName);
    const content = await readFile(statePath, 'utf-8');
    const data = JSON.parse(content);
    return RuntimeStateSchema.parse(data);
  } catch {
    return null;
  }
}

export async function saveRuntimeState(
  teamName: string,
  state: RuntimeState,
): Promise<void> {
  const statePath = getTeamStatePath(teamName);
  const dir = dirname(statePath);
  await mkdir(dir, { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

export async function deleteRuntimeState(teamName: string): Promise<void> {
  try {
    const { unlink } = await import('node:fs/promises');
    const statePath = getTeamStatePath(teamName);
    await unlink(statePath);
  } catch {
    // Ignore if file doesn't exist
  }
}

export async function listActiveTeams(): Promise<
  Array<{
    teamRunId: string;
    teamName: string;
    status: string;
    memberCount: number;
  }>
> {
  try {
    const baseDir = getTeamBaseDir();
    const entries = await readdir(baseDir, { withFileTypes: true });
    const teams: Array<{
      teamRunId: string;
      teamName: string;
      status: string;
      memberCount: number;
    }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const state = await loadRuntimeState(entry.name);
      if (!state) continue;
      teams.push({
        teamRunId: state.teamRunId,
        teamName: state.teamName,
        status: state.status,
        memberCount: state.members.length,
      });
    }

    return teams;
  } catch {
    return [];
  }
}

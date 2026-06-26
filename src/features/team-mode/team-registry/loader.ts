// Team registry loader
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { TeamSpec } from '../types';
import { TeamSpecSchema } from '../types';
import { getTeamConfigPath, getTeamDir } from './paths';

export async function loadTeamSpec(teamName: string): Promise<TeamSpec | null> {
  try {
    const configPath = getTeamConfigPath(teamName);
    const content = await readFile(configPath, 'utf-8');
    const data = JSON.parse(content);
    return TeamSpecSchema.parse(data);
  } catch {
    return null;
  }
}

export async function saveTeamSpec(
  teamName: string,
  spec: TeamSpec,
): Promise<void> {
  const configPath = getTeamConfigPath(teamName);
  const dir = dirname(configPath);
  await mkdir(dir, { recursive: true });
  await writeFile(configPath, JSON.stringify(spec, null, 2));
}

export async function listTeams(): Promise<string[]> {
  try {
    const { readdir } = await import('node:fs/promises');
    const baseDir = dirname(getTeamConfigPath('dummy'));
    const entries = await readdir(baseDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getGlobalMemoryDir,
} from '../paths/plugin-paths';

export interface GlobalMemoryIndex {
  repositories: Map<string, RepositoryIndex>;
  lastUpdated: number;
}

export interface RepositoryIndex {
  repositoryId: string;
  workspaceRoots: string[];
  globalKnowledge: string[];
  patterns: string[];
  lastActivity: number;
}

interface PersistedGlobalIndex {
  repositories: Array<{
    repositoryId: string;
    workspaceRoots: string[];
    globalKnowledge: string[];
    patterns: string[];
    lastActivity: number;
  }>;
  lastUpdated: number;
}

function globalIndexFile(): string {
  return join(getGlobalMemoryDir(), 'global-memory-index.json');
}

function globalIndexCandidates(): string[] {
  return [globalIndexFile()];
}

export function loadGlobalIndex(): GlobalMemoryIndex {
  const filePath = globalIndexCandidates().find((candidate) =>
    existsSync(candidate),
  );

  if (!filePath) {
    return {
      repositories: new Map(),
      lastUpdated: Date.now(),
    };
  }

  const persisted = JSON.parse(
    readFileSync(filePath, 'utf-8'),
  ) as PersistedGlobalIndex;

  return {
    repositories: new Map(
      persisted.repositories.map((repo) => [repo.repositoryId, repo]),
    ),
    lastUpdated: persisted.lastUpdated,
  };
}

export function saveGlobalIndex(index: GlobalMemoryIndex): void {
  const globalDir = getGlobalMemoryDir();
  mkdirSync(globalDir, { recursive: true });

  const persisted: PersistedGlobalIndex = {
    repositories: Array.from(index.repositories.values()),
    lastUpdated: Date.now(),
  };

  writeFileSync(globalIndexFile(), JSON.stringify(persisted, null, 2));
}

export function registerWorkspace(
  repositoryId: string,
  workspaceRoot: string,
): void {
  const index = loadGlobalIndex();
  let repo = index.repositories.get(repositoryId);

  if (!repo) {
    repo = {
      repositoryId,
      workspaceRoots: [],
      globalKnowledge: [],
      patterns: [],
      lastActivity: Date.now(),
    };
    index.repositories.set(repositoryId, repo);
  }

  if (!repo.workspaceRoots.includes(workspaceRoot)) {
    repo.workspaceRoots.push(workspaceRoot);
    repo.lastActivity = Date.now();
    saveGlobalIndex(index);
  }
}

export function addGlobalKnowledge(
  repositoryId: string,
  knowledge: string,
): void {
  const index = loadGlobalIndex();
  const repo = index.repositories.get(repositoryId);

  if (repo && !repo.globalKnowledge.includes(knowledge)) {
    repo.globalKnowledge.push(knowledge);
    repo.lastActivity = Date.now();
    saveGlobalIndex(index);
  }
}

export function addGlobalPattern(repositoryId: string, pattern: string): void {
  const index = loadGlobalIndex();
  const repo = index.repositories.get(repositoryId);

  if (repo && !repo.patterns.includes(pattern)) {
    repo.patterns.push(pattern);
    repo.lastActivity = Date.now();
    saveGlobalIndex(index);
  }
}

export function removeGlobalKnowledge(
  repositoryId: string,
  knowledge: string,
): boolean {
  const index = loadGlobalIndex();
  const repo = index.repositories.get(repositoryId);

  if (!repo) return false;
  const before = repo.globalKnowledge.length;
  repo.globalKnowledge = repo.globalKnowledge.filter((item) => item !== knowledge);
  const removed = repo.globalKnowledge.length !== before;
  if (removed) {
    repo.lastActivity = Date.now();
    saveGlobalIndex(index);
  }
  return removed;
}

export function removeGlobalPattern(
  repositoryId: string,
  pattern: string,
): boolean {
  const index = loadGlobalIndex();
  const repo = index.repositories.get(repositoryId);

  if (!repo) return false;
  const before = repo.patterns.length;
  repo.patterns = repo.patterns.filter((item) => item !== pattern);
  const removed = repo.patterns.length !== before;
  if (removed) {
    repo.lastActivity = Date.now();
    saveGlobalIndex(index);
  }
  return removed;
}

export function getRepositoryWorkspaces(repositoryId: string): string[] {
  const index = loadGlobalIndex();
  return index.repositories.get(repositoryId)?.workspaceRoots ?? [];
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getProjectMemoryDir,
} from '../paths/plugin-paths';
import type {
  CheckpointStorage,
  RepositoryMemory,
  SessionMemory,
  WorkspaceMemory,
} from './types';

interface PersistedWorkspaceMemory extends Omit<WorkspaceMemory, 'sessions'> {
  sessionIDs: string[];
}

interface PersistedRepositoryMemory
  extends Omit<RepositoryMemory, 'workspaces'> {
  workspaceRoots: string[];
}

interface PersistedCheckpointStorage {
  sessions: SessionMemory[];
  workspaces: PersistedWorkspaceMemory[];
  repositories: PersistedRepositoryMemory[];
}

function storageFile(workspaceRoot: string): string {
  return join(getProjectMemoryDir(workspaceRoot), 'checkpoint-state.json');
}

function storageFileCandidates(workspaceRoot: string): string[] {
  return [storageFile(workspaceRoot)];
}

export function loadCheckpointStorage(
  workspaceRoot: string,
): CheckpointStorage {
  const storage: CheckpointStorage = {
    workingMemory: new Map(),
    conversationMemory: new Map(),
    sessionMemory: new Map(),
    workspaceMemory: new Map(),
    repositoryMemory: new Map(),
  };

  const filePath = storageFileCandidates(workspaceRoot).find((candidate) =>
    existsSync(candidate),
  );
  if (!filePath) return storage;

  const persisted = JSON.parse(
    readFileSync(filePath, 'utf-8'),
  ) as PersistedCheckpointStorage;

  for (const session of persisted.sessions ?? []) {
    storage.sessionMemory.set(session.sessionID, session);
  }

  for (const workspace of persisted.workspaces ?? []) {
    storage.workspaceMemory.set(workspace.workspaceRoot, {
      workspaceRoot: workspace.workspaceRoot,
      repositoryId: workspace.repositoryId,
      sessions: new Map(
        workspace.sessionIDs
          .map((sessionID) => storage.sessionMemory.get(sessionID))
          .filter((session): session is SessionMemory => Boolean(session))
          .map((session) => [session.sessionID, session]),
      ),
      globalContext: workspace.globalContext,
      preferences: workspace.preferences ?? [],
      lastActivity: workspace.lastActivity,
    });
  }

  for (const repository of persisted.repositories ?? []) {
    storage.repositoryMemory.set(repository.repositoryId, {
      repositoryId: repository.repositoryId,
      workspaces: new Map(
        repository.workspaceRoots
          .map((root) => storage.workspaceMemory.get(root))
          .filter((workspace): workspace is WorkspaceMemory =>
            Boolean(workspace),
          )
          .map((workspace) => [workspace.workspaceRoot, workspace]),
      ),
      globalKnowledge: repository.globalKnowledge,
      patterns: repository.patterns,
      preferences: repository.preferences ?? [],
      lastActivity: repository.lastActivity,
    });
  }

  return storage;
}

export function saveCheckpointStorage(
  workspaceRoot: string,
  storage: CheckpointStorage,
): void {
  const memoryDir = getProjectMemoryDir(workspaceRoot);
  mkdirSync(memoryDir, { recursive: true });

  const persisted: PersistedCheckpointStorage = {
    sessions: Array.from(storage.sessionMemory.values()),
    workspaces: Array.from(storage.workspaceMemory.values()).map(
      (workspace) => ({
        workspaceRoot: workspace.workspaceRoot,
        repositoryId: workspace.repositoryId,
        sessionIDs: Array.from(workspace.sessions.keys()),
        globalContext: workspace.globalContext,
        preferences: workspace.preferences,
        lastActivity: workspace.lastActivity,
      }),
    ),
    repositories: Array.from(storage.repositoryMemory.values()).map(
      (repository) => ({
        repositoryId: repository.repositoryId,
        workspaceRoots: Array.from(repository.workspaces.keys()),
        globalKnowledge: repository.globalKnowledge,
        patterns: repository.patterns,
        preferences: repository.preferences,
        lastActivity: repository.lastActivity,
      }),
    ),
  };

  writeFileSync(storageFile(workspaceRoot), JSON.stringify(persisted, null, 2));
}

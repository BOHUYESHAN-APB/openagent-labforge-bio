import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectMemoryDir } from '../paths/plugin-paths';
import type {
  CheckpointMeta,
  CheckpointStorage,
  ContextCheckpoint,
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

// ── File-based checkpoint persistence ────────────────────────────────

function getCheckpointDir(workspaceRoot: string): string {
  return join(workspaceRoot, '.opencode', 'extendai-lab', 'checkpoints');
}

function getCheckpointHistoryDir(
  workspaceRoot: string,
  sessionID: string,
): string {
  return join(getCheckpointDir(workspaceRoot), 'history', sessionID);
}

/**
 * Write a checkpoint markdown file.
 * Returns the file path.
 */
export function writeCheckpointFile(
  workspaceRoot: string,
  checkpoint: ContextCheckpoint,
  content: {
    summary: string;
    goal: string;
    keyDecisions: string[];
    openIssues: string[];
    pendingTasks: string[];
    keyFiles: string[];
    resumeInstructions: string;
  },
): string {
  const checkpointDir = getCheckpointDir(workspaceRoot);
  const historyDir = getCheckpointHistoryDir(workspaceRoot, checkpoint.sessionID);
  mkdirSync(historyDir, { recursive: true });

  const timestamp = new Date(checkpoint.timestamp)
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  const filename = `${timestamp}-${checkpoint.level}.md`;
  const filePath = join(historyDir, filename);

  const md = `CHECKPOINT CONTEXT
==================

SOURCE SESSION
--------------
- Session ID: ${checkpoint.sessionID}
- Created At: ${new Date(checkpoint.timestamp).toISOString()}
- Checkpoint ID: ${checkpoint.id}
- Checkpoint Kind: ${checkpoint.level}
- Trigger: ${checkpoint.trigger}
${checkpoint.preCompactionTimestamp ? `- Pre-compaction: Yes (created before compaction at ${new Date(checkpoint.preCompactionTimestamp).toISOString()})` : ''}

USER REQUESTS (AS-IS)
---------------------
(See conversation history)

GOAL
----
${content.goal}

WORK COMPLETED / CURRENT STATE
-------------------------------
${content.summary}

PENDING TASKS
-------------
${content.pendingTasks.length > 0 ? content.pendingTasks.map((t) => `- ${t}`).join('\n') : '(none)'}

KEY FILES
---------
${content.keyFiles.length > 0 ? content.keyFiles.map((f) => `- ${f}`).join('\n') : '(none)'}

IMPORTANT DECISIONS
-------------------
${content.keyDecisions.length > 0 ? content.keyDecisions.map((d) => `- ${d}`).join('\n') : '(none)'}

OPEN ISSUES
-----------
${content.openIssues.length > 0 ? content.openIssues.map((i) => `- ${i}`).join('\n') : '(none)'}

RESUME INSTRUCTIONS
-------------------
${content.resumeInstructions}
`;

  writeFileSync(filePath, md, 'utf-8');

  // Also update the session's latest.md
  const sessionLatestPath = join(
    checkpointDir,
    'by-session',
    `${checkpoint.sessionID}.md`,
  );
  mkdirSync(join(checkpointDir, 'by-session'), { recursive: true });
  writeFileSync(sessionLatestPath, md, 'utf-8');

  // Also update workspace latest.md
  const workspaceLatestPath = join(checkpointDir, 'latest.md');
  writeFileSync(workspaceLatestPath, md, 'utf-8');

  return filePath;
}

/**
 * Write checkpoint metadata to latest.meta.json
 */
export function writeCheckpointMeta(
  workspaceRoot: string,
  meta: CheckpointMeta,
): void {
  const checkpointDir = getCheckpointDir(workspaceRoot);
  mkdirSync(checkpointDir, { recursive: true });

  const metaPath = join(checkpointDir, 'latest.meta.json');
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

/**
 * Read checkpoint metadata from latest.meta.json
 */
export function readCheckpointMeta(
  workspaceRoot: string,
): CheckpointMeta | null {
  const metaPath = join(
    getCheckpointDir(workspaceRoot),
    'latest.meta.json',
  );
  if (!existsSync(metaPath)) return null;

  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8')) as CheckpointMeta;
  } catch {
    return null;
  }
}

/**
 * Read a checkpoint markdown file by session ID.
 * Returns the file content or null if not found.
 */
export function readCheckpointFile(
  workspaceRoot: string,
  sessionID: string,
): string | null {
  const filePath = join(
    getCheckpointDir(workspaceRoot),
    'by-session',
    `${sessionID}.md`,
  );
  if (!existsSync(filePath)) return null;

  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Read the workspace-level latest checkpoint.
 */
export function readLatestCheckpoint(
  workspaceRoot: string,
): string | null {
  const filePath = join(getCheckpointDir(workspaceRoot), 'latest.md');
  if (!existsSync(filePath)) return null;

  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

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
//
// Directory structure:
//   checkpoints/
//   ├── latest.md                    ← 最新的人工 checkpoint（h 或 l）
//   ├── latest.meta.json
//   ├── by-session/
//   │   └── {session-id}.md          ← 该会话最新的人工 checkpoint
//   ├── by-session-auto/
//   │   └── {session-id}.md          ← 该会话最新的自动压缩 checkpoint
//   └── history/
//       └── {session-id}/
//           ├── {timestamp}-heavy.md ← 历史存档（所有 checkpoint）
//           └── {timestamp}-light.md
//
// 规则：
//   - 人工 checkpoint（/ol-checkpoint）→ latest.md + by-session/ + history/
//   - 自动压缩 checkpoint → by-session-auto/ + history/（不覆盖人工 checkpoint）
//   - 恢复时：优先 by-session/（人工），fallback 到 by-session-auto/（自动）

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
 * Generate checkpoint markdown content.
 */
function generateCheckpointMd(
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
  return `CHECKPOINT CONTEXT
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
}

/**
 * Write a checkpoint markdown file.
 * Returns the file path.
 *
 * For manual checkpoints (trigger != 'auto-compaction'):
 *   - Writes to history/{sessionID}/{timestamp}-{level}.md
 *   - Updates by-session/{sessionID}.md
 *   - Updates latest.md
 *
 * For auto-compaction checkpoints:
 *   - Writes to history/{sessionID}/{timestamp}-{level}.md
 *   - Updates by-session-auto/{sessionID}.md
 *   - Does NOT update latest.md or by-session/ (preserves manual checkpoints)
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
  const historyDir = getCheckpointHistoryDir(
    workspaceRoot,
    checkpoint.sessionID,
  );
  mkdirSync(historyDir, { recursive: true });

  const timestamp = new Date(checkpoint.timestamp)
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  const filename = `${timestamp}-${checkpoint.level}.md`;
  const filePath = join(historyDir, filename);

  const md = generateCheckpointMd(checkpoint, content);
  writeFileSync(filePath, md, 'utf-8');

  const isAutoCompaction = checkpoint.trigger === 'auto-compaction';

  if (isAutoCompaction) {
    // Auto-compaction: only write to by-session-auto/ (don't overwrite manual checkpoints)
    const autoDir = join(checkpointDir, 'by-session-auto');
    mkdirSync(autoDir, { recursive: true });
    const autoPath = join(autoDir, `${checkpoint.sessionID}.md`);
    writeFileSync(autoPath, md, 'utf-8');
  } else {
    // Manual checkpoint: write to by-session/ and latest.md
    const sessionDir = join(checkpointDir, 'by-session');
    mkdirSync(sessionDir, { recursive: true });
    const sessionPath = join(sessionDir, `${checkpoint.sessionID}.md`);
    writeFileSync(sessionPath, md, 'utf-8');

    const latestPath = join(checkpointDir, 'latest.md');
    writeFileSync(latestPath, md, 'utf-8');
  }

  return filePath;
}

/**
 * Write checkpoint metadata.
 * For manual checkpoints: writes to latest.meta.json
 * For auto-compaction: writes to by-session-auto/{sessionID}.meta.json
 */
export function writeCheckpointMeta(
  workspaceRoot: string,
  meta: CheckpointMeta,
  sessionID?: string,
  trigger?: string,
): void {
  const checkpointDir = getCheckpointDir(workspaceRoot);
  mkdirSync(checkpointDir, { recursive: true });

  const isAutoCompaction = trigger === 'auto-compaction';

  if (isAutoCompaction && sessionID) {
    // Auto-compaction: write to by-session-auto/
    const autoDir = join(checkpointDir, 'by-session-auto');
    mkdirSync(autoDir, { recursive: true });
    const metaPath = join(autoDir, `${sessionID}.meta.json`);
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  } else {
    // Manual: write to latest.meta.json
    const metaPath = join(checkpointDir, 'latest.meta.json');
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }
}

/**
 * Read a checkpoint markdown file by session ID.
 * Priority: by-session/ (manual) > by-session-auto/ (auto)
 * Returns the file content or null if not found.
 */
export function readCheckpointFile(
  workspaceRoot: string,
  sessionID: string,
): string | null {
  const checkpointDir = getCheckpointDir(workspaceRoot);

  // Try manual checkpoint first
  const manualPath = join(checkpointDir, 'by-session', `${sessionID}.md`);
  if (existsSync(manualPath)) {
    try {
      return readFileSync(manualPath, 'utf-8');
    } catch {
      // Continue to try auto
    }
  }

  // Try auto-compaction checkpoint
  const autoPath = join(checkpointDir, 'by-session-auto', `${sessionID}.md`);
  if (existsSync(autoPath)) {
    try {
      return readFileSync(autoPath, 'utf-8');
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Read the workspace-level latest checkpoint.
 */
export function readLatestCheckpoint(workspaceRoot: string): string | null {
  const filePath = join(getCheckpointDir(workspaceRoot), 'latest.md');
  if (!existsSync(filePath)) return null;

  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

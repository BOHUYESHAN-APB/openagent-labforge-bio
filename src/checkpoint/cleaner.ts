import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckpointCleanupConfig } from '../config/schema';
import { getProjectMemoryDir } from '../paths/plugin-paths';
import type { CheckpointStorage, ContextCheckpoint } from './types';

export interface CleanupStats {
  checkpointsRemoved: number;
  sessionsAffected: number;
  bytesFreed: number;
}

function getCheckpointDir(workspaceRoot: string): string {
  return join(workspaceRoot, '.opencode', 'extendai-lab', 'checkpoints');
}

/**
 * Scan checkpoint files on disk and remove:
 * - Files in history/ older than maxAge
 * - Files in history/ exceeding maxCheckpointsPerSession
 * - Orphan files in by-session/ and by-session-auto/ for sessions with no
 *   active in-memory state
 */
function cleanupFilesystemCheckpoints(
  workspaceRoot: string,
  storage: CheckpointStorage,
  config: CheckpointCleanupConfig,
  stats: CleanupStats,
): void {
  const checkpointDir = getCheckpointDir(workspaceRoot);
  if (!existsSync(checkpointDir)) return;

  const now = Date.now();
  const maxAge = config.maxAgeMs;
  const maxPerSession = config.maxCheckpointsPerSession;

  // Active session IDs from in-memory storage
  const activeSessionIDs = new Set(storage.sessionMemory.keys());

  // ── Clean history/ directories ──
  const historyDir = join(checkpointDir, 'history');
  if (existsSync(historyDir)) {
    for (const sessionDir of readdirSync(historyDir)) {
      const sessionHistoryPath = join(historyDir, sessionDir);
      const sesStat = statSync(sessionHistoryPath, { throwIfNoEntry: false });
      if (!sesStat?.isDirectory()) continue;

      const files = readdirSync(sessionHistoryPath)
        .filter((f) => f.endsWith('.md'))
        .map((f) => ({
          name: f,
          path: join(sessionHistoryPath, f),
          mtime: statSync(join(sessionHistoryPath, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime); // newest first

      // Remove files older than maxAge
      for (const file of files) {
        if (now - file.mtime > maxAge) {
          try {
            unlinkSync(file.path);
            stats.checkpointsRemoved++;
            stats.bytesFreed += statSync(file.path).size;
          } catch {
            // skip if file is locked or gone
          }
        }
      }

      // Enforce per-session limit on remaining files
      const remaining = readdirSync(sessionHistoryPath)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .reverse(); // newest first by naming convention {timestamp}-{level}.md

      if (remaining.length > maxPerSession) {
        const toRemove = remaining.slice(maxPerSession);
        for (const fileName of toRemove) {
          const filePath = join(sessionHistoryPath, fileName);
          try {
            const size = statSync(filePath).size;
            unlinkSync(filePath);
            stats.checkpointsRemoved++;
            stats.bytesFreed += size;
          } catch {
            // skip
          }
        }
      }
    }
  }

  // ── Clean orphan by-session/ files ──
  const bySessionDir = join(checkpointDir, 'by-session');
  if (existsSync(bySessionDir)) {
    for (const file of readdirSync(bySessionDir)) {
      if (!file.endsWith('.md')) continue;
      const sessionID = file.slice(0, -3); // remove .md
      // Keep file only if session exists in memory
      if (!activeSessionIDs.has(sessionID)) {
        const filePath = join(bySessionDir, file);
        try {
          const size = statSync(filePath).size;
          unlinkSync(filePath);
          stats.checkpointsRemoved++;
          stats.bytesFreed += size;
        } catch {
          // skip
        }
      }
    }
  }

  // ── Clean orphan by-session-auto/ files ──
  const autoDir = join(checkpointDir, 'by-session-auto');
  if (existsSync(autoDir)) {
    for (const file of readdirSync(autoDir)) {
      if (!file.endsWith('.md') && !file.endsWith('.meta.json')) continue;
      const sessionID = file.replace(/\.(md|meta\.json)$/, '');
      if (!activeSessionIDs.has(sessionID)) {
        const filePath = join(autoDir, file);
        try {
          const size = statSync(filePath).size;
          unlinkSync(filePath);
          stats.checkpointsRemoved++;
          stats.bytesFreed += size;
        } catch {
          // skip
        }
      }
    }
  }
}

export function cleanupCheckpoints(
  workspaceRoot: string,
  storage: CheckpointStorage,
  config: CheckpointCleanupConfig,
): CleanupStats {
  const stats: CleanupStats = {
    checkpointsRemoved: 0,
    sessionsAffected: 0,
    bytesFreed: 0,
  };

  if (!config.enabled) return stats;

  const now = Date.now();
  const maxAge = config.maxAgeMs;
  const maxPerSession = config.maxCheckpointsPerSession;

  // Clean in-memory checkpoints by age and per-session limit
  for (const [sessionID, session] of storage.sessionMemory.entries()) {
    const originalCount = session.checkpoints.length;
    if (originalCount === 0) continue;

    // Filter by age
    let filtered = session.checkpoints.filter(
      (cp) => now - cp.timestamp <= maxAge,
    );

    // Keep only most recent N checkpoints
    if (filtered.length > maxPerSession) {
      filtered = filtered
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, maxPerSession)
        .sort((a, b) => a.timestamp - b.timestamp);
    }

    const removed = originalCount - filtered.length;
    if (removed > 0) {
      session.checkpoints = filtered;
      stats.checkpointsRemoved += removed;
      stats.sessionsAffected++;
    }
  }

  // Clean by total size if limit is set
  if (config.maxTotalSizeMb > 0) {
    const stateFile = join(
      getProjectMemoryDir(workspaceRoot),
      'checkpoint-state.json',
    );
    try {
      const currentSizeBytes = statSync(stateFile).size;
      const maxSizeBytes = config.maxTotalSizeMb * 1024 * 1024;

      if (currentSizeBytes > maxSizeBytes) {
        const allCheckpoints: Array<{
          sessionID: string;
          checkpoint: ContextCheckpoint;
        }> = [];

        for (const [sessionID, session] of storage.sessionMemory.entries()) {
          for (const cp of session.checkpoints) {
            allCheckpoints.push({ sessionID, checkpoint: cp });
          }
        }

        // Sort by timestamp (oldest first)
        allCheckpoints.sort(
          (a, b) => a.checkpoint.timestamp - b.checkpoint.timestamp,
        );

        // Remove oldest checkpoints until under size limit
        // Rough estimate: remove 20% of checkpoints at a time
        const toRemove = Math.ceil(allCheckpoints.length * 0.2);
        const removed = allCheckpoints.slice(0, toRemove);

        for (const { sessionID, checkpoint } of removed) {
          const session = storage.sessionMemory.get(sessionID);
          if (session) {
            const index = session.checkpoints.findIndex(
              (cp) => cp.id === checkpoint.id,
            );
            if (index !== -1) {
              session.checkpoints.splice(index, 1);
              stats.checkpointsRemoved++;
            }
          }
        }

        stats.bytesFreed = currentSizeBytes - maxSizeBytes;
      }
    } catch {
      // File doesn't exist yet or can't be read - skip size-based cleanup
    }
  }

  // Filesystem scan cleanup (orphan files, history retention, age)
  cleanupFilesystemCheckpoints(workspaceRoot, storage, config, stats);

  return stats;
}

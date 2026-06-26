import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CheckpointCleanupConfig } from '../config/schema';
import { CheckpointManager } from './manager';
import {
  readCheckpointFile,
  readLatestCheckpoint,
  writeCheckpointFile,
  writeCheckpointMeta,
} from './persistence';
import type { CheckpointMeta, ContextCheckpoint } from './types';

function checkpointDir(root: string): string {
  return join(root, '.opencode', 'extendai-lab', 'checkpoints');
}

function makeCheckpoint(
  id: string,
  sessionID: string,
  level: 'light' | 'heavy' = 'light',
  trigger: ContextCheckpoint['trigger'] = 'manual',
  timestamp: number = Date.now(),
): ContextCheckpoint {
  return {
    id,
    timestamp,
    sessionID,
    summary: `Checkpoint ${id}`,
    keyDecisions: [],
    openIssues: [],
    tokenCount: 0,
    level,
    status: 'active',
    trigger,
  };
}

const sampleContent = {
  summary: 'Work progress',
  goal: 'Test goal for checkpoint',
  keyDecisions: ['Decision A'],
  openIssues: ['Issue A'],
  pendingTasks: ['Task 1'],
  keyFiles: ['src/file.ts'],
  resumeInstructions: 'Continue working',
};

const farFutureConfig: CheckpointCleanupConfig = {
  enabled: true,
  maxAgeMs: 365 * 24 * 60 * 60 * 1000, // 1 year
  maxCheckpointsPerSession: 100,
  maxTotalSizeMb: 0,
};

// ──────────────────────────────────────────────────────────────────────
// 1. Manual checkpoint — writes to history/ + by-session/ + latest.md
// ──────────────────────────────────────────────────────────────────────
describe('writeCheckpointFile — manual checkpoint', () => {
  test('writes to history/{sessionID}/, by-session/{sessionID}.md, and latest.md', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-manual-fs-'));
    try {
      const cp = makeCheckpoint('cp1', 'session-manual', 'light', 'manual');
      writeCheckpointFile(root, cp, sampleContent);

      const dir = checkpointDir(root);

      // by-session/ file
      const sessionPath = join(dir, 'by-session', 'session-manual.md');
      expect(existsSync(sessionPath)).toBe(true);

      // latest.md
      const latestPath = join(dir, 'latest.md');
      expect(existsSync(latestPath)).toBe(true);

      // history/ file
      const historyDir = join(dir, 'history', 'session-manual');
      expect(existsSync(historyDir)).toBe(true);
      const historyFiles = readdirSync(historyDir).filter((f) =>
        f.endsWith('.md'),
      );
      expect(historyFiles).toHaveLength(1);
      expect(historyFiles[0]).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-light\.md$/,
      );

      // Content consistency across all three locations
      const sessionContent = readFileSync(sessionPath, 'utf-8');
      const latestContent = readFileSync(latestPath, 'utf-8');
      const historyContent = readFileSync(
        join(historyDir, historyFiles[0]),
        'utf-8',
      );
      expect(sessionContent).toBe(latestContent);
      expect(sessionContent).toBe(historyContent);
      expect(sessionContent).toContain('Test goal for checkpoint');
      expect(sessionContent).toContain('manual');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('heavy-level manual checkpoint filename ends with -heavy.md', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-heavy-'));
    try {
      const cp = makeCheckpoint('cp-heavy', 'session-heavy', 'heavy', 'manual');
      writeCheckpointFile(root, cp, sampleContent);

      const historyDir = join(checkpointDir(root), 'history', 'session-heavy');
      const files = readdirSync(historyDir).filter((f) => f.endsWith('.md'));
      expect(files[0]).toMatch(/heavy\.md$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('writeCheckpointMeta for manual → latest.meta.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-meta-manual-'));
    try {
      const meta: CheckpointMeta = {
        checkpoint_id: 'cp-manual-1',
        checkpoint_level: 'light',
        checkpoint_status: 'active',
        checkpoint_trigger: 'manual',
        source_session_id: 'session-manual',
        created_at: new Date().toISOString(),
        goal: 'Test goal',
        session_switch_recommendation: 'stay',
      };
      writeCheckpointMeta(root, meta);

      const dir = checkpointDir(root);
      expect(existsSync(join(dir, 'latest.meta.json'))).toBe(true);
      const parsed = JSON.parse(
        readFileSync(join(dir, 'latest.meta.json'), 'utf-8'),
      );
      expect(parsed.checkpoint_id).toBe('cp-manual-1');
      expect(parsed.source_session_id).toBe('session-manual');
      expect(parsed.checkpoint_trigger).toBe('manual');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────
// 2. Auto-compaction — writes to history/ + by-session-auto/
//    Does NOT touch latest.md or by-session/
// ──────────────────────────────────────────────────────────────────────
describe('writeCheckpointFile — auto-compaction checkpoint', () => {
  test('writes to history/ and by-session-auto/, NOT to latest.md or by-session/', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-auto-fs-'));
    try {
      const cp = makeCheckpoint(
        'cp2',
        'session-auto',
        'light',
        'auto-compaction',
      );
      writeCheckpointFile(root, cp, sampleContent);

      const dir = checkpointDir(root);

      // Should exist
      expect(existsSync(join(dir, 'by-session-auto', 'session-auto.md'))).toBe(
        true,
      );

      // Should NOT exist
      expect(existsSync(join(dir, 'latest.md'))).toBe(false);
      expect(existsSync(join(dir, 'by-session', 'session-auto.md'))).toBe(
        false,
      );

      // History should exist
      const historyDir = join(dir, 'history', 'session-auto');
      expect(existsSync(historyDir)).toBe(true);
      const historyFiles = readdirSync(historyDir).filter((f) =>
        f.endsWith('.md'),
      );
      expect(historyFiles).toHaveLength(1);

      // Content consistency
      const autoContent = readFileSync(
        join(dir, 'by-session-auto', 'session-auto.md'),
        'utf-8',
      );
      const historyContent = readFileSync(
        join(historyDir, historyFiles[0]),
        'utf-8',
      );
      expect(autoContent).toBe(historyContent);
      expect(autoContent).toContain('auto-compaction');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('auto-compaction does not overwrite existing manual checkpoint', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-no-overwrite-'));
    try {
      // Write manual first
      const manualCp = makeCheckpoint(
        'cp-manual',
        'session-mixed',
        'heavy',
        'manual',
      );
      writeCheckpointFile(root, manualCp, sampleContent);

      const dir = checkpointDir(root);
      const manualLatestContent = readFileSync(join(dir, 'latest.md'), 'utf-8');
      const manualSessionContent = readFileSync(
        join(dir, 'by-session', 'session-mixed.md'),
        'utf-8',
      );

      // Then write auto-compaction
      const autoCp = makeCheckpoint(
        'cp-auto',
        'session-mixed',
        'light',
        'auto-compaction',
      );
      writeCheckpointFile(root, autoCp, {
        ...sampleContent,
        goal: 'Auto-compaction goal',
      });

      // latest.md and by-session/ should still have the MANUAL content
      expect(readFileSync(join(dir, 'latest.md'), 'utf-8')).toBe(
        manualLatestContent,
      );
      expect(
        readFileSync(join(dir, 'by-session', 'session-mixed.md'), 'utf-8'),
      ).toBe(manualSessionContent);

      // by-session-auto/ should have the auto-compaction content
      const autoContent = readFileSync(
        join(dir, 'by-session-auto', 'session-mixed.md'),
        'utf-8',
      );
      expect(autoContent).toContain('Auto-compaction goal');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('writeCheckpointMeta for auto → by-session-auto/{id}.meta.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-meta-auto-'));
    try {
      const meta: CheckpointMeta = {
        checkpoint_id: 'cp-auto-1',
        checkpoint_level: 'light',
        checkpoint_status: 'active',
        checkpoint_trigger: 'auto-compaction',
        source_session_id: 'session-auto',
        created_at: new Date().toISOString(),
        goal: 'Auto goal',
        session_switch_recommendation: 'stay',
      };
      writeCheckpointMeta(root, meta, 'session-auto', 'auto-compaction');

      const dir = checkpointDir(root);
      const autoMetaPath = join(
        dir,
        'by-session-auto',
        'session-auto.meta.json',
      );
      expect(existsSync(autoMetaPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(autoMetaPath, 'utf-8'));
      expect(parsed.checkpoint_id).toBe('cp-auto-1');
      expect(parsed.source_session_id).toBe('session-auto');

      // latest.meta.json should NOT exist
      expect(existsSync(join(dir, 'latest.meta.json'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────
// 3. Session isolation — separate file trees per session
// ──────────────────────────────────────────────────────────────────────
describe('session isolation', () => {
  test('two sessions produce separate history/ subdirectories', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-isolation-'));
    try {
      const cp1 = makeCheckpoint('cp-a', 'session-alpha', 'light', 'manual');
      const cp2 = makeCheckpoint('cp-b', 'session-beta', 'light', 'manual');
      writeCheckpointFile(root, cp1, sampleContent);
      writeCheckpointFile(root, cp2, sampleContent);

      const dir = checkpointDir(root);

      // Each session has its own history/ subdirectory
      expect(existsSync(join(dir, 'history', 'session-alpha'))).toBe(true);
      expect(existsSync(join(dir, 'history', 'session-beta'))).toBe(true);

      // Each session has its own by-session/ file
      expect(existsSync(join(dir, 'by-session', 'session-alpha.md'))).toBe(
        true,
      );
      expect(existsSync(join(dir, 'by-session', 'session-beta.md'))).toBe(true);

      // latest.md exists (shows the most recent)
      expect(existsSync(join(dir, 'latest.md'))).toBe(true);

      // Verify files are independent
      const alphaContent = readFileSync(
        join(dir, 'by-session', 'session-alpha.md'),
        'utf-8',
      );
      const betaContent = readFileSync(
        join(dir, 'by-session', 'session-beta.md'),
        'utf-8',
      );
      expect(alphaContent).not.toBe(betaContent);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────
// 4. readCheckpointFile priority: by-session/ > by-session-auto/
// ──────────────────────────────────────────────────────────────────────
describe('readCheckpointFile priority', () => {
  test('returns by-session/ content when both exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-read-priority-'));
    try {
      const dir = checkpointDir(root);
      mkdirSync(join(dir, 'by-session'), { recursive: true });
      mkdirSync(join(dir, 'by-session-auto'), { recursive: true });

      writeFileSync(
        join(dir, 'by-session', 'session-X.md'),
        'MANUAL CONTENT',
        'utf-8',
      );
      writeFileSync(
        join(dir, 'by-session-auto', 'session-X.md'),
        'AUTO CONTENT',
        'utf-8',
      );

      const result = readCheckpointFile(root, 'session-X');
      expect(result).toBe('MANUAL CONTENT');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('falls back to by-session-auto/ when by-session/ is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-read-fallback-'));
    try {
      const dir = checkpointDir(root);
      mkdirSync(join(dir, 'by-session-auto'), { recursive: true });

      writeFileSync(
        join(dir, 'by-session-auto', 'session-Y.md'),
        'AUTO CONTENT',
        'utf-8',
      );

      const result = readCheckpointFile(root, 'session-Y');
      expect(result).toBe('AUTO CONTENT');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('returns null when no checkpoint exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-read-null-'));
    try {
      expect(readCheckpointFile(root, 'nonexistent')).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────
// 5. readLatestCheckpoint
// ──────────────────────────────────────────────────────────────────────
describe('readLatestCheckpoint', () => {
  test('returns null when latest.md does not exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-latest-none-'));
    try {
      expect(readLatestCheckpoint(root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('returns content when latest.md exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-latest-exists-'));
    try {
      const cp = makeCheckpoint('cp-latest', 'session-L', 'light', 'manual');
      writeCheckpointFile(root, cp, sampleContent);

      const content = readLatestCheckpoint(root);
      expect(content).not.toBeNull();
      expect(content).toContain('Test goal for checkpoint');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────
// 6. Cleaner — filesystem operations
// ──────────────────────────────────────────────────────────────────────
describe('cleaner — filesystem scan', () => {
  test('removes orphan files in by-session/ for sessions not in memory', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-clean-orphan-'));
    try {
      const dir = checkpointDir(root);
      mkdirSync(join(dir, 'by-session'), { recursive: true });
      mkdirSync(join(dir, 'by-session-auto'), { recursive: true });

      writeFileSync(
        join(dir, 'by-session', 'orphan-A.md'),
        'orphan A',
        'utf-8',
      );
      writeFileSync(
        join(dir, 'by-session', 'orphan-B.md'),
        'orphan B',
        'utf-8',
      );
      writeFileSync(
        join(dir, 'by-session-auto', 'orphan-C.md'),
        'orphan C',
        'utf-8',
      );

      // Only session-KEEP is in memory
      const manager = new CheckpointManager(root);
      manager.initializeSession('session-KEEP', root);

      manager.cleanup(farFutureConfig);

      // Orphan files should be deleted
      expect(existsSync(join(dir, 'by-session', 'orphan-A.md'))).toBe(false);
      expect(existsSync(join(dir, 'by-session', 'orphan-B.md'))).toBe(false);
      expect(existsSync(join(dir, 'by-session-auto', 'orphan-C.md'))).toBe(
        false,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('keeps by-session/ files for sessions in memory', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-clean-keep-'));
    try {
      const manager = new CheckpointManager(root);
      manager.initializeSession('session-KEPT', root);

      // Create a checkpoint to produce files on disk
      manager.createVersionedCheckpoint('session-KEPT', sampleContent, {
        level: 'light',
        trigger: 'manual',
      });

      const dir = checkpointDir(root);
      expect(existsSync(join(dir, 'by-session', 'session-KEPT.md'))).toBe(true);

      // Cleanup should NOT remove it (session is in memory)
      manager.cleanup(farFutureConfig);
      expect(existsSync(join(dir, 'by-session', 'session-KEPT.md'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('removes orphan .meta.json files in by-session-auto/', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-clean-meta-'));
    try {
      const dir = checkpointDir(root);
      mkdirSync(join(dir, 'by-session-auto'), { recursive: true });

      writeFileSync(
        join(dir, 'by-session-auto', 'ghost-session.meta.json'),
        '{}',
        'utf-8',
      );
      writeFileSync(
        join(dir, 'by-session-auto', 'ghost-session.md'),
        'ghost content',
        'utf-8',
      );

      const manager = new CheckpointManager(root);
      manager.initializeSession('active-session', root);

      manager.cleanup(farFutureConfig);

      expect(
        existsSync(join(dir, 'by-session-auto', 'ghost-session.meta.json')),
      ).toBe(false);
      expect(existsSync(join(dir, 'by-session-auto', 'ghost-session.md'))).toBe(
        false,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('removes history files older than maxAgeMs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-clean-age-'));
    try {
      const dir = checkpointDir(root);
      const historyDir = join(dir, 'history', 'session-A');
      mkdirSync(historyDir, { recursive: true });

      // Old file
      writeFileSync(
        join(historyDir, '2026-01-01T00-00-00-light.md'),
        'old content',
        'utf-8',
      );

      // Wait 150ms so the old file's mtime is measurably older
      await new Promise((r) => setTimeout(r, 150));

      // Recent file
      writeFileSync(
        join(historyDir, '2026-06-25T12-00-00-light.md'),
        'recent content',
        'utf-8',
      );

      const manager = new CheckpointManager(root);
      manager.initializeSession('session-A', root);

      // maxAge = 50ms → old file (created ~150+ms ago) removed,
      // recent file (created ~0ms ago) kept
      manager.cleanup({
        enabled: true,
        maxAgeMs: 50,
        maxCheckpointsPerSession: 100,
        maxTotalSizeMb: 0,
      });

      const remaining = readdirSync(historyDir).filter((f) =>
        f.endsWith('.md'),
      );
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toBe('2026-06-25T12-00-00-light.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('trims history files exceeding maxCheckpointsPerSession', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-clean-count-'));
    try {
      const dir = checkpointDir(root);
      const historyDir = join(dir, 'history', 'session-A');
      mkdirSync(historyDir, { recursive: true });

      // Create 10 history files with descending dates
      // The cleaner sorts by reverse lexical order (newest filename first)
      for (let i = 0; i < 10; i++) {
        const day = 25 - i;
        const sec = i; // ensures unique filenames
        const date = `2026-06-${String(day).padStart(2, '0')}T12-00-${String(sec).padStart(2, '0')}-light.md`;
        writeFileSync(join(historyDir, date), `content-${i}`, 'utf-8');
      }

      const manager = new CheckpointManager(root);
      manager.initializeSession('session-A', root);

      manager.cleanup({
        enabled: true,
        maxAgeMs: 365 * 24 * 60 * 60 * 1000,
        maxCheckpointsPerSession: 3,
        maxTotalSizeMb: 0,
      });

      const remaining = readdirSync(historyDir).filter((f) =>
        f.endsWith('.md'),
      );
      expect(remaining).toHaveLength(3);

      // The 3 newest by filename ordering (2026-06-25 > 2026-06-24 > 2026-06-23)
      expect(remaining).toContain('2026-06-25T12-00-00-light.md');
      expect(remaining).toContain('2026-06-24T12-00-01-light.md');
      expect(remaining).toContain('2026-06-23T12-00-02-light.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('empty history dir does not cause errors', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-clean-empty-'));
    try {
      const dir = checkpointDir(root);
      mkdirSync(join(dir, 'history', 'empty-sesh'), { recursive: true });

      const manager = new CheckpointManager(root);
      manager.initializeSession('empty-sesh', root);

      // Should not throw
      manager.cleanup(farFutureConfig);

      // Dir should still exist (no files to remove)
      expect(existsSync(join(dir, 'history', 'empty-sesh'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('no checkpoint directory does not cause errors', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-clean-no-dir-'));
    try {
      const manager = new CheckpointManager(root);
      manager.initializeSession('session-Z', root);

      // Should not throw even though checkpoints/ dir doesn't exist
      expect(() => manager.cleanup(farFutureConfig)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────
// 7. CheckpointManager integration — full file output
// ──────────────────────────────────────────────────────────────────────
describe('CheckpointManager.createVersionedCheckpoint filesystem output', () => {
  test('produces all expected files for manual trigger', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-mgr-manual-'));
    try {
      const manager = new CheckpointManager(root);
      manager.initializeSession('session-int', root, 'repo-int', 'conv-int');

      const cp = manager.createVersionedCheckpoint(
        'session-int',
        sampleContent,
        { level: 'heavy', trigger: 'manual' },
      );

      const dir = checkpointDir(root);

      // by-session/
      expect(existsSync(join(dir, 'by-session', 'session-int.md'))).toBe(true);

      // latest.md + latest.meta.json
      expect(existsSync(join(dir, 'latest.md'))).toBe(true);
      expect(existsSync(join(dir, 'latest.meta.json'))).toBe(true);

      // history/
      const historyDir = join(dir, 'history', 'session-int');
      expect(existsSync(historyDir)).toBe(true);
      const historyFiles = readdirSync(historyDir).filter((f) =>
        f.endsWith('.md'),
      );
      expect(historyFiles).toHaveLength(1);
      expect(historyFiles[0]).toMatch(/heavy\.md$/);

      // File path on checkpoint object
      expect(cp.filePath).toBeTruthy();
      expect(cp.filePath).toContain('session-int');
      expect(cp.filePath).toContain('heavy.md');
      expect(cp.filePath).toContain('history');

      // Content
      const latestContent = readFileSync(join(dir, 'latest.md'), 'utf-8');
      expect(latestContent).toContain('Test goal for checkpoint');
      expect(latestContent).toContain('heavy');
      expect(latestContent).toContain('manual');

      // Meta content
      const meta = JSON.parse(
        readFileSync(join(dir, 'latest.meta.json'), 'utf-8'),
      );
      expect(meta.checkpoint_level).toBe('heavy');
      expect(meta.checkpoint_trigger).toBe('manual');
      expect(meta.source_session_id).toBe('session-int');
      expect(meta.goal).toBe('Test goal for checkpoint');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('produces all expected files for auto-compaction trigger', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-mgr-auto-'));
    try {
      const manager = new CheckpointManager(root);
      manager.initializeSession('session-auto-int', root);

      const cp = manager.createVersionedCheckpoint(
        'session-auto-int',
        sampleContent,
        { level: 'light', trigger: 'auto-compaction' },
      );

      const dir = checkpointDir(root);

      // by-session-auto/
      expect(
        existsSync(join(dir, 'by-session-auto', 'session-auto-int.md')),
      ).toBe(true);
      expect(
        existsSync(join(dir, 'by-session-auto', 'session-auto-int.meta.json')),
      ).toBe(true);

      // Manual locations NOT touched
      expect(existsSync(join(dir, 'by-session', 'session-auto-int.md'))).toBe(
        false,
      );
      expect(existsSync(join(dir, 'latest.md'))).toBe(false);
      expect(existsSync(join(dir, 'latest.meta.json'))).toBe(false);

      // history/
      const historyDir = join(dir, 'history', 'session-auto-int');
      expect(existsSync(historyDir)).toBe(true);

      // File path on checkpoint
      expect(cp.filePath).toBeTruthy();
      expect(cp.filePath).toContain('session-auto-int');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('multiple checkpoints create sequential history entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-mgr-seq-'));
    try {
      const manager = new CheckpointManager(root);
      manager.initializeSession('session-seq', root);

      manager.createVersionedCheckpoint('session-seq', sampleContent, {
        level: 'light',
        trigger: 'manual',
      });
      manager.createVersionedCheckpoint('session-seq', sampleContent, {
        level: 'heavy',
        trigger: 'manual',
      });

      const historyDir = join(checkpointDir(root), 'history', 'session-seq');
      const files = readdirSync(historyDir)
        .filter((f) => f.endsWith('.md'))
        .sort();
      expect(files).toHaveLength(2);

      // Latest should be the heavy checkpoint
      const latestContent = readLatestCheckpoint(root);
      expect(latestContent).toContain('heavy');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

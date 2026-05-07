import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addGlobalKnowledge,
  addGlobalPattern,
  getRepositoryWorkspaces,
  loadGlobalIndex,
  registerWorkspace,
} from './global-index';
import { CheckpointManager } from './manager';

describe('global memory index', () => {
  test('registers workspace to global index on session init', () => {
    const root1 = mkdtempSync(join(tmpdir(), 'ol-global-1-'));
    const root2 = mkdtempSync(join(tmpdir(), 'ol-global-2-'));

    try {
      const manager1 = new CheckpointManager(root1);
      manager1.initializeSession('session-1', root1, 'repo-1');

      const manager2 = new CheckpointManager(root2);
      manager2.initializeSession('session-2', root2, 'repo-1');

      const workspaces = getRepositoryWorkspaces('repo-1');
      expect(workspaces).toContain(root1);
      expect(workspaces).toContain(root2);
    } finally {
      rmSync(root1, { recursive: true, force: true });
      rmSync(root2, { recursive: true, force: true });
    }
  });

  test('queries checkpoints across multiple workspaces', () => {
    const root1 = mkdtempSync(join(tmpdir(), 'ol-query-1-'));
    const root2 = mkdtempSync(join(tmpdir(), 'ol-query-2-'));

    try {
      const manager1 = new CheckpointManager(root1);
      manager1.initializeSession('session-1', root1, 'repo-2');
      const cp1 = manager1.createCheckpoint(
        'session-1',
        'checkpoint in workspace 1',
        [],
        [],
        100,
      );

      const manager2 = new CheckpointManager(root2);
      manager2.initializeSession('session-2', root2, 'repo-2');
      const cp2 = manager2.createCheckpoint(
        'session-2',
        'checkpoint in workspace 2',
        [],
        [],
        200,
      );

      const allCheckpoints = manager1.getRepositoryCheckpoints('repo-2');
      expect(allCheckpoints).toHaveLength(2);
      expect(allCheckpoints.map((cp) => cp.id)).toContain(cp1.id);
      expect(allCheckpoints.map((cp) => cp.id)).toContain(cp2.id);
    } finally {
      rmSync(root1, { recursive: true, force: true });
      rmSync(root2, { recursive: true, force: true });
    }
  });

  test('global index persists across manager instances', () => {
    const root = mkdtempSync(join(tmpdir(), 'ol-persist-'));

    try {
      const manager1 = new CheckpointManager(root);
      manager1.initializeSession('session-1', root, 'repo-3');

      const index = loadGlobalIndex();
      const repo = index.repositories.get('repo-3');
      expect(repo).toBeDefined();
      expect(repo?.workspaceRoots).toContain(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('registerWorkspace deduplicates workspace roots', () => {
    const root = mkdtempSync(join(tmpdir(), 'ol-dedup-'));

    try {
      registerWorkspace('repo-4', root);
      registerWorkspace('repo-4', root);
      registerWorkspace('repo-4', root);

      const workspaces = getRepositoryWorkspaces('repo-4');
      expect(workspaces.filter((w) => w === root)).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('stores global knowledge and patterns for repository memory', () => {
    const root = mkdtempSync(join(tmpdir(), 'ol-global-pattern-'));
    try {
      registerWorkspace('repo-knowledge', root);
      addGlobalKnowledge('repo-knowledge', 'Pressure checkpoint summary');
      addGlobalPattern('repo-knowledge', 'context-pressure:l2-checkpoint-light');

      const index = loadGlobalIndex();
      const repo = index.repositories.get('repo-knowledge');
      expect(repo?.globalKnowledge).toContain('Pressure checkpoint summary');
      expect(repo?.patterns).toContain('context-pressure:l2-checkpoint-light');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

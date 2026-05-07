import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { getProjectMemoryDir } from '../paths/plugin-paths';
import { CheckpointManager } from './manager';

describe('checkpoint persistence', () => {
  test('persists session checkpoints to project memory directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'ol-checkpoint-'));
    try {
      const manager = new CheckpointManager(root);
      manager.initializeSession('session-1', root, 'repo-1', 'conversation-1');
      const checkpoint = manager.createCheckpoint(
        'session-1',
        'summary',
        ['decision'],
        ['issue'],
        123,
        'conversation-1',
      );

      const statePath = join(getProjectMemoryDir(root), 'checkpoint-state.json');
      const persisted = JSON.parse(readFileSync(statePath, 'utf-8')) as {
        sessions: Array<{ sessionID: string; checkpoints: Array<{ id: string }> }>;
      };

      expect(persisted.sessions).toHaveLength(1);
      expect(persisted.sessions[0].sessionID).toBe('session-1');
      expect(persisted.sessions[0].checkpoints[0].id).toBe(checkpoint.id);

      const reloaded = new CheckpointManager(root);
      expect(reloaded.sessionMemory.getCheckpoints('session-1')[0].id).toBe(
        checkpoint.id,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('records pressure checkpoints into repository, workspace, conversation, and session memory', () => {
    const root = mkdtempSync(join(tmpdir(), 'ol-pressure-'));
    try {
      const manager = new CheckpointManager(root);
      manager.initializeSession(
        'session-pressure',
        root,
        'repo-pressure',
        'conversation-pressure',
      );

      const checkpoint = manager.recordPressureCheckpoint(
        'session-pressure',
        {
          level: 3,
          ratio: 0.81,
          totalTokens: 162000,
          contextLimit: 200000,
        },
        'l3-checkpoint-heavy',
      );

      expect(checkpoint).not.toBeNull();
      expect(
        manager.sessionMemory.get('session-pressure')?.metadata.lastContextPressure,
      ).toMatchObject({
        strategy: 'l3-checkpoint-heavy',
        checkpointID: checkpoint?.id,
      });
      expect(
        manager.workspaceMemory.get(root)?.globalContext.lastContextPressure,
      ).toMatchObject({
        sessionID: 'session-pressure',
        strategy: 'l3-checkpoint-heavy',
      });
      expect(
        manager.repositoryMemory.get('repo-pressure')?.globalKnowledge,
      ).toContain(checkpoint?.summary);
      expect(manager.repositoryMemory.get('repo-pressure')?.patterns).toContain(
        'context-pressure:l3-checkpoint-heavy',
      );
      expect(
        manager.conversationMemory.get('conversation-pressure')?.summary,
      ).toBe(checkpoint?.summary);
      expect(
        manager.workingMemory.get('session-pressure')?.currentTask,
      ).toBe('context-pressure:L3');

      const reloaded = new CheckpointManager(root);
      expect(
        reloaded.sessionMemory.get('session-pressure')?.metadata.lastContextPressure,
      ).toMatchObject({ strategy: 'l3-checkpoint-heavy' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('records review outcomes into repository, workspace, conversation, and session memory', () => {
    const root = mkdtempSync(join(tmpdir(), 'ol-review-outcome-'));
    try {
      const manager = new CheckpointManager(root);
      manager.initializeSession(
        'session-review',
        root,
        'repo-review',
        'conversation-review',
      );

      const checkpoint = manager.recordReviewOutcome(
        'session-review',
        'needs_user',
        'Choose one migration strategy before continuing.',
      );

      expect(checkpoint).not.toBeNull();
      expect(
        manager.sessionMemory.get('session-review')?.metadata.lastReviewOutcome,
      ).toMatchObject({
        verdict: 'needs_user',
        checkpointID: checkpoint?.id,
      });
      expect(
        manager.workspaceMemory.get(root)?.globalContext.lastReviewOutcome,
      ).toMatchObject({
        sessionID: 'session-review',
        verdict: 'needs_user',
      });
      expect(
        manager.repositoryMemory.get('repo-review')?.globalKnowledge,
      ).toContain(checkpoint?.summary);
      expect(manager.repositoryMemory.get('repo-review')?.patterns).toContain(
        'review-outcome:needs_user',
      );
      expect(
        manager.conversationMemory.get('conversation-review')?.summary,
      ).toBe(checkpoint?.summary);
      expect(
        manager.workingMemory.get('session-review')?.recentDecisions,
      ).toContain(checkpoint?.summary);

      const reloaded = new CheckpointManager(root);
      expect(
        reloaded.sessionMemory.get('session-review')?.metadata.lastReviewOutcome,
      ).toMatchObject({ verdict: 'needs_user' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('ensureSession backfills repository and conversation links for existing sessions', () => {
    const root = mkdtempSync(join(tmpdir(), 'ol-ensure-session-'));
    try {
      const manager = new CheckpointManager(root);
      manager.initializeSession('session-backfill', root);

      manager.ensureSession(
        'session-backfill',
        root,
        'repo-backfill',
        'conversation-backfill',
      );

      expect(manager.sessionMemory.get('session-backfill')).toMatchObject({
        repositoryId: 'repo-backfill',
        conversationID: 'conversation-backfill',
      });
      expect(
        manager.workspaceMemory.get(root)?.sessions.has('session-backfill'),
      ).toBe(true);
      expect(manager.workspaceMemory.get(root)?.repositoryId).toBe(
        'repo-backfill',
      );
      expect(
        manager.repositoryMemory.get('repo-backfill')?.workspaces.has(root),
      ).toBe(true);
      expect(
        manager.conversationMemory.get('conversation-backfill')?.sessionIDs,
      ).toContain('session-backfill');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('records auto-pause outcomes into repository, workspace, conversation, and session memory', () => {
    const root = mkdtempSync(join(tmpdir(), 'ol-auto-pause-'));
    try {
      const manager = new CheckpointManager(root);
      manager.initializeSession(
        'session-pause',
        root,
        'repo-pause',
        'conversation-pause',
      );

      const checkpoint = manager.recordAutoPause(
        'session-pause',
        'max-continuations-reached',
        'Reached the configured auto continuation ceiling.',
      );

      expect(checkpoint).not.toBeNull();
      expect(
        manager.sessionMemory.get('session-pause')?.metadata.lastAutoPause,
      ).toMatchObject({
        reason: 'max-continuations-reached',
        checkpointID: checkpoint?.id,
      });
      expect(
        manager.workspaceMemory.get(root)?.globalContext.lastAutoPause,
      ).toMatchObject({
        sessionID: 'session-pause',
        reason: 'max-continuations-reached',
      });
      expect(manager.repositoryMemory.get('repo-pause')?.patterns).toContain(
        'auto-pause:max-continuations-reached',
      );
      expect(
        manager.conversationMemory.get('conversation-pause')?.summary,
      ).toBe(checkpoint?.summary);

      manager.cleanupSession('session-pause');
      expect(manager.sessionMemory.get('session-pause')).toBeDefined();
      expect(
        manager.sessionMemory.get('session-pause')?.metadata.lastClosedAt,
      ).toBeDefined();
      expect(manager.workingMemory.get('session-pause')).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('records approved batch summaries into repository, workspace, conversation, and session memory', () => {
    const root = mkdtempSync(join(tmpdir(), 'ol-batch-summary-'));
    try {
      const manager = new CheckpointManager(root);
      manager.initializeSession(
        'session-summary',
        root,
        'repo-summary',
        'conversation-summary',
      );

      const checkpoint = manager.recordBatchSummary(
        'session-summary',
        'Delivered the migration and the next step is to validate against a fresh session.',
      );

      expect(checkpoint).not.toBeNull();
      expect(
        manager.sessionMemory.get('session-summary')?.metadata.lastBatchSummary,
      ).toMatchObject({
        checkpointID: checkpoint?.id,
      });
      expect(
        manager.workspaceMemory.get(root)?.globalContext.lastBatchSummary,
      ).toMatchObject({
        sessionID: 'session-summary',
      });
      expect(
        manager.repositoryMemory.get('repo-summary')?.globalKnowledge,
      ).toContain(checkpoint?.summary);
      expect(manager.repositoryMemory.get('repo-summary')?.patterns).toContain(
        'batch-summary:auto-review-approved',
      );
      expect(
        manager.conversationMemory.get('conversation-summary')?.summary,
      ).toBe(checkpoint?.summary);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('records and removes manual preferences across workspace and repository scopes', () => {
    const root = mkdtempSync(join(tmpdir(), 'ol-manual-pref-'));
    try {
      const manager = new CheckpointManager(root);
      manager.initializeSession(
        'session-pref',
        root,
        'repo-pref',
        'conversation-pref',
      );

      const workspacePrefId = manager.recordManualPreference('session-pref', {
        kind: 'workflow',
        scope: 'workspace',
        content: 'Prefer test -> build -> deploy order.',
      });
      const repositoryPrefId = manager.recordManualPreference('session-pref', {
        kind: 'tooling',
        scope: 'repository',
        content: 'Prefer uv for Python tooling setup.',
      });

      expect(workspacePrefId).toBeTruthy();
      expect(repositoryPrefId).toBeTruthy();

      const allEntries = manager.listManualPreferences('session-pref');
      expect(allEntries).toHaveLength(2);
      expect(allEntries.map((entry) => entry.id)).toEqual(
        expect.arrayContaining([workspacePrefId!, repositoryPrefId!]),
      );

      expect(manager.workspaceMemory.get(root)?.preferences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: workspacePrefId,
            scope: 'workspace',
            kind: 'workflow',
          }),
        ]),
      );
      expect(manager.repositoryMemory.get('repo-pref')?.preferences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: repositoryPrefId,
            scope: 'repository',
            kind: 'tooling',
          }),
        ]),
      );
      expect(manager.repositoryMemory.get('repo-pref')?.globalKnowledge).toContain(
        'Preference (tooling): Prefer uv for Python tooling setup.',
      );
      expect(manager.repositoryMemory.get('repo-pref')?.patterns).toContain(
        'preference:tooling',
      );

      expect(
        manager.removeManualPreferenceById('session-pref', repositoryPrefId!, 'repository'),
      ).toBe(true);
      expect(
        manager.repositoryMemory.get('repo-pref')?.preferences.some((entry) => entry.id === repositoryPrefId),
      ).toBe(false);
      expect(manager.repositoryMemory.get('repo-pref')?.globalKnowledge).not.toContain(
        'Preference (tooling): Prefer uv for Python tooling setup.',
      );

      expect(
        manager.removeManualPreferenceById('session-pref', workspacePrefId!, 'workspace'),
      ).toBe(true);
      expect(
        manager.workspaceMemory.get(root)?.preferences.some((entry) => entry.id === workspacePrefId),
      ).toBe(false);
      expect(manager.workspaceMemory.get(root)?.globalContext).not.toHaveProperty(
        `preference:${workspacePrefId}`,
      );

      const reloaded = new CheckpointManager(root);
      expect(reloaded.listManualPreferences('session-pref')).toHaveLength(0);
      expect(
        reloaded.sessionMemory.get('session-pref')?.metadata.lastRemovedPreference,
      ).toMatchObject({
        id: workspacePrefId,
        scope: 'workspace',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('removing one duplicate repository preference preserves shared knowledge and pattern until last entry is removed', () => {
    const root = mkdtempSync(join(tmpdir(), 'ol-manual-pref-dup-'));
    try {
      const manager = new CheckpointManager(root);
      manager.initializeSession(
        'session-pref-dup',
        root,
        'repo-pref-dup',
        'conversation-pref-dup',
      );

      const firstId = manager.recordManualPreference('session-pref-dup', {
        kind: 'tooling',
        scope: 'repository',
        content: 'Prefer uv for Python tooling setup.',
      });
      const secondId = manager.recordManualPreference('session-pref-dup', {
        kind: 'tooling',
        scope: 'repository',
        content: 'Prefer uv for Python tooling setup.',
      });

      expect(firstId).toBeTruthy();
      expect(secondId).toBeTruthy();
      expect(firstId).not.toBe(secondId);
      expect(manager.repositoryMemory.get('repo-pref-dup')?.globalKnowledge).toContain(
        'Preference (tooling): Prefer uv for Python tooling setup.',
      );
      expect(manager.repositoryMemory.get('repo-pref-dup')?.patterns).toContain(
        'preference:tooling',
      );

      expect(
        manager.removeManualPreferenceById('session-pref-dup', firstId!, 'repository'),
      ).toBe(true);

      expect(manager.listManualPreferences('session-pref-dup', 'repository')).toHaveLength(1);
      expect(manager.repositoryMemory.get('repo-pref-dup')?.globalKnowledge).toContain(
        'Preference (tooling): Prefer uv for Python tooling setup.',
      );
      expect(manager.repositoryMemory.get('repo-pref-dup')?.patterns).toContain(
        'preference:tooling',
      );

      expect(
        manager.removeManualPreferenceById('session-pref-dup', secondId!, 'repository'),
      ).toBe(true);
      expect(manager.listManualPreferences('session-pref-dup', 'repository')).toHaveLength(0);
      expect(
        manager.repositoryMemory.get('repo-pref-dup')?.globalKnowledge,
      ).not.toContain('Preference (tooling): Prefer uv for Python tooling setup.');
      expect(manager.repositoryMemory.get('repo-pref-dup')?.patterns).not.toContain(
        'preference:tooling',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

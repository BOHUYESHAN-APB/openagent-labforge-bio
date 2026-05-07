import type { CheckpointCleanupConfig } from '../config/schema';
import type {
  CheckpointStorage,
  ContextCheckpoint,
  PreferenceMemoryEntry,
} from './types';
import { cleanupCheckpoints } from './cleaner';
import { ConversationMemoryStore } from './conversation-memory';
import {
  addGlobalKnowledge,
  addGlobalPattern,
  getRepositoryWorkspaces,
  removeGlobalKnowledge,
  removeGlobalPattern,
  registerWorkspace,
} from './global-index';
import { loadCheckpointStorage, saveCheckpointStorage } from './persistence';
import { RepositoryMemoryStore } from './repository-memory';
import { SessionMemoryStore } from './session-memory';
import { WorkingMemoryStore } from './working-memory';
import { WorkspaceMemoryStore } from './workspace-memory';

export class CheckpointManager {
  private storage: CheckpointStorage;
  private workspaceRoot: string | null = null;
  public workingMemory: WorkingMemoryStore;
  public conversationMemory: ConversationMemoryStore;
  public sessionMemory: SessionMemoryStore;
  public workspaceMemory: WorkspaceMemoryStore;
  public repositoryMemory: RepositoryMemoryStore;

  constructor(workspaceRoot?: string) {
    this.workspaceRoot = workspaceRoot ?? null;
    this.storage = workspaceRoot
      ? loadCheckpointStorage(workspaceRoot)
      : {
          workingMemory: new Map(),
          conversationMemory: new Map(),
          sessionMemory: new Map(),
          workspaceMemory: new Map(),
          repositoryMemory: new Map(),
        };

    this.workingMemory = new WorkingMemoryStore(this.storage.workingMemory);
    this.conversationMemory = new ConversationMemoryStore(
      this.storage.conversationMemory,
    );
    this.sessionMemory = new SessionMemoryStore(this.storage.sessionMemory);
    this.workspaceMemory = new WorkspaceMemoryStore(
      this.storage.workspaceMemory,
    );
    this.repositoryMemory = new RepositoryMemoryStore(
      this.storage.repositoryMemory,
    );
  }

  private persist(): void {
    if (!this.workspaceRoot) return;
    saveCheckpointStorage(this.workspaceRoot, this.storage);
  }

  ensureSession(
    sessionID: string,
    workspaceRoot: string,
    repositoryId?: string,
    conversationID?: string,
  ): void {
    const existing = this.sessionMemory.get(sessionID);
    if (existing) {
      if (!existing.repositoryId && repositoryId) {
        existing.repositoryId = repositoryId;
      }
      if (!existing.conversationID && conversationID) {
        existing.conversationID = conversationID;
      }
      existing.lastActivity = Date.now();

      let workspace = this.workspaceMemory.get(workspaceRoot);
      if (!workspace) {
        workspace = this.workspaceMemory.create(
          workspaceRoot,
          existing.repositoryId ?? repositoryId,
        );
      }
      this.workspaceMemory.addSession(workspaceRoot, existing);

      const resolvedRepositoryId = existing.repositoryId ?? repositoryId;
      if (resolvedRepositoryId) {
        this.workspaceMemory.setRepositoryId(workspaceRoot, resolvedRepositoryId);
        let repo = this.repositoryMemory.get(resolvedRepositoryId);
        if (!repo) {
          repo = this.repositoryMemory.create(resolvedRepositoryId);
        }
        this.repositoryMemory.addWorkspace(resolvedRepositoryId, workspace);
        registerWorkspace(resolvedRepositoryId, workspaceRoot);
      }

      const resolvedConversationID = existing.conversationID ?? conversationID;
      if (resolvedConversationID) {
        let conversation = this.conversationMemory.get(resolvedConversationID);
        if (!conversation) {
          conversation = this.conversationMemory.create(
            resolvedConversationID,
            sessionID,
          );
        } else {
          this.conversationMemory.addSession(resolvedConversationID, sessionID);
        }
      }

      this.persist();
      return;
    }
    this.initializeSession(sessionID, workspaceRoot, repositoryId, conversationID);
  }

  createCheckpoint(
    sessionID: string,
    summary: string,
    keyDecisions: string[],
    openIssues: string[],
    tokenCount: number,
    conversationID?: string,
  ): ContextCheckpoint {
    const checkpoint: ContextCheckpoint = {
      id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      sessionID,
      conversationID,
      summary,
      keyDecisions,
      openIssues,
      tokenCount,
    };

    this.sessionMemory.addCheckpoint(sessionID, checkpoint);

    if (conversationID) {
      this.conversationMemory.addCheckpoint(conversationID, checkpoint);
    }

    this.persist();

    return checkpoint;
  }

  initializeSession(
    sessionID: string,
    workspaceRoot: string,
    repositoryId?: string,
    conversationID?: string,
  ): void {
    const session = this.sessionMemory.create(
      sessionID,
      workspaceRoot,
      repositoryId,
      conversationID,
    );

    let workspace = this.workspaceMemory.get(workspaceRoot);
    if (!workspace) {
      workspace = this.workspaceMemory.create(workspaceRoot, repositoryId);
    }
    this.workspaceMemory.addSession(workspaceRoot, session);

    if (repositoryId) {
      let repo = this.repositoryMemory.get(repositoryId);
      if (!repo) {
        repo = this.repositoryMemory.create(repositoryId);
      }
      this.repositoryMemory.addWorkspace(repositoryId, workspace);
      registerWorkspace(repositoryId, workspaceRoot);
    }

    if (conversationID) {
      let conversation = this.conversationMemory.get(conversationID);
      if (!conversation) {
        conversation = this.conversationMemory.create(conversationID, sessionID);
      } else {
        this.conversationMemory.addSession(conversationID, sessionID);
      }
    }

    this.workingMemory.set(sessionID, {});
    this.workspaceRoot = workspaceRoot;
    this.persist();
  }

  cleanupSession(sessionID: string): void {
    this.workingMemory.clear(sessionID);
    const session = this.sessionMemory.get(sessionID);
    if (session) {
      session.lastActivity = Date.now();
      session.metadata.lastClosedAt = Date.now();
    }
    this.persist();
  }

  recordPressureCheckpoint(
    sessionID: string,
    pressure: {
      level: number;
      ratio: number;
      totalTokens: number;
      contextLimit: number;
    },
    strategy: string,
  ): ContextCheckpoint | null {
    const session = this.sessionMemory.get(sessionID);
    if (!session) {
      return null;
    }

    const summary = `Context pressure L${pressure.level} at ${Math.round(
      pressure.ratio * 100,
    )}% (${pressure.totalTokens.toLocaleString()} / ${pressure.contextLimit.toLocaleString()} tokens); strategy ${strategy}.`;
    const keyDecisions = [
      `Pressure strategy selected: ${strategy}`,
      `Current context usage: ${Math.round(pressure.ratio * 100)}%`,
    ];
    const openIssues = [
      'Resume with tighter deltas, compression-aware updates, and a fresh checkpoint if context pressure keeps rising.',
    ];

    const checkpoint = this.createCheckpoint(
      sessionID,
      summary,
      keyDecisions,
      openIssues,
      pressure.totalTokens,
      session.conversationID,
    );

    this.workingMemory.updateTask(sessionID, `context-pressure:L${pressure.level}`);
    this.workingMemory.addDecision(sessionID, summary);
    this.workingMemory.setContext(sessionID, 'lastContextPressure', {
      ...pressure,
      strategy,
      timestamp: Date.now(),
    });
    this.sessionMemory.setMetadata(sessionID, 'lastContextPressure', {
      ...pressure,
      strategy,
      checkpointID: checkpoint.id,
    });
    this.workspaceMemory.setGlobalContext(session.workspaceRoot, 'lastContextPressure', {
      sessionID,
      ...pressure,
      strategy,
      checkpointID: checkpoint.id,
    });

    if (session.conversationID) {
      this.conversationMemory.updateSummary(session.conversationID, summary);
    }

    if (session.repositoryId) {
      this.repositoryMemory.addKnowledge(session.repositoryId, summary);
      this.repositoryMemory.addPattern(
        session.repositoryId,
        `context-pressure:${strategy}`,
      );
      addGlobalKnowledge(session.repositoryId, summary);
      addGlobalPattern(session.repositoryId, `context-pressure:${strategy}`);
    }

    this.persist();
    return checkpoint;
  }

  recordReviewOutcome(
    sessionID: string,
    verdict: 'approve' | 'reject' | 'needs_user' | 'blocked',
    details: string,
  ): ContextCheckpoint | null {
    const session = this.sessionMemory.get(sessionID);
    if (!session) {
      return null;
    }

    const normalizedDetails = details.trim() || 'No additional review details.';
    const summary = `Review outcome ${verdict}: ${normalizedDetails}`;
    const checkpoint = this.createCheckpoint(
      sessionID,
      summary,
      [`Review verdict: ${verdict}`],
      verdict === 'approve'
        ? ['If the session is reopened later, continue only from net-new changes.']
        : ['Resolve the review finding or gather the required user/external input.'],
      0,
      session.conversationID,
    );

    this.workingMemory.addDecision(sessionID, summary);
    this.workingMemory.setContext(sessionID, 'lastReviewOutcome', {
      verdict,
      details: normalizedDetails,
      checkpointID: checkpoint.id,
      timestamp: Date.now(),
    });
    this.sessionMemory.setMetadata(sessionID, 'lastReviewOutcome', {
      verdict,
      details: normalizedDetails,
      checkpointID: checkpoint.id,
    });
    this.workspaceMemory.setGlobalContext(session.workspaceRoot, 'lastReviewOutcome', {
      sessionID,
      verdict,
      details: normalizedDetails,
      checkpointID: checkpoint.id,
    });

    if (session.conversationID) {
      this.conversationMemory.updateSummary(session.conversationID, summary);
    }

    if (session.repositoryId) {
      this.repositoryMemory.addKnowledge(session.repositoryId, summary);
      this.repositoryMemory.addPattern(session.repositoryId, `review-outcome:${verdict}`);
      addGlobalKnowledge(session.repositoryId, summary);
      addGlobalPattern(session.repositoryId, `review-outcome:${verdict}`);
    }

    this.persist();
    return checkpoint;
  }

  recordAutoPause(
    sessionID: string,
    reason: string,
    details: string,
  ): ContextCheckpoint | null {
    const session = this.sessionMemory.get(sessionID);
    if (!session) {
      return null;
    }

    const normalizedDetails = details.trim() || 'No additional details.';
    const summary = `Auto mode paused: ${reason}. ${normalizedDetails}`;
    const checkpoint = this.createCheckpoint(
      sessionID,
      summary,
      [`Auto pause reason: ${reason}`],
      ['Resume after resolving the pause reason or explicitly re-enabling auto mode.'],
      0,
      session.conversationID,
    );

    this.workingMemory.addDecision(sessionID, summary);
    this.workingMemory.setContext(sessionID, 'lastAutoPause', {
      reason,
      details: normalizedDetails,
      checkpointID: checkpoint.id,
      timestamp: Date.now(),
    });
    this.sessionMemory.setMetadata(sessionID, 'lastAutoPause', {
      reason,
      details: normalizedDetails,
      checkpointID: checkpoint.id,
    });
    this.workspaceMemory.setGlobalContext(session.workspaceRoot, 'lastAutoPause', {
      sessionID,
      reason,
      details: normalizedDetails,
      checkpointID: checkpoint.id,
    });

    if (session.conversationID) {
      this.conversationMemory.updateSummary(session.conversationID, summary);
    }

    if (session.repositoryId) {
      this.repositoryMemory.addKnowledge(session.repositoryId, summary);
      this.repositoryMemory.addPattern(session.repositoryId, `auto-pause:${reason}`);
      addGlobalKnowledge(session.repositoryId, summary);
      addGlobalPattern(session.repositoryId, `auto-pause:${reason}`);
    }

    this.persist();
    return checkpoint;
  }

  recordBatchSummary(sessionID: string, summaryText: string): ContextCheckpoint | null {
    const session = this.sessionMemory.get(sessionID);
    if (!session) {
      return null;
    }

    const normalizedSummary =
      summaryText.trim() || 'Completed work batch summary unavailable.';
    const summary = `Completed work batch summary: ${normalizedSummary}`;
    const checkpoint = this.createCheckpoint(
      sessionID,
      summary,
      ['Batch approved after structured auto-review.'],
      ['Resume only from net-new changes if the work is reopened later.'],
      0,
      session.conversationID,
    );

    this.workingMemory.addDecision(sessionID, summary);
    this.workingMemory.setContext(sessionID, 'lastBatchSummary', {
      summary: normalizedSummary,
      checkpointID: checkpoint.id,
      timestamp: Date.now(),
    });
    this.sessionMemory.setMetadata(sessionID, 'lastBatchSummary', {
      summary: normalizedSummary,
      checkpointID: checkpoint.id,
    });
    this.workspaceMemory.setGlobalContext(session.workspaceRoot, 'lastBatchSummary', {
      sessionID,
      summary: normalizedSummary,
      checkpointID: checkpoint.id,
    });

    if (session.conversationID) {
      this.conversationMemory.updateSummary(session.conversationID, summary);
    }

    if (session.repositoryId) {
      this.repositoryMemory.addKnowledge(session.repositoryId, summary);
      this.repositoryMemory.addPattern(
        session.repositoryId,
        'batch-summary:auto-review-approved',
      );
      addGlobalKnowledge(session.repositoryId, summary);
      addGlobalPattern(session.repositoryId, 'batch-summary:auto-review-approved');
    }

    this.persist();
    return checkpoint;
  }

  getRepositoryCheckpoints(repositoryId: string): ContextCheckpoint[] {
    const workspaceRoots = getRepositoryWorkspaces(repositoryId);
    const checkpoints: ContextCheckpoint[] = [];

    for (const root of workspaceRoots) {
      const storage = loadCheckpointStorage(root);
      for (const session of storage.sessionMemory.values()) {
        if (session.repositoryId === repositoryId) {
          checkpoints.push(...session.checkpoints);
        }
      }
    }

    return checkpoints.sort((a, b) => b.timestamp - a.timestamp);
  }

  cleanup(config: CheckpointCleanupConfig): void {
    if (!this.workspaceRoot) return;
    const stats = cleanupCheckpoints(this.workspaceRoot, this.storage, config);
    if (stats.checkpointsRemoved > 0) {
      this.persist();
    }
  }

  recordManualPreference(
    sessionID: string,
    input: {
      kind: 'workflow' | 'preference' | 'tooling';
      content: string;
      scope: 'workspace' | 'repository';
    },
  ): string | null {
    const session = this.sessionMemory.get(sessionID);
    if (!session) {
      return null;
    }

    const normalizedContent = input.content.trim();
    if (!normalizedContent) {
      return null;
    }

    const id = `pref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entry = {
      id,
      kind: input.kind,
      content: normalizedContent,
      source: 'manual' as const,
      scope: input.scope,
      createdAt: Date.now(),
    };

    if (input.scope === 'repository' && session.repositoryId) {
      this.repositoryMemory.addPreference(session.repositoryId, entry);
      this.repositoryMemory.addKnowledge(
        session.repositoryId,
        `Preference (${input.kind}): ${normalizedContent}`,
      );
      this.repositoryMemory.addPattern(
        session.repositoryId,
        `preference:${input.kind}`,
      );
      addGlobalKnowledge(
        session.repositoryId,
        `Preference (${input.kind}): ${normalizedContent}`,
      );
      addGlobalPattern(session.repositoryId, `preference:${input.kind}`);
    } else {
      this.workspaceMemory.addPreference(session.workspaceRoot, entry);
      this.workspaceMemory.setGlobalContext(
        session.workspaceRoot,
        `preference:${id}`,
        entry,
      );
    }

    this.sessionMemory.setMetadata(sessionID, 'lastManualPreference', entry);
    this.workingMemory.addDecision(
      sessionID,
      `Recorded manual ${input.kind} preference (${input.scope}): ${normalizedContent}`,
    );
    this.persist();
    return id;
  }

  listManualPreferences(
    sessionID: string,
    scope: 'workspace' | 'repository' | 'all' = 'all',
  ): PreferenceMemoryEntry[] {
    const session = this.sessionMemory.get(sessionID);
    if (!session) {
      return [];
    }

    const entries: PreferenceMemoryEntry[] = [];
    if (scope === 'all' || scope === 'workspace') {
      entries.push(
        ...(this.workspaceMemory.get(session.workspaceRoot)?.preferences ?? []),
      );
    }

    if ((scope === 'all' || scope === 'repository') && session.repositoryId) {
      entries.push(
        ...(this.repositoryMemory.get(session.repositoryId)?.preferences ?? []),
      );
    }

    return [...entries].sort((a, b) => b.createdAt - a.createdAt);
  }

  private hasRepositoryPreferenceFingerprint(
    repositoryId: string,
    kind: 'workflow' | 'preference' | 'tooling',
    content: string,
    excludeId: string,
  ): boolean {
    const repository = this.repositoryMemory.get(repositoryId);
    if (!repository) {
      return false;
    }
    return repository.preferences.some(
      (entry) =>
        entry.id !== excludeId &&
        entry.kind === kind &&
        entry.content === content,
    );
  }

  removeManualPreference(
    sessionID: string,
    input: {
      id: string;
      scope: 'workspace' | 'repository';
      kind?: 'workflow' | 'preference' | 'tooling';
      content?: string;
    },
  ): boolean {
    const session = this.sessionMemory.get(sessionID);
    if (!session) {
      return false;
    }

    let removed = false;
    if (input.scope === 'repository' && session.repositoryId) {
      removed = this.repositoryMemory.removePreference(session.repositoryId, input.id);
      const shouldKeepSharedRepositoryMemory =
        removed &&
        input.kind &&
        input.content &&
        this.hasRepositoryPreferenceFingerprint(
          session.repositoryId,
          input.kind,
          input.content,
          input.id,
        );

      if (removed && input.content && !shouldKeepSharedRepositoryMemory) {
        this.repositoryMemory.removeKnowledge(
          session.repositoryId,
          `Preference (${input.kind ?? 'preference'}): ${input.content}`,
        );
        removeGlobalKnowledge(
          session.repositoryId,
          `Preference (${input.kind ?? 'preference'}): ${input.content}`,
        );
      }
      if (removed && input.kind && !shouldKeepSharedRepositoryMemory) {
        this.repositoryMemory.removePattern(
          session.repositoryId,
          `preference:${input.kind}`,
        );
        removeGlobalPattern(session.repositoryId, `preference:${input.kind}`);
      }
    } else {
      removed = this.workspaceMemory.removePreference(session.workspaceRoot, input.id);
      if (removed) {
        const workspace = this.workspaceMemory.get(session.workspaceRoot);
        if (workspace) {
          delete workspace.globalContext[`preference:${input.id}`];
        }
      }
    }

    if (removed) {
      this.sessionMemory.setMetadata(sessionID, 'lastRemovedPreference', {
        id: input.id,
        scope: input.scope,
        removedAt: Date.now(),
      });
      this.workingMemory.addDecision(
        sessionID,
        `Removed manual preference ${input.id} (${input.scope}).`,
      );
      this.persist();
    }

    return removed;
  }

  removeManualPreferenceById(
    sessionID: string,
    entryId: string,
    scope: 'workspace' | 'repository' | 'all' = 'all',
  ): boolean {
    const session = this.sessionMemory.get(sessionID);
    if (!session) {
      return false;
    }

    const candidates = this.listManualPreferences(sessionID, scope);
    const entry = candidates.find((item) => item.id === entryId);
    if (!entry) {
      return false;
    }

    return this.removeManualPreference(sessionID, {
      id: entry.id,
      scope: entry.scope,
      kind: entry.kind,
      content: entry.content,
    });
  }
}

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlanProgress } from '../boulder';
import type { CheckpointCleanupConfig } from '../config/schema';
import { getProjectBoulderFile } from '../paths/plugin-paths';
import { cleanupCheckpoints } from './cleaner';
import { ConversationMemoryStore } from './conversation-memory';
import {
  addGlobalKnowledge,
  addGlobalPattern,
  getRepositoryWorkspaces,
  registerWorkspace,
  removeGlobalKnowledge,
  removeGlobalPattern,
} from './global-index';
import {
  loadCheckpointStorage,
  saveCheckpointStorage,
  writeCheckpointFile,
  writeCheckpointMeta,
} from './persistence';
import {
  classifyAutoPreference,
  validatePreferenceContent,
} from './preference-rules';
import { RepositoryMemoryStore } from './repository-memory';
import { SessionMemoryStore } from './session-memory';
import type {
  CheckpointLevel,
  CheckpointStorage,
  CheckpointTrigger,
  ContextCheckpoint,
  PreferenceMemoryEntry,
} from './types';
import { WorkingMemoryStore } from './working-memory';
import { WorkspaceMemoryStore } from './workspace-memory';

/**
 * Read Loop FSM state for checkpoint integration.
 * If an active loop is running, captures its phase, iteration, and verdict
 * history so the checkpoint can restore loop context after compaction.
 */
function readLoopFSMState(workspaceRoot: string): {
  loop_id: string;
  phase: string;
  iteration: number;
  max_iterations: number;
  verdict_history: Array<{ phase: string; verdict: string; timestamp: number }>;
} | null {
  try {
    const loopPath = join(workspaceRoot, '.opencode', 'loops', 'active.json');
    if (!existsSync(loopPath)) return null;
    const data = JSON.parse(readFileSync(loopPath, 'utf-8')) as {
      loop_id: string;
      phase: string;
      iteration: number;
      max_iterations: number;
      verdict_history: Array<{
        phase: string;
        verdict: string;
        timestamp: number;
      }>;
    };
    if (!data.loop_id || data.phase === 'done' || data.phase === 'idle') {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function readActiveExecutionState(workspaceRoot: string): {
  planName: string;
  planPath: string;
  remainingTasks: number;
} | null {
  const boulderPath = getProjectBoulderFile(workspaceRoot);
  if (!existsSync(boulderPath)) {
    return null;
  }

  try {
    const boulderState = JSON.parse(readFileSync(boulderPath, 'utf8')) as {
      active_plan?: string;
      plan_name?: string;
    };
    if (!boulderState.active_plan || !boulderState.plan_name) {
      return null;
    }

    const progress = getPlanProgress(
      readFileSync(boulderState.active_plan, 'utf8'),
    );
    if (progress.isComplete) {
      return null;
    }

    return {
      planName: boulderState.plan_name,
      planPath: boulderState.active_plan,
      remainingTasks: progress.remaining,
    };
  } catch {
    return null;
  }
}

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
        this.workspaceMemory.setRepositoryId(
          workspaceRoot,
          resolvedRepositoryId,
        );
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
    this.initializeSession(
      sessionID,
      workspaceRoot,
      repositoryId,
      conversationID,
    );
  }

  createCheckpoint(
    sessionID: string,
    summary: string,
    keyDecisions: string[],
    openIssues: string[],
    tokenCount: number,
    conversationID?: string,
    options?: {
      level?: CheckpointLevel;
      trigger?: CheckpointTrigger;
      preCompactionTimestamp?: number;
    },
  ): ContextCheckpoint {
    const level = options?.level ?? 'light';
    const trigger = options?.trigger ?? 'manual';

    const checkpoint: ContextCheckpoint = {
      id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      sessionID,
      conversationID,
      summary,
      keyDecisions,
      openIssues,
      tokenCount,
      level,
      status: 'active',
      trigger,
      preCompactionTimestamp: options?.preCompactionTimestamp,
    };

    // Supersede older active checkpoints from the same session
    this.supersedeOldCheckpoints(sessionID, checkpoint.id);

    this.sessionMemory.addCheckpoint(sessionID, checkpoint);

    if (conversationID) {
      this.conversationMemory.addCheckpoint(conversationID, checkpoint);
    }

    this.persist();

    return checkpoint;
  }

  /**
   * Create a versioned checkpoint with file persistence.
   * This is the main entry point for the new checkpoint architecture.
   */
  createVersionedCheckpoint(
    sessionID: string,
    content: {
      summary: string;
      goal: string;
      keyDecisions: string[];
      openIssues: string[];
      pendingTasks: string[];
      keyFiles: string[];
      resumeInstructions: string;
    },
    options: {
      level: CheckpointLevel;
      trigger: CheckpointTrigger;
      conversationID?: string;
      preCompactionTimestamp?: number;
    },
  ): ContextCheckpoint {
    const checkpoint = this.createCheckpoint(
      sessionID,
      content.summary,
      content.keyDecisions,
      content.openIssues,
      0,
      options.conversationID,
      {
        level: options.level,
        trigger: options.trigger,
        preCompactionTimestamp: options.preCompactionTimestamp,
      },
    );

    // Write checkpoint file
    const session = this.sessionMemory.get(sessionID);
    if (session) {
      // writeCheckpointFile automatically handles:
      // - Manual checkpoints → latest.md + by-session/ + history/
      // - Auto-compaction → by-session-auto/ + history/ (no overwrite)
      const filePath = writeCheckpointFile(
        session.workspaceRoot,
        checkpoint,
        content,
      );
      checkpoint.filePath = filePath;

      // Update metadata
      writeCheckpointMeta(
        session.workspaceRoot,
        {
          checkpoint_id: checkpoint.id,
          checkpoint_level: checkpoint.level,
          checkpoint_status: checkpoint.status,
          checkpoint_trigger: checkpoint.trigger,
          source_session_id: sessionID,
          created_at: new Date(checkpoint.timestamp).toISOString(),
          goal: content.goal,
          session_switch_recommendation:
            options.level === 'heavy' ? 'recommend-switch' : 'stay',
          pre_compaction: !!options.preCompactionTimestamp,
        },
        sessionID,
        options.trigger,
      );

      this.persist();
    }

    return checkpoint;
  }

  /**
   * Get the latest active checkpoint for a session.
   */
  getLatestCheckpoint(sessionID: string): ContextCheckpoint | undefined {
    const session = this.sessionMemory.get(sessionID);
    if (!session) return undefined;

    return session.checkpoints
      .filter((cp) => cp.status === 'active')
      .sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  /**
   * Get the latest checkpoint across all sessions in a workspace.
   */
  getWorkspaceLatestCheckpoint(
    workspaceRoot: string,
  ): ContextCheckpoint | undefined {
    const workspace = this.workspaceMemory.get(workspaceRoot);
    if (!workspace) return undefined;

    let latest: ContextCheckpoint | undefined;
    for (const session of workspace.sessions.values()) {
      for (const cp of session.checkpoints) {
        if (
          cp.status === 'active' &&
          (!latest || cp.timestamp > latest.timestamp)
        ) {
          latest = cp;
        }
      }
    }
    return latest;
  }

  /**
   * Get checkpoint history for a session.
   */
  getCheckpointHistory(sessionID: string): ContextCheckpoint[] {
    const session = this.sessionMemory.get(sessionID);
    if (!session) return [];

    return [...session.checkpoints].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Mark old active checkpoints from the same session as superseded.
   */
  private supersedeOldCheckpoints(
    sessionID: string,
    newCheckpointID: string,
  ): void {
    const session = this.sessionMemory.get(sessionID);
    if (!session) return;

    for (const cp of session.checkpoints) {
      if (cp.status === 'active' && cp.id !== newCheckpointID) {
        cp.status = 'superseded';
      }
    }
  }

  /**
   * Auto-create a checkpoint before compaction.
   * This is the key integration point between compaction and checkpoint.
   */
  createPreCompactionCheckpoint(
    sessionID: string,
    currentContext: {
      goal: string;
      pendingTasks: string[];
      keyFiles: string[];
      recentDecisions: string[];
      currentPhase?: string;
      currentAgent?: string;
    },
  ): ContextCheckpoint | null {
    const session = this.sessionMemory.get(sessionID);
    if (!session) return null;

    // Check if there's already an active checkpoint created recently
    // 5-second dedup window: prevents duplicate checkpoints from rapid compaction
    // retries but still creates one per distinct compaction event
    const existing = this.getLatestCheckpoint(sessionID);
    if (existing && Date.now() - existing.timestamp < 5_000) {
      // Don't create another checkpoint if one was created in the last 5 seconds
      return existing;
    }

    const executionState = readActiveExecutionState(session.workspaceRoot);
    const loopState = readLoopFSMState(session.workspaceRoot);

    // Build summary and context including loop state if active
    const hasLoop = loopState !== null;
    const summary = hasLoop
      ? `Pre-compaction checkpoint: ${currentContext.goal} | Loop ${loopState!.loop_id} (${loopState!.phase}, iteration ${loopState!.iteration}/${loopState!.max_iterations})`
      : executionState
        ? `Pre-compaction checkpoint: ${currentContext.goal} | Active plan ${executionState.planName} (${executionState.remainingTasks} remaining)`
        : `Pre-compaction checkpoint: ${currentContext.goal}`;

    const pendingTasks = [
      ...(executionState
        ? [
            `Active execution plan: ${executionState.planName}`,
            `Top-level plan tasks remaining: ${executionState.remainingTasks}`,
          ]
        : []),
      ...(hasLoop
        ? [
            `Active Loop: ${loopState!.loop_id}`,
            `Loop phase: ${loopState!.phase} (iteration ${loopState!.iteration}/${loopState!.max_iterations})`,
          ]
        : []),
      ...currentContext.pendingTasks,
    ];

    const keyFiles = [
      ...(executionState ? [executionState.planPath] : []),
      ...(hasLoop ? ['.opencode/loops/active.json'] : []),
      ...currentContext.keyFiles,
    ];

    const resumeInstructions =
      executionState || hasLoop
        ? `Resume from this checkpoint to recover context lost during compaction.
${
  executionState
    ? `Active execution plan: ${executionState.planName} (path: ${executionState.planPath})
Top-level plan tasks remaining: ${executionState.remainingTasks}`
    : ''
}
${hasLoop ? `Active Loop: ${loopState!.loop_id} (phase: ${loopState!.phase}, iteration ${loopState!.iteration}/${loopState!.max_iterations})` : ''}
Prior phase: ${currentContext.currentPhase ?? 'execute'} (${currentContext.currentAgent ?? 'atlas'})
Re-read the plan and loop state, rebuild todos from current top-level checkboxes if needed, and continue until the active boulder plan is complete.`
        : 'Resume from this checkpoint to recover context lost during compaction.';

    const checkpoint = this.createVersionedCheckpoint(
      sessionID,
      {
        summary,
        goal: currentContext.goal,
        keyDecisions: currentContext.recentDecisions,
        openIssues: [],
        pendingTasks,
        keyFiles: Array.from(new Set(keyFiles)),
        resumeInstructions,
      },
      {
        level: 'light',
        trigger: 'auto-compaction',
        preCompactionTimestamp: Date.now(),
      },
    );

    return checkpoint;
  }

  /**
   * Get checkpoint statistics for a session.
   */
  getCheckpointStats(sessionID: string): {
    total: number;
    active: number;
    consumed: number;
    superseded: number;
    light: number;
    heavy: number;
  } {
    const session = this.sessionMemory.get(sessionID);
    if (!session) {
      return {
        total: 0,
        active: 0,
        consumed: 0,
        superseded: 0,
        light: 0,
        heavy: 0,
      };
    }

    const checkpoints = session.checkpoints;
    return {
      total: checkpoints.length,
      active: checkpoints.filter((cp) => cp.status === 'active').length,
      consumed: checkpoints.filter((cp) => cp.status === 'consumed').length,
      superseded: checkpoints.filter((cp) => cp.status === 'superseded').length,
      light: checkpoints.filter((cp) => cp.level === 'light').length,
      heavy: checkpoints.filter((cp) => cp.level === 'heavy').length,
    };
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
        conversation = this.conversationMemory.create(
          conversationID,
          sessionID,
        );
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

    this.workingMemory.updateTask(
      sessionID,
      `context-pressure:L${pressure.level}`,
    );
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
    this.workspaceMemory.setGlobalContext(
      session.workspaceRoot,
      'lastContextPressure',
      {
        sessionID,
        ...pressure,
        strategy,
        checkpointID: checkpoint.id,
      },
    );

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
        ? [
            'If the session is reopened later, continue only from net-new changes.',
          ]
        : [
            'Resolve the review finding or gather the required user/external input.',
          ],
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
    this.workspaceMemory.setGlobalContext(
      session.workspaceRoot,
      'lastReviewOutcome',
      {
        sessionID,
        verdict,
        details: normalizedDetails,
        checkpointID: checkpoint.id,
      },
    );

    if (session.conversationID) {
      this.conversationMemory.updateSummary(session.conversationID, summary);
    }

    if (session.repositoryId) {
      this.repositoryMemory.addKnowledge(session.repositoryId, summary);
      this.repositoryMemory.addPattern(
        session.repositoryId,
        `review-outcome:${verdict}`,
      );
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
      [
        'Resume after resolving the pause reason or explicitly re-enabling auto mode.',
      ],
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
    this.workspaceMemory.setGlobalContext(
      session.workspaceRoot,
      'lastAutoPause',
      {
        sessionID,
        reason,
        details: normalizedDetails,
        checkpointID: checkpoint.id,
      },
    );

    if (session.conversationID) {
      this.conversationMemory.updateSummary(session.conversationID, summary);
    }

    if (session.repositoryId) {
      this.repositoryMemory.addKnowledge(session.repositoryId, summary);
      this.repositoryMemory.addPattern(
        session.repositoryId,
        `auto-pause:${reason}`,
      );
      addGlobalKnowledge(session.repositoryId, summary);
      addGlobalPattern(session.repositoryId, `auto-pause:${reason}`);
    }

    this.persist();
    return checkpoint;
  }

  recordBatchSummary(
    sessionID: string,
    summaryText: string,
  ): ContextCheckpoint | null {
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
    this.workspaceMemory.setGlobalContext(
      session.workspaceRoot,
      'lastBatchSummary',
      {
        sessionID,
        summary: normalizedSummary,
        checkpointID: checkpoint.id,
      },
    );

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
      addGlobalPattern(
        session.repositoryId,
        'batch-summary:auto-review-approved',
      );
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
    const validation = validatePreferenceContent(normalizedContent);
    if (!validation.ok) {
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

  recordAutoPreferenceHint(sessionID: string, content: string): string | null {
    const session = this.sessionMemory.get(sessionID);
    if (!session) {
      return null;
    }

    const normalizedContent = content.trim();
    const classification = classifyAutoPreference(normalizedContent);
    if (!classification) {
      return null;
    }

    const id = `pref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entry: PreferenceMemoryEntry = {
      id,
      kind: classification.kind,
      content: normalizedContent,
      source: 'auto',
      scope: classification.scope,
      createdAt: Date.now(),
    };

    if (classification.scope === 'repository' && session.repositoryId) {
      this.repositoryMemory.addPreference(session.repositoryId, entry);
      this.repositoryMemory.addKnowledge(
        session.repositoryId,
        `Preference (${classification.kind}): ${normalizedContent}`,
      );
      this.repositoryMemory.addPattern(
        session.repositoryId,
        `preference:${classification.kind}`,
      );
      addGlobalKnowledge(
        session.repositoryId,
        `Preference (${classification.kind}): ${normalizedContent}`,
      );
      addGlobalPattern(
        session.repositoryId,
        `preference:${classification.kind}`,
      );
    } else {
      this.workspaceMemory.addPreference(session.workspaceRoot, entry);
      this.workspaceMemory.setGlobalContext(
        session.workspaceRoot,
        `preference:${id}`,
        entry,
      );
    }

    this.sessionMemory.setMetadata(sessionID, 'lastAutoPreference', entry);
    this.workingMemory.addDecision(
      sessionID,
      `Captured auto ${classification.kind} preference (${classification.scope}): ${normalizedContent}`,
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
      removed = this.repositoryMemory.removePreference(
        session.repositoryId,
        input.id,
      );
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
      removed = this.workspaceMemory.removePreference(
        session.workspaceRoot,
        input.id,
      );
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

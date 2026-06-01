// Checkpoint mechanism types - multi-level memory management
// Checkpoint is the "reinforcement board" for compaction:
// - Compaction handles short-distance context compression
// - Checkpoint preserves detailed state that compaction might lose

/** Checkpoint level: light for daily notes, heavy for cross-session handoff */
export type CheckpointLevel = 'light' | 'heavy';

/** Checkpoint lifecycle status */
export type CheckpointStatus =
  | 'active' // Just created, available for use
  | 'consumed' // Already used by a resume
  | 'superseded' // Replaced by a newer checkpoint
  | 'archived'; // Historical, kept for reference

/** What triggered the checkpoint creation */
export type CheckpointTrigger =
  | 'manual' // User explicitly created via /ol-checkpoint
  | 'auto-compaction' // Automatically created before compaction
  | 'auto-pressure' // Automatically created due to context pressure
  | 'auto-review'; // Created after review outcome

export interface ContextCheckpoint {
  id: string;
  timestamp: number;
  sessionID: string;
  conversationID?: string;
  summary: string;
  keyDecisions: string[];
  openIssues: string[];
  tokenCount: number;

  // New fields for versioned architecture
  /** Checkpoint level: light (same-session) or heavy (cross-session) */
  level: CheckpointLevel;
  /** Current lifecycle status */
  status: CheckpointStatus;
  /** What triggered creation */
  trigger: CheckpointTrigger;
  /** If created before compaction, the compaction timestamp */
  preCompactionTimestamp?: number;
  /** File path where this checkpoint is persisted */
  filePath?: string;
  /** Session that consumed this checkpoint (if consumed) */
  consumedBySession?: string;
  /** When this checkpoint was consumed */
  consumedAt?: number;
}

export interface PreferenceMemoryEntry {
  id: string;
  kind: 'workflow' | 'preference' | 'tooling';
  content: string;
  source: 'manual' | 'auto';
  scope: 'workspace' | 'repository';
  createdAt: number;
}

export interface WorkingMemory {
  sessionID: string;
  currentTask?: string;
  recentDecisions: string[];
  activeContext: Map<string, unknown>;
  lastUpdated: number;
}

export interface ConversationMemory {
  conversationID: string;
  sessionIDs: string[];
  checkpoints: ContextCheckpoint[];
  summary: string;
  startTime: number;
  lastActivity: number;
}

export interface SessionMemory {
  sessionID: string;
  conversationID?: string;
  workspaceRoot: string;
  repositoryId?: string;
  checkpoints: ContextCheckpoint[];
  metadata: Record<string, unknown>;
  createdAt: number;
  lastActivity: number;
}

export interface WorkspaceMemory {
  workspaceRoot: string;
  repositoryId?: string;
  sessions: Map<string, SessionMemory>;
  globalContext: Record<string, unknown>;
  preferences: PreferenceMemoryEntry[];
  lastActivity: number;
}

export interface RepositoryMemory {
  repositoryId: string;
  workspaces: Map<string, WorkspaceMemory>;
  globalKnowledge: string[];
  patterns: string[];
  preferences: PreferenceMemoryEntry[];
  lastActivity: number;
}

export interface CheckpointStorage {
  workingMemory: Map<string, WorkingMemory>;
  conversationMemory: Map<string, ConversationMemory>;
  sessionMemory: Map<string, SessionMemory>;
  workspaceMemory: Map<string, WorkspaceMemory>;
  repositoryMemory: Map<string, RepositoryMemory>;
}

/** Metadata stored in latest.meta.json */
export interface CheckpointMeta {
  checkpoint_id: string;
  checkpoint_level: CheckpointLevel;
  checkpoint_status: CheckpointStatus;
  checkpoint_trigger: CheckpointTrigger;
  source_session_id: string;
  created_at: string;
  goal: string;
  session_switch_recommendation: 'stay' | 'recommend-switch';
  /** If this checkpoint was created before a compaction */
  pre_compaction?: boolean;
  /** History of checkpoint IDs for this workspace */
  checkpoint_history?: string[];
}

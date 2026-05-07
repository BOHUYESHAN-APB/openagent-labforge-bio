// Checkpoint mechanism types - multi-level memory management

export interface ContextCheckpoint {
  id: string;
  timestamp: number;
  sessionID: string;
  conversationID?: string;
  summary: string;
  keyDecisions: string[];
  openIssues: string[];
  tokenCount: number;
}

export interface PreferenceMemoryEntry {
  id: string;
  kind: 'workflow' | 'preference' | 'tooling';
  content: string;
  source: 'manual';
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

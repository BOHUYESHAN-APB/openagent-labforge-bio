import type {
  CheckpointStorage,
  ContextCheckpoint,
  SessionMemory,
} from './types';

export class SessionMemoryStore {
  private storage: CheckpointStorage['sessionMemory'];

  constructor(storage: CheckpointStorage['sessionMemory']) {
    this.storage = storage;
  }

  create(
    sessionID: string,
    workspaceRoot: string,
    repositoryId?: string,
    conversationID?: string,
  ): SessionMemory {
    const memory: SessionMemory = {
      sessionID,
      conversationID,
      workspaceRoot,
      repositoryId,
      checkpoints: [],
      metadata: {},
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    this.storage.set(sessionID, memory);
    return memory;
  }

  get(sessionID: string): SessionMemory | undefined {
    return this.storage.get(sessionID);
  }

  addCheckpoint(sessionID: string, checkpoint: ContextCheckpoint): void {
    const memory = this.get(sessionID);
    if (memory) {
      memory.checkpoints.push(checkpoint);
      memory.lastActivity = Date.now();
    }
  }

  setMetadata(sessionID: string, key: string, value: unknown): void {
    const memory = this.get(sessionID);
    if (memory) {
      memory.metadata[key] = value;
      memory.lastActivity = Date.now();
    }
  }

  getCheckpoints(sessionID: string): ContextCheckpoint[] {
    return this.get(sessionID)?.checkpoints ?? [];
  }

  clear(sessionID: string): void {
    this.storage.delete(sessionID);
  }
}

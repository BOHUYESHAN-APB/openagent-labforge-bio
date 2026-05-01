import type {
  CheckpointStorage,
  ContextCheckpoint,
  ConversationMemory,
} from './types';

export class ConversationMemoryStore {
  private storage: CheckpointStorage['conversationMemory'];

  constructor(storage: CheckpointStorage['conversationMemory']) {
    this.storage = storage;
  }

  create(conversationID: string, sessionID: string): ConversationMemory {
    const memory: ConversationMemory = {
      conversationID,
      sessionIDs: [sessionID],
      checkpoints: [],
      summary: '',
      startTime: Date.now(),
      lastActivity: Date.now(),
    };
    this.storage.set(conversationID, memory);
    return memory;
  }

  get(conversationID: string): ConversationMemory | undefined {
    return this.storage.get(conversationID);
  }

  addSession(conversationID: string, sessionID: string): void {
    const memory = this.get(conversationID);
    if (memory && !memory.sessionIDs.includes(sessionID)) {
      memory.sessionIDs.push(sessionID);
      memory.lastActivity = Date.now();
    }
  }

  addCheckpoint(conversationID: string, checkpoint: ContextCheckpoint): void {
    const memory = this.get(conversationID);
    if (memory) {
      memory.checkpoints.push(checkpoint);
      memory.lastActivity = Date.now();
    }
  }

  updateSummary(conversationID: string, summary: string): void {
    const memory = this.get(conversationID);
    if (memory) {
      memory.summary = summary;
      memory.lastActivity = Date.now();
    }
  }

  getCheckpoints(conversationID: string): ContextCheckpoint[] {
    return this.get(conversationID)?.checkpoints ?? [];
  }

  clear(conversationID: string): void {
    this.storage.delete(conversationID);
  }
}

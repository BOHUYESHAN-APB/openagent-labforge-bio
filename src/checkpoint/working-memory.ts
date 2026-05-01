import type {
  CheckpointStorage,
  ContextCheckpoint,
  WorkingMemory,
} from './types';

export class WorkingMemoryStore {
  private storage: CheckpointStorage['workingMemory'];

  constructor(storage: CheckpointStorage['workingMemory']) {
    this.storage = storage;
  }

  set(sessionID: string, memory: Partial<WorkingMemory>): void {
    const existing = this.storage.get(sessionID);
    this.storage.set(sessionID, {
      sessionID,
      recentDecisions: [],
      activeContext: new Map(),
      lastUpdated: Date.now(),
      ...existing,
      ...memory,
    });
  }

  get(sessionID: string): WorkingMemory | undefined {
    return this.storage.get(sessionID);
  }

  updateTask(sessionID: string, task: string): void {
    const memory = this.get(sessionID);
    if (memory) {
      memory.currentTask = task;
      memory.lastUpdated = Date.now();
    } else {
      this.set(sessionID, { currentTask: task });
    }
  }

  addDecision(sessionID: string, decision: string): void {
    const memory = this.get(sessionID);
    if (memory) {
      memory.recentDecisions.push(decision);
      if (memory.recentDecisions.length > 10) {
        memory.recentDecisions.shift();
      }
      memory.lastUpdated = Date.now();
    } else {
      this.set(sessionID, { recentDecisions: [decision] });
    }
  }

  setContext(sessionID: string, key: string, value: unknown): void {
    const memory = this.get(sessionID);
    if (memory) {
      memory.activeContext.set(key, value);
      memory.lastUpdated = Date.now();
    } else {
      const context = new Map([[key, value]]);
      this.set(sessionID, { activeContext: context });
    }
  }

  clear(sessionID: string): void {
    this.storage.delete(sessionID);
  }
}

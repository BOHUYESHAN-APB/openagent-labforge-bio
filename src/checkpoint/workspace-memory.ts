import type {
  CheckpointStorage,
  SessionMemory,
  WorkspaceMemory,
} from './types';

export class WorkspaceMemoryStore {
  private storage: CheckpointStorage['workspaceMemory'];

  constructor(storage: CheckpointStorage['workspaceMemory']) {
    this.storage = storage;
  }

  create(workspaceRoot: string, repositoryId?: string): WorkspaceMemory {
    const memory: WorkspaceMemory = {
      workspaceRoot,
      repositoryId,
      sessions: new Map(),
      globalContext: {},
      lastActivity: Date.now(),
    };
    this.storage.set(workspaceRoot, memory);
    return memory;
  }

  get(workspaceRoot: string): WorkspaceMemory | undefined {
    return this.storage.get(workspaceRoot);
  }

  addSession(workspaceRoot: string, session: SessionMemory): void {
    const memory = this.get(workspaceRoot);
    if (memory) {
      memory.sessions.set(session.sessionID, session);
      memory.lastActivity = Date.now();
    }
  }

  setGlobalContext(workspaceRoot: string, key: string, value: unknown): void {
    const memory = this.get(workspaceRoot);
    if (memory) {
      memory.globalContext[key] = value;
      memory.lastActivity = Date.now();
    }
  }

  getSessions(workspaceRoot: string): SessionMemory[] {
    const memory = this.get(workspaceRoot);
    return memory ? Array.from(memory.sessions.values()) : [];
  }

  clear(workspaceRoot: string): void {
    this.storage.delete(workspaceRoot);
  }
}

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
      preferences: [],
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

  setRepositoryId(workspaceRoot: string, repositoryId: string): void {
    const memory = this.get(workspaceRoot);
    if (memory) {
      memory.repositoryId = repositoryId;
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

  addPreference(
    workspaceRoot: string,
    entry: WorkspaceMemory['preferences'][number],
  ): void {
    const memory = this.get(workspaceRoot);
    if (!memory) return;
    if (!memory.preferences.some((item) => item.id === entry.id)) {
      memory.preferences.push(entry);
      memory.lastActivity = Date.now();
    }
  }

  removePreference(workspaceRoot: string, entryId: string): boolean {
    const memory = this.get(workspaceRoot);
    if (!memory) return false;
    const before = memory.preferences.length;
    memory.preferences = memory.preferences.filter((item) => item.id !== entryId);
    const removed = memory.preferences.length !== before;
    if (removed) {
      memory.lastActivity = Date.now();
    }
    return removed;
  }

  getSessions(workspaceRoot: string): SessionMemory[] {
    const memory = this.get(workspaceRoot);
    return memory ? Array.from(memory.sessions.values()) : [];
  }

  clear(workspaceRoot: string): void {
    this.storage.delete(workspaceRoot);
  }
}

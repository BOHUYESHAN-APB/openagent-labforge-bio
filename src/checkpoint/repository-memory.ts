import type {
  CheckpointStorage,
  RepositoryMemory,
  WorkspaceMemory,
} from './types';

export class RepositoryMemoryStore {
  private storage: CheckpointStorage['repositoryMemory'];

  constructor(storage: CheckpointStorage['repositoryMemory']) {
    this.storage = storage;
  }

  create(repositoryId: string): RepositoryMemory {
    const memory: RepositoryMemory = {
      repositoryId,
      workspaces: new Map(),
      globalKnowledge: [],
      patterns: [],
      preferences: [],
      lastActivity: Date.now(),
    };
    this.storage.set(repositoryId, memory);
    return memory;
  }

  get(repositoryId: string): RepositoryMemory | undefined {
    return this.storage.get(repositoryId);
  }

  addWorkspace(repositoryId: string, workspace: WorkspaceMemory): void {
    const memory = this.get(repositoryId);
    if (memory) {
      memory.workspaces.set(workspace.workspaceRoot, workspace);
      memory.lastActivity = Date.now();
    }
  }

  addKnowledge(repositoryId: string, knowledge: string): void {
    const memory = this.get(repositoryId);
    if (memory && !memory.globalKnowledge.includes(knowledge)) {
      memory.globalKnowledge.push(knowledge);
      memory.lastActivity = Date.now();
    }
  }

  addPattern(repositoryId: string, pattern: string): void {
    const memory = this.get(repositoryId);
    if (memory && !memory.patterns.includes(pattern)) {
      memory.patterns.push(pattern);
      memory.lastActivity = Date.now();
    }
  }

  removeKnowledge(repositoryId: string, knowledge: string): boolean {
    const memory = this.get(repositoryId);
    if (!memory) return false;
    const before = memory.globalKnowledge.length;
    memory.globalKnowledge = memory.globalKnowledge.filter(
      (item) => item !== knowledge,
    );
    const removed = memory.globalKnowledge.length !== before;
    if (removed) {
      memory.lastActivity = Date.now();
    }
    return removed;
  }

  removePattern(repositoryId: string, pattern: string): boolean {
    const memory = this.get(repositoryId);
    if (!memory) return false;
    const before = memory.patterns.length;
    memory.patterns = memory.patterns.filter((item) => item !== pattern);
    const removed = memory.patterns.length !== before;
    if (removed) {
      memory.lastActivity = Date.now();
    }
    return removed;
  }

  addPreference(
    repositoryId: string,
    entry: RepositoryMemory['preferences'][number],
  ): void {
    const memory = this.get(repositoryId);
    if (!memory) return;
    if (!memory.preferences.some((item) => item.id === entry.id)) {
      memory.preferences.push(entry);
      memory.lastActivity = Date.now();
    }
  }

  removePreference(repositoryId: string, entryId: string): boolean {
    const memory = this.get(repositoryId);
    if (!memory) return false;
    const before = memory.preferences.length;
    memory.preferences = memory.preferences.filter((item) => item.id !== entryId);
    const removed = memory.preferences.length !== before;
    if (removed) {
      memory.lastActivity = Date.now();
    }
    return removed;
  }

  getWorkspaces(repositoryId: string): WorkspaceMemory[] {
    const memory = this.get(repositoryId);
    return memory ? Array.from(memory.workspaces.values()) : [];
  }

  clear(repositoryId: string): void {
    this.storage.delete(repositoryId);
  }
}

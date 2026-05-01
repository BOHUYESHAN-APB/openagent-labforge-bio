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

  getWorkspaces(repositoryId: string): WorkspaceMemory[] {
    const memory = this.get(repositoryId);
    return memory ? Array.from(memory.workspaces.values()) : [];
  }

  clear(repositoryId: string): void {
    this.storage.delete(repositoryId);
  }
}

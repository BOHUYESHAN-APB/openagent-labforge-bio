import { resolve } from 'node:path';

export interface WorkspaceRecord {
  id: string;
  directory: string;
  type?: string | null;
  strategy?: string | null;
}

export interface ProjectWorktreeRecord {
  id: string;
  worktree: string;
}

export function normalizeWorkspaceDirectory(directory: string): string {
  const normalized = resolve(directory).replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isNestedUnderAny(candidate: string, roots: string[]): boolean {
  const normalizedCandidate = normalizeWorkspaceDirectory(candidate);
  return roots.some(
    (root) =>
      normalizedCandidate !== root &&
      normalizedCandidate.startsWith(`${root}/`),
  );
}

export function selectPreferredWorkspaceRecords(input: {
  currentWorkspace?: string;
  projectDirectories: WorkspaceRecord[];
  projectWorktrees: ProjectWorktreeRecord[];
}): WorkspaceRecord[] {
  const selected = new Map<string, WorkspaceRecord>();

  const add = (record: WorkspaceRecord) => {
    const normalized = normalizeWorkspaceDirectory(record.directory);
    if (!selected.has(normalized)) {
      selected.set(normalized, {
        ...record,
        directory: resolve(record.directory),
        id: record.id || normalized,
      });
    }
  };

  if (input.currentWorkspace) {
    add({
      id: normalizeWorkspaceDirectory(input.currentWorkspace),
      directory: input.currentWorkspace,
      type: 'current',
      strategy: null,
    });
  }

  for (const record of input.projectDirectories) {
    if (record.strategy === 'git_worktree') {
      continue;
    }
    add(record);
  }

  const primaryRoots = Array.from(selected.values()).map((record) =>
    normalizeWorkspaceDirectory(record.directory),
  );

  for (const worktree of input.projectWorktrees) {
    if (isNestedUnderAny(worktree.worktree, primaryRoots)) {
      continue;
    }

    add({
      id: worktree.id,
      directory: worktree.worktree,
      type: 'project',
      strategy: null,
    });
  }

  return Array.from(selected.values()).sort((left, right) =>
    left.directory.localeCompare(right.directory),
  );
}

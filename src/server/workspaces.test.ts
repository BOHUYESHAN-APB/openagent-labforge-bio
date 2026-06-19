import { describe, expect, test } from 'bun:test';
import {
  normalizeWorkspaceDirectory,
  selectPreferredWorkspaceRecords,
} from './workspaces';

describe('normalizeWorkspaceDirectory', () => {
  test('only lowercases on Windows', () => {
    const input = '/Tmp/MixedCase/Repo';
    const result = normalizeWorkspaceDirectory(input);

    if (process.platform === 'win32') {
      expect(result).toContain('/tmp/mixedcase/repo');
      return;
    }

    expect(result).toContain('/Tmp/MixedCase/Repo');
  });
});

describe('selectPreferredWorkspaceRecords', () => {
  test('prefers main project roots and filters git worktrees', () => {
    const result = selectPreferredWorkspaceRecords({
      currentWorkspace: 'D:/repo/current',
      projectDirectories: [
        {
          id: 'main-a',
          directory: 'D:/repo/current',
          type: 'main',
          strategy: null,
        },
        {
          id: 'nested-worktree',
          directory: 'D:/repo/current/.kilo/worktrees/demo',
          type: null,
          strategy: 'git_worktree',
        },
        {
          id: 'main-b',
          directory: 'F:/other/project',
          type: 'main',
          strategy: null,
        },
      ],
      projectWorktrees: [
        { id: 'proj-current', worktree: 'D:/repo/current' },
        { id: 'proj-nested', worktree: 'D:/repo/current/Future/clone/opencode' },
        { id: 'proj-other', worktree: 'F:/other/project' },
        { id: 'proj-missing', worktree: 'G:/standalone/project' },
      ],
    });

    expect(result.map((entry) => normalizeWorkspaceDirectory(entry.directory))).toEqual([
      normalizeWorkspaceDirectory('D:/repo/current'),
      normalizeWorkspaceDirectory('F:/other/project'),
      normalizeWorkspaceDirectory('G:/standalone/project'),
    ]);
  });

  test('deduplicates slash variants and keeps the current workspace', () => {
    const result = selectPreferredWorkspaceRecords({
      currentWorkspace: 'D:\\repo\\current',
      projectDirectories: [
        {
          id: 'main-a',
          directory: 'D:/repo/current',
          type: 'main',
          strategy: null,
        },
      ],
      projectWorktrees: [],
    });

    expect(result).toHaveLength(1);
    expect(normalizeWorkspaceDirectory(result[0]?.directory ?? '')).toBe(
      normalizeWorkspaceDirectory('D:/repo/current'),
    );
  });
});

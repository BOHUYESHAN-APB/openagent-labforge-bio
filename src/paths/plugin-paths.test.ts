import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  getGlobalBgTasksDir,
  getGlobalDashboardDir,
  getGlobalDataDir,
  getGlobalLogDir,
  getGlobalMcpDir,
  getGlobalMemoryDir,
  getGlobalStateDir,
  getOpenCodeDataDir,
  getPackageResourceDir,
  getProjectBoulderFile,
  getProjectCheckpointDir,
  getProjectImagesDir,
  getProjectMcpDir,
  getProjectMcpServersDir,
  getProjectMemoryDir,
  getProjectPlansDir,
  getProjectStateDir,
} from './plugin-paths';

describe('plugin paths', () => {
  test('resolves package resources under package root', () => {
    expect(getPackageResourceDir('/pkg/extendai-lab', 'bioSkills')).toBe(
      join('/pkg/extendai-lab', 'resources', 'bioSkills'),
    );
  });

  test('resolves project-scoped state directories', () => {
    const root = join('repo');
    expect(getProjectStateDir(root)).toBe(
      join(root, '.opencode', 'extendai-lab'),
    );
    expect(getProjectMcpDir(root)).toBe(
      join(root, '.opencode', 'extendai-lab', 'mcp'),
    );
    expect(getProjectMcpServersDir(root)).toBe(
      join(root, '.opencode', 'extendai-lab', 'mcp', 'servers'),
    );
    expect(getProjectMemoryDir(root)).toBe(
      join(root, '.opencode', 'extendai-lab', 'memory'),
    );
    expect(getProjectCheckpointDir(root)).toBe(
      join(root, '.opencode', 'extendai-lab', 'checkpoints'),
    );
    expect(getProjectPlansDir(root)).toBe(
      join(root, '.opencode', 'extendai-lab', 'plans'),
    );
    expect(getProjectBoulderFile(root)).toBe(
      join(root, '.opencode', 'extendai-lab', 'boulder.json'),
    );
    expect(getProjectImagesDir(root)).toBe(
      join(root, '.opencode', 'extendai-lab', 'images'),
    );
  });

  test('resolves Windows global state under APPDATA', () => {
    const env = { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' };
    expect(getGlobalStateDir('win32', env)).toBe(
      join(env.APPDATA, 'opencode', 'extendai-lab'),
    );
    expect(getGlobalMemoryDir('win32', env)).toBe(
      join(env.APPDATA, 'opencode', 'extendai-lab', 'memory'),
    );
    expect(getGlobalMcpDir('win32', env)).toBe(
      join(env.APPDATA, 'opencode', 'extendai-lab', 'mcp'),
    );
  });

  test('resolves Linux global state under XDG_CONFIG_HOME', () => {
    const env = { XDG_CONFIG_HOME: '/home/me/.config' };
    expect(getGlobalStateDir('linux', env)).toBe(
      join(env.XDG_CONFIG_HOME, 'opencode', 'extendai-lab'),
    );
  });

  test('resolves global data directories under XDG_DATA_HOME', () => {
    const env = { XDG_DATA_HOME: '/home/me/.local/share' };
    expect(getOpenCodeDataDir(env)).toBe(join(env.XDG_DATA_HOME, 'opencode'));
    expect(getGlobalDataDir(env)).toBe(
      join(env.XDG_DATA_HOME, 'opencode', 'extendai-lab'),
    );
    expect(getGlobalLogDir(env)).toBe(
      join(env.XDG_DATA_HOME, 'opencode', 'extendai-lab', 'logs'),
    );
    expect(getGlobalDashboardDir(env)).toBe(
      join(env.XDG_DATA_HOME, 'opencode', 'extendai-lab', 'dashboard'),
    );
    expect(getGlobalBgTasksDir(env)).toBe(
      join(env.XDG_DATA_HOME, 'opencode', 'extendai-lab', 'bg-tasks'),
    );
  });
});

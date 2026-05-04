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
    expect(getPackageResourceDir('/pkg/openagent-labforge', 'bioSkills')).toBe(
      join('/pkg/openagent-labforge', 'resources', 'bioSkills'),
    );
  });

  test('resolves project-scoped state directories', () => {
    const root = join('repo');
    expect(getProjectStateDir(root)).toBe(
      join(root, '.opencode', 'openagent-labforge'),
    );
    expect(getProjectMcpDir(root)).toBe(
      join(root, '.opencode', 'openagent-labforge', 'mcp'),
    );
    expect(getProjectMcpServersDir(root)).toBe(
      join(root, '.opencode', 'openagent-labforge', 'mcp', 'servers'),
    );
    expect(getProjectMemoryDir(root)).toBe(
      join(root, '.opencode', 'openagent-labforge', 'memory'),
    );
    expect(getProjectCheckpointDir(root)).toBe(
      join(root, '.opencode', 'openagent-labforge', 'checkpoints'),
    );
    expect(getProjectPlansDir(root)).toBe(
      join(root, '.opencode', 'openagent-labforge', 'plans'),
    );
    expect(getProjectBoulderFile(root)).toBe(
      join(root, '.opencode', 'openagent-labforge', 'boulder.json'),
    );
    expect(getProjectImagesDir(root)).toBe(
      join(root, '.opencode', 'openagent-labforge', 'images'),
    );
  });

  test('resolves Windows global state under APPDATA', () => {
    const env = { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' };
    expect(getGlobalStateDir('win32', env)).toBe(
      join(env.APPDATA, 'opencode', 'openagent-labforge'),
    );
    expect(getGlobalMemoryDir('win32', env)).toBe(
      join(env.APPDATA, 'opencode', 'openagent-labforge', 'memory'),
    );
    expect(getGlobalMcpDir('win32', env)).toBe(
      join(env.APPDATA, 'opencode', 'openagent-labforge', 'mcp'),
    );
  });

  test('resolves Linux global state under XDG_CONFIG_HOME', () => {
    const env = { XDG_CONFIG_HOME: '/home/me/.config' };
    expect(getGlobalStateDir('linux', env)).toBe(
      join(env.XDG_CONFIG_HOME, 'opencode', 'openagent-labforge'),
    );
  });

  test('resolves global data directories under XDG_DATA_HOME', () => {
    const env = { XDG_DATA_HOME: '/home/me/.local/share' };
    expect(getOpenCodeDataDir(env)).toBe(join(env.XDG_DATA_HOME, 'opencode'));
    expect(getGlobalDataDir(env)).toBe(
      join(env.XDG_DATA_HOME, 'opencode', 'openagent-labforge'),
    );
    expect(getGlobalLogDir(env)).toBe(
      join(env.XDG_DATA_HOME, 'opencode', 'openagent-labforge', 'logs'),
    );
    expect(getGlobalDashboardDir(env)).toBe(
      join(env.XDG_DATA_HOME, 'opencode', 'openagent-labforge', 'dashboard'),
    );
    expect(getGlobalBgTasksDir(env)).toBe(
      join(env.XDG_DATA_HOME, 'opencode', 'openagent-labforge', 'bg-tasks'),
    );
  });
});

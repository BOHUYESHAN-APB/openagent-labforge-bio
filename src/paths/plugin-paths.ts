import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_STATE_DIR = 'openagent-labforge';

export function getPackageRoot(moduleUrl: string = import.meta.url): string {
  return dirname(dirname(fileURLToPath(moduleUrl)));
}

export function getPackageResourceDir(
  packageRoot: string,
  ...segments: string[]
): string {
  return join(packageRoot, 'resources', ...segments);
}

export function getProjectStateDir(workspaceRoot: string): string {
  return join(workspaceRoot, '.opencode', PLUGIN_STATE_DIR);
}

export function getProjectMcpDir(workspaceRoot: string): string {
  return join(getProjectStateDir(workspaceRoot), 'mcp');
}

export function getProjectMcpServersDir(workspaceRoot: string): string {
  return join(getProjectMcpDir(workspaceRoot), 'servers');
}

export function getProjectMemoryDir(workspaceRoot: string): string {
  return join(getProjectStateDir(workspaceRoot), 'memory');
}

export function getProjectCheckpointDir(workspaceRoot: string): string {
  return join(getProjectStateDir(workspaceRoot), 'checkpoints');
}

export function getGlobalStateDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform === 'win32') {
    return join(
      env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
      'opencode',
      PLUGIN_STATE_DIR,
    );
  }

  return join(
    env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
    'opencode',
    PLUGIN_STATE_DIR,
  );
}

export function getGlobalMemoryDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(getGlobalStateDir(platform, env), 'memory');
}

export function getGlobalMcpDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(getGlobalStateDir(platform, env), 'mcp');
}

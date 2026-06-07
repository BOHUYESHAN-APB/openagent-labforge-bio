import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_STATE_DIR } from '../config/product';

function getDefaultDataHome(): string {
  return join(homedir(), '.local', 'share');
}

/**
 * Get the package root directory.
 *
 * IMPORTANT: This function returns the npm package root, NOT the source repository.
 * - In production (npm install): returns node_modules/oh-my-opencode/
 * - In development (local build): returns the repository root
 *
 * DO NOT hardcode paths to the source repository. Always use this function
 * to get the correct package root for accessing bundled resources.
 *
 * @param moduleUrl - The import.meta.url of the calling module
 * @returns The absolute path to the package root directory
 */
export function getPackageRoot(moduleUrl: string = import.meta.url): string {
  return dirname(dirname(fileURLToPath(moduleUrl)));
}

/**
 * Get a resource directory within the package.
 *
 * IMPORTANT: This returns a path INSIDE the npm package, NOT the source repository.
 * - In production: node_modules/oh-my-opencode/resources/{segments}
 * - In development: {repo-root}/resources/{segments}
 *
 * Use this function to access bundled resources like bioSkills, academicSkills, etc.
 * DO NOT hardcode paths like "D:/-Users-/Documents/GitHub/..." - that's the source repo,
 * not the installed package.
 *
 * @param packageRoot - The package root from getPackageRoot()
 * @param segments - Path segments to append after 'resources/'
 * @returns The absolute path to the resource directory
 */
export function getPackageResourceDir(
  packageRoot: string,
  ...segments: string[]
): string {
  return join(packageRoot, 'resources', ...segments);
}

export function getProjectStateDir(workspaceRoot: string): string {
  return join(workspaceRoot, '.opencode', PLUGIN_STATE_DIR);
}

export function getProjectStateSearchDirs(workspaceRoot: string): string[] {
  return [getProjectStateDir(workspaceRoot)];
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

export function getProjectPlansDir(workspaceRoot: string): string {
  return join(getProjectStateDir(workspaceRoot), 'plans');
}

export function getProjectBoulderFile(workspaceRoot: string): string {
  return join(getProjectStateDir(workspaceRoot), 'boulder.json');
}

export function getProjectImagesDir(workspaceRoot: string): string {
  return join(getProjectStateDir(workspaceRoot), 'images');
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

export function getOpenCodeDataDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(env.XDG_DATA_HOME ?? getDefaultDataHome(), 'opencode');
}

export function getGlobalDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(getOpenCodeDataDir(env), PLUGIN_STATE_DIR);
}

export function getGlobalLogDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(getGlobalDataDir(env), 'logs');
}

export function getGlobalDashboardDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(getGlobalDataDir(env), 'dashboard');
}

export function getGlobalBgTasksDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(getGlobalDataDir(env), 'bg-tasks');
}

// Legacy global state / data / log / bg-tasks dir helpers removed at v1.0.16

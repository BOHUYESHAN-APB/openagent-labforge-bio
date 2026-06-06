import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

/**
 * Tool installation status
 */
export interface ToolStatus {
  installed: boolean;
  version?: string;
  context?: string;
  installCmd?: string;
  error?: string;
}

/**
 * Environment type
 */
export type Environment = 'windows' | 'wsl' | 'linux' | 'macos';

/**
 * Detect the current runtime environment
 */
export function detectEnvironment(): Environment {
  const platform = os.platform();

  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';

  // Linux: check if running inside WSL
  if (platform === 'linux') {
    try {
      const release = fs.readFileSync('/proc/version', 'utf8');
      if (
        release.toLowerCase().includes('microsoft') ||
        release.toLowerCase().includes('wsl')
      ) {
        return 'wsl';
      }
    } catch {
      // Not WSL
    }
    return 'linux';
  }

  return 'linux';
}

/**
 * Check if a command exists and get its version
 */
async function checkCommand(
  command: string,
  versionArgs: string[] = ['--version'],
): Promise<ToolStatus> {
  return new Promise((resolve) => {
    const proc = spawn(command, versionArgs, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const version = (stdout + stderr).trim().split('\n')[0];
        resolve({ installed: true, version });
      } else {
        resolve({ installed: false, error: stderr.trim() });
      }
    });

    proc.on('error', (err) => {
      resolve({ installed: false, error: err.message });
    });
  });
}

/**
 * Check if a command exists in WSL
 */
async function checkCommandInWSL(
  command: string,
  versionArgs: string[] = ['--version'],
): Promise<ToolStatus> {
  return new Promise((resolve) => {
    const wslCommand = `wsl ${command} ${versionArgs.join(' ')}`;
    const proc = spawn(wslCommand, [], {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const version = (stdout + stderr).trim().split('\n')[0];
        resolve({ installed: true, version, context: 'wsl' });
      } else {
        resolve({ installed: false, context: 'wsl', error: stderr.trim() });
      }
    });

    proc.on('error', (err) => {
      resolve({ installed: false, context: 'wsl', error: err.message });
    });
  });
}

/**
 * Check if WSL is installed (Windows only)
 */
async function checkWSL(): Promise<ToolStatus> {
  return new Promise((resolve) => {
    const proc = spawn('wsl', ['--status'], {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({
          installed: true,
          version: 'WSL installed',
          installCmd: 'Already installed',
        });
      } else {
        resolve({
          installed: false,
          installCmd: 'wsl --install',
          error: stderr.trim(),
        });
      }
    });

    proc.on('error', () => {
      resolve({
        installed: false,
        installCmd: 'wsl --install',
        error: 'WSL not found',
      });
    });
  });
}

/**
 * Check if Docker is installed (environment-aware)
 */
async function checkDocker(env: Environment): Promise<ToolStatus> {
  if (env === 'windows') {
    // Windows: check WSL first, then check Docker in WSL
    const wslStatus = await checkWSL();
    if (!wslStatus.installed) {
      return {
        installed: false,
        context: 'wsl',
        installCmd: 'Install WSL first: wsl --install',
      };
    }
    return checkCommandInWSL('docker', ['--version']);
  }
  if (env === 'wsl') {
    // OpenCode running in WSL: check Docker directly
    return checkCommand('docker', ['--version']);
  }
  // Linux / macOS: check Docker directly
  return checkCommand('docker', ['--version']);
}

/**
 * Check if NoteExpress is installed (Windows only, GUI app)
 */
async function checkNoteExpress(): Promise<ToolStatus> {
  const env = detectEnvironment();
  if (env !== 'windows') {
    return {
      installed: false,
      context: 'windows-only',
      installCmd: 'NoteExpress is Windows-only',
    };
  }

  // Check common installation paths
  const paths = [
    'C:\\Program Files\\NoteExpress',
    'C:\\Program Files (x86)\\NoteExpress',
  ];

  for (const path of paths) {
    if (fs.existsSync(path)) {
      return {
        installed: true,
        version: 'NoteExpress (GUI)',
        context: 'windows',
      };
    }
  }

  return {
    installed: false,
    context: 'windows',
    installCmd: 'Download from http://www.noteexpress.com/',
  };
}

/**
 * Check if python-docx is installed
 */
async function checkPythonDocx(): Promise<ToolStatus> {
  return new Promise((resolve) => {
    const proc = spawn(
      'python',
      ['-c', 'import docx; print(docx.__version__)'],
      {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ installed: true, version: `python-docx ${stdout.trim()}` });
      } else {
        resolve({
          installed: false,
          installCmd: 'pip install python-docx',
          error: stderr.trim(),
        });
      }
    });

    proc.on('error', (err) => {
      resolve({
        installed: false,
        installCmd: 'pip install python-docx',
        error: err.message,
      });
    });
  });
}

/**
 * Tool check registry
 */
const toolCheckers: Record<string, (env: Environment) => Promise<ToolStatus>> =
  {
    papis: async () => checkCommand('papis', ['--version']),
    pandoc: async () => checkCommand('pandoc', ['--version']),
    gh: async () => checkCommand('gh', ['--version']),
    'python-docx': async () => checkPythonDocx(),
    wsl: async (env) => {
      if (env === 'windows') {
        return checkWSL();
      }
      return {
        installed: false,
        context: 'windows-only',
        installCmd: 'WSL is Windows-only',
      };
    },
    docker: async (env) => checkDocker(env),
    xelatex: async () => checkCommand('xelatex', ['--version']),
    noteexpress: async () => checkNoteExpress(),
    officecli: async () => checkCommand('officecli', ['--version']),
  };

/**
 * Check academic writing tools
 * @param tools - Optional list of specific tools to check. If not provided, checks all.
 */
export async function checkTools(
  tools?: string[],
): Promise<Record<string, ToolStatus>> {
  const env = detectEnvironment();
  const toolsToCheck = tools || Object.keys(toolCheckers);

  const results: Record<string, ToolStatus> = {};

  for (const tool of toolsToCheck) {
    const checker = toolCheckers[tool];
    if (checker) {
      results[tool] = await checker(env);
    } else {
      results[tool] = {
        installed: false,
        error: `Unknown tool: ${tool}`,
      };
    }
  }

  return results;
}

const WINDOWS_SHELL_SHIMS = new Set([
  'bunx',
  'npm',
  'npx',
  'pnpm',
  'pnpx',
  'yarn',
  'yarnpkg',
]);

export function normalizeLocalMcpCommand(
  command: string[],
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform !== 'win32') {
    return [...command];
  }

  const executable = command[0]?.toLowerCase();
  if (!executable || !WINDOWS_SHELL_SHIMS.has(executable)) {
    return [...command];
  }

  return ['cmd', '/c', ...command];
}

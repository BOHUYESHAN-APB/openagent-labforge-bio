import { describe, expect, test } from 'bun:test';
import { normalizeLocalMcpCommand } from './mcp-command-normalizer';

describe('normalizeLocalMcpCommand', () => {
  test('wraps npm-family shims with cmd /c on Windows', () => {
    expect(
      normalizeLocalMcpCommand(['npx', '-y', 'server'], 'win32'),
    ).toEqual(['cmd', '/c', 'npx', '-y', 'server']);
  });

  test('does not wrap uv or uvx on Windows', () => {
    expect(normalizeLocalMcpCommand(['uvx', 'server'], 'win32')).toEqual([
      'uvx',
      'server',
    ]);
    expect(normalizeLocalMcpCommand(['uv', 'run', 'server'], 'win32')).toEqual([
      'uv',
      'run',
      'server',
    ]);
  });
});

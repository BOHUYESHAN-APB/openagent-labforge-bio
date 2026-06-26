import { describe, expect, test } from 'bun:test';
import { classifyTerminalCommand } from './command-policy';

describe('classifyTerminalCommand', () => {
  test('classifies quick inspection commands as short-sync', () => {
    expect(classifyTerminalCommand('git status')).toBe('short-sync');
    expect(classifyTerminalCommand('git diff --stat')).toBe('short-sync');
    expect(classifyTerminalCommand('gh release view v1.17.8')).toBe(
      'short-sync',
    );
    expect(classifyTerminalCommand('python -c "print(123)"')).toBe(
      'short-sync',
    );
    expect(classifyTerminalCommand('bun test -t "my test"')).toBe('short-sync');
  });

  test('classifies finite but possibly longer commands as pty-recommended', () => {
    expect(classifyTerminalCommand('bun test')).toBe('pty-recommended');
    expect(classifyTerminalCommand('pytest tests')).toBe('pty-recommended');
    expect(classifyTerminalCommand('python scripts/analyze.py')).toBe(
      'pty-recommended',
    );
  });

  test('classifies builds and persistent sessions as pty-required', () => {
    expect(classifyTerminalCommand('bun run build')).toBe('pty-required');
    expect(classifyTerminalCommand('npm run dev')).toBe('pty-required');
    expect(classifyTerminalCommand('vite dev')).toBe('pty-required');
    expect(classifyTerminalCommand('tail -f server.log')).toBe('pty-required');
    expect(classifyTerminalCommand('python')).toBe('pty-required');
  });
});

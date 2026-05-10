import { describe, expect, test } from 'bun:test';
import { loadAgentInstructionsTool } from './load-agent-instructions';

describe('loadAgentInstructionsTool', () => {
  test('loads explorer instructions', async () => {
    const result = await loadAgentInstructionsTool.execute(
      { agent: 'explorer' },
      { sessionID: 'test' } as any,
    );

    expect(result).toContain('# explorer Instructions');
    expect(result).toContain('Explorer');
    expect(result).toContain('codebase');
  });

  test('loads oracle instructions', async () => {
    const result = await loadAgentInstructionsTool.execute(
      { agent: 'oracle' },
      { sessionID: 'test' } as any,
    );

    expect(result).toContain('# oracle Instructions');
    expect(result).toContain('Oracle');
    expect(result).toContain('strategic');
  });

  test('loads librarian instructions', async () => {
    const result = await loadAgentInstructionsTool.execute(
      { agent: 'librarian' },
      { sessionID: 'test' } as any,
    );

    expect(result).toContain('# librarian Instructions');
    expect(result).toContain('Librarian');
    expect(result).toContain('documentation');
  });

  test('loads designer instructions', async () => {
    const result = await loadAgentInstructionsTool.execute(
      { agent: 'designer' },
      { sessionID: 'test' } as any,
    );

    expect(result).toContain('# designer Instructions');
    expect(result).toContain('designer');
  });

  test('loads fixer instructions', async () => {
    const result = await loadAgentInstructionsTool.execute(
      { agent: 'fixer' },
      { sessionID: 'test' } as any,
    );

    expect(result).toContain('# fixer Instructions');
    expect(result).toContain('fixer');
  });

  test('loads primary agent instructions (deep-worker)', async () => {
    const result = await loadAgentInstructionsTool.execute(
      { agent: 'deep-worker' },
      { sessionID: 'test' } as any,
    );

    expect(result).toContain('# deep-worker Instructions');
    expect(result).toContain('deep-worker');
  });

  test('loads primary agent instructions (prometheus)', async () => {
    const result = await loadAgentInstructionsTool.execute(
      { agent: 'prometheus' },
      { sessionID: 'test' } as any,
    );

    expect(result).toContain('# prometheus Instructions');
    expect(result).toContain('prometheus');
  });

  test('handles unknown agent gracefully', async () => {
    const result = await loadAgentInstructionsTool.execute(
      { agent: 'unknown-agent' },
      { sessionID: 'test' } as any,
    );

    expect(result).toContain('Unknown agent: unknown-agent');
    expect(result).toContain('Available agents:');
    expect(result).toContain('explorer');
    expect(result).toContain('oracle');
  });

  test('handles case-insensitive agent names', async () => {
    const result = await loadAgentInstructionsTool.execute(
      { agent: 'EXPLORER' },
      { sessionID: 'test' } as any,
    );

    expect(result).toContain('# explorer Instructions');
  });

  test('handles agent names with whitespace', async () => {
    const result = await loadAgentInstructionsTool.execute(
      { agent: '  oracle  ' },
      { sessionID: 'test' } as any,
    );

    expect(result).toContain('# oracle Instructions');
  });

  test('includes usage note in output', async () => {
    const result = await loadAgentInstructionsTool.execute(
      { agent: 'explorer' },
      { sessionID: 'test' } as any,
    );

    expect(result).toContain('**Note**');
    expect(result).toContain('main agent context');
    expect(result).toContain('child session');
  });
});

import { describe, expect, test } from 'bun:test';
import { createBashTimeoutRecoveryHook, PTY_RECOVERY_TEXT } from './index';

describe('bash timeout recovery hook', () => {
  test('appends recovery reminder after bash timeout output', async () => {
    const hook = createBashTimeoutRecoveryHook({} as never);
    const output = {
      output:
        'partial output\n\n<bash_metadata>\nbash tool terminated command after exceeding timeout 300000 ms.\n</bash_metadata>',
    };

    await hook['tool.execute.after']({ tool: 'bash' }, output);

    expect(output.output).toContain(PTY_RECOVERY_TEXT);
  });

  test('ignores non-bash tools', async () => {
    const hook = createBashTimeoutRecoveryHook({} as never);
    const output = {
      output: 'bash tool terminated command after exceeding timeout',
    };

    await hook['tool.execute.after']({ tool: 'read' }, output);

    expect(output.output).not.toContain(PTY_RECOVERY_TEXT);
  });

  test('does not duplicate recovery reminder', async () => {
    const hook = createBashTimeoutRecoveryHook({} as never);
    const output = {
      output:
        'bash tool terminated command after exceeding timeout\n\n' +
        PTY_RECOVERY_TEXT,
    };

    await hook['tool.execute.after']({ tool: 'bash' }, output);

    expect(output.output).toBe(
      'bash tool terminated command after exceeding timeout\n\n' +
        PTY_RECOVERY_TEXT,
    );
  });
});

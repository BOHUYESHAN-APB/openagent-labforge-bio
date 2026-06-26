import { describe, expect, test } from 'bun:test';
import {
  createPtyAvailabilityHook,
  PTY_AVAILABLE_TEXT,
  PTY_UNAVAILABLE_TEXT,
} from './index';

describe('pty availability hook', () => {
  test('injects unavailable guidance before pty tools are observed', async () => {
    const hook = createPtyAvailabilityHook();
    const output = { system: [] as string[] };

    await hook['experimental.chat.system.transform'](
      { sessionID: 's1' },
      output,
    );

    expect(output.system).toContain(PTY_UNAVAILABLE_TEXT);
  });

  test('injects available guidance after pty tool definitions are observed', async () => {
    const hook = createPtyAvailabilityHook();
    const output = { system: [] as string[] };

    await hook['tool.definition'](
      { toolID: 'pty_spawn' },
      { description: 'spawn', parameters: {} },
    );
    await hook['experimental.chat.system.transform'](
      { sessionID: 's1' },
      output,
    );

    expect(output.system).toContain(PTY_AVAILABLE_TEXT);
  });

  test('augments bash tool description when pty is unavailable', async () => {
    const hook = createPtyAvailabilityHook();
    const output = { description: 'bash description', parameters: {} };

    await hook['tool.definition']({ toolID: 'bash' }, output);

    expect(output.description).toContain(
      'Persistent PTY terminal tools are NOT available',
    );
  });

  test('augments bash tool description when pty is available', async () => {
    const hook = createPtyAvailabilityHook();
    const output = { description: 'bash description', parameters: {} };

    await hook['tool.definition'](
      { toolID: 'pty_spawn' },
      { description: 'spawn', parameters: {} },
    );
    await hook['tool.definition']({ toolID: 'bash' }, output);

    expect(output.description).toContain(
      'Persistent PTY terminal tools are available',
    );
  });

  test('blocks pty-required bash commands when pty is available', async () => {
    const hook = createPtyAvailabilityHook();
    const output = {
      args: {
        command: 'bun run build',
      },
    };

    await hook['tool.definition'](
      { toolID: 'pty_spawn' },
      { description: 'spawn', parameters: {} },
    );
    await hook['tool.execute.before']({ tool: 'bash' }, output);

    expect(String(output.args?.command)).toContain(
      'This bash command matches the PTY-required class',
    );
  });

  test('does not block short-sync bash commands when pty is available', async () => {
    const hook = createPtyAvailabilityHook();
    const output = {
      args: {
        command: 'git status',
      },
    };

    await hook['tool.definition'](
      { toolID: 'pty_spawn' },
      { description: 'spawn', parameters: {} },
    );
    await hook['tool.execute.before']({ tool: 'bash' }, output);

    expect(output.args?.command).toBe('git status');
  });

  test('does not inject duplicate marker text', async () => {
    const hook = createPtyAvailabilityHook();
    const output = { system: [] as string[] };

    await hook['tool.definition'](
      { toolID: 'pty_spawn' },
      { description: 'spawn', parameters: {} },
    );
    await hook['experimental.chat.system.transform'](
      { sessionID: 's1' },
      output,
    );
    await hook['experimental.chat.system.transform'](
      { sessionID: 's1' },
      output,
    );

    expect(output.system).toHaveLength(1);
  });
});

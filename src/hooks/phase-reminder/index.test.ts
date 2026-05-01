import { describe, expect, test } from 'bun:test';
import { createPhaseReminderHook, PHASE_REMINDER } from './index';

describe('createPhaseReminderHook', () => {
  test('appends reminder to system array', async () => {
    const hook = createPhaseReminderHook();
    const output = { system: ['base system prompt'] };

    await hook['experimental.chat.system.transform'](
      { sessionID: 'test-1' },
      output,
    );

    expect(output.system).toHaveLength(2);
    expect(output.system[1]).toBe(PHASE_REMINDER);
  });

  test('does not append duplicate reminder', async () => {
    const hook = createPhaseReminderHook();
    const output = { system: [`base\n\n${PHASE_REMINDER}`] };

    await hook['experimental.chat.system.transform'](
      { sessionID: 'test-1' },
      output,
    );

    expect(output.system).toHaveLength(1);
    expect(output.system[0]).toBe(`base\n\n${PHASE_REMINDER}`);
  });

  test('skips when no sessionID', async () => {
    const hook = createPhaseReminderHook();
    const output = { system: ['base'] };

    await hook['experimental.chat.system.transform']({}, output);

    expect(output.system).toHaveLength(1);
    expect(output.system[0]).toBe('base');
  });
});

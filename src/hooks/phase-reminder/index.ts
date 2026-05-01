import { PHASE_REMINDER_TEXT } from '../../config/constants';

export const PHASE_REMINDER = `<internal_reminder>${PHASE_REMINDER_TEXT}</internal_reminder>`;

export function createPhaseReminderHook() {
  return {
    'experimental.chat.system.transform': async (
      input: { sessionID?: string },
      output: { system: string[] },
    ): Promise<void> => {
      if (!input.sessionID) {
        return;
      }

      const combined = output.system.join('\n\n');
      if (combined.includes(PHASE_REMINDER)) {
        return;
      }

      output.system.push(PHASE_REMINDER);
    },
  };
}

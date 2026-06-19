import type { PluginInput } from '@opencode-ai/plugin';

const BASH_TIMEOUT_SIGNAL = 'bash tool terminated command after exceeding timeout';

const PTY_RECOVERY_TEXT = `<internal_reminder>
The previous bash command timed out.

This is a timeout/fallback event, not successful completion.
Do NOT stop here.

Recovery rules:
- If PTY tools are available, prefer \`pty_spawn\` for the retry instead of repeating the long command with \`bash\`.
- If PTY tools are unavailable, either retry with an explicitly larger bash timeout for a bounded command, or split the task into smaller synchronous steps.
- After timeout, always continue with the next recovery action rather than waiting passively.
</internal_reminder>`;

function hasBashTimeout(output: unknown): output is string {
  return typeof output === 'string' && output.includes(BASH_TIMEOUT_SIGNAL);
}

export function createBashTimeoutRecoveryHook(_ctx: PluginInput) {
  return {
    'tool.execute.after': async (
      input: { tool: string },
      output: { output?: unknown },
    ): Promise<void> => {
      if (input.tool.toLowerCase() !== 'bash') {
        return;
      }

      if (!hasBashTimeout(output.output)) {
        return;
      }

      if (output.output.includes(PTY_RECOVERY_TEXT)) {
        return;
      }

      output.output = `${output.output}\n\n${PTY_RECOVERY_TEXT}`;
    },
  };
}

export { BASH_TIMEOUT_SIGNAL, PTY_RECOVERY_TEXT };

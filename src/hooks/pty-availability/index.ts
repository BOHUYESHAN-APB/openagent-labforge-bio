import { classifyTerminalCommand } from './command-policy';

const PTY_AVAILABLE_MARKER = '[PTY_AVAILABILITY_INJECTED]';

const PTY_AVAILABLE_TEXT = `${PTY_AVAILABLE_MARKER}

<pty_availability>
Persistent PTY terminal tools are available in this session: \`pty_spawn\`, \`pty_read\`, \`pty_write\`, \`pty_list\`, \`pty_kill\`.

Use PTY selectively, not universally.
- **bash / short-sync**: quick one-liners and bounded inspection commands such as \`git status\`, \`git diff\`, \`git log -10\`, \`gh release view\`, \`bun --version\`, \`python -c ...\`, or a narrowly scoped single test command.
- **PTY recommended**: longer test runs, script execution, and multi-step commands that may run for a while but are still expected to finish.
- **PTY required**: builds, dev servers, watch mode, interactive shells, background sessions, and anything that needs to keep running after the current response.
- After spawning a PTY session, manage it explicitly with \`pty_read\`, \`pty_write\`, and \`pty_kill\`.
</pty_availability>`;

const PTY_UNAVAILABLE_TEXT = `${PTY_AVAILABLE_MARKER}

<pty_availability>
Persistent PTY terminal tools are NOT available in this session.

The built-in \`bash\` tool is synchronous and may terminate long-running commands after its timeout.
- Prefer short, bounded terminal commands.
- If a command is likely to run longer (builds, test suites, dev servers, watch mode, long scripts), explicitly choose between a larger bash timeout, splitting the command, or asking the user to enable PTY support.
- If bash times out, do not stop there; continue with a recovery plan instead of assuming the work is complete.
</pty_availability>`;

export function createPtyAvailabilityHook() {
  let ptyToolsAvailable = false;

  function appendNote(description: string, note: string): string {
    if (description.includes(note)) {
      return description;
    }

    return `${description}\n\n${note}`;
  }

  function buildBashRedirectMessage(command: string): string {
    const policy = classifyTerminalCommand(command);
    if (policy !== 'pty-required') {
      return '';
    }

    return [
      'This bash command matches the PTY-required class and should not run through the synchronous bash tool when PTY tools are available.',
      '',
      `Command: ${command}`,
      '',
      'Required action:',
      '- Re-issue this command with `pty_spawn`.',
      '- Use `pty_read` / `pty_write` / `pty_kill` to manage the session.',
      '- Do not keep retrying the same build/dev/watch command with `bash`.',
    ].join('\n');
  }

  return {
    'tool.execute.before': async (
      input: { tool: string },
      output: { args?: Record<string, unknown> },
    ): Promise<void> => {
      if (!ptyToolsAvailable || input.tool.toLowerCase() !== 'bash') {
        return;
      }

      const command = String(output.args?.command ?? '').trim();
      if (!command) {
        return;
      }

      const redirectMessage = buildBashRedirectMessage(command);
      if (!redirectMessage) {
        return;
      }

      output.args = {
        command: `echo "${redirectMessage.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
        description: 'Explains PTY-required command routing',
      };
    },

    'tool.definition': async (
      input: { toolID: string },
      output: { description: string; parameters: unknown },
    ): Promise<void> => {
      if (input.toolID.startsWith('pty_')) {
        ptyToolsAvailable = true;
        return;
      }

      if (input.toolID === 'bash') {
        output.description = appendNote(
          output.description,
          ptyToolsAvailable ? PTY_AVAILABLE_TEXT : PTY_UNAVAILABLE_TEXT,
        );
      }
    },

    'experimental.chat.system.transform': async (
      input: { sessionID?: string },
      output: { system: string[] },
    ): Promise<void> => {
      if (!input.sessionID) {
        return;
      }

      const combined = output.system.join('\n\n');
      if (combined.includes(PTY_AVAILABLE_MARKER)) {
        return;
      }

      output.system.push(
        ptyToolsAvailable ? PTY_AVAILABLE_TEXT : PTY_UNAVAILABLE_TEXT,
      );
    },
  };
}

export { PTY_AVAILABLE_MARKER, PTY_AVAILABLE_TEXT, PTY_UNAVAILABLE_TEXT };

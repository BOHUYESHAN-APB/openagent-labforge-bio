const PTY_AVAILABLE_MARKER = '[PTY_AVAILABILITY_INJECTED]';

const PTY_AVAILABLE_TEXT = `${PTY_AVAILABLE_MARKER}

<pty_availability>
Persistent PTY terminal tools are available in this session: \`pty_spawn\`, \`pty_read\`, \`pty_write\`, \`pty_list\`, \`pty_kill\`.

For long-running, background, or interactive terminal work, you MUST prefer PTY tools over the built-in \`bash\` tool.
- Use \`pty_spawn\` for builds, tests, dev servers, Python scripts, watch mode, and commands likely to exceed the bash timeout.
- Use \`bash\` only for short synchronous commands that should finish quickly.
- After spawning a PTY session, manage it explicitly with \`pty_read\`, \`pty_write\`, and \`pty_kill\`.
</pty_availability>`;

const PTY_UNAVAILABLE_TEXT = `${PTY_AVAILABLE_MARKER}

<pty_availability>
Persistent PTY terminal tools are NOT available in this session.

The built-in \`bash\` tool is synchronous and may terminate long-running commands after its timeout.
- Prefer short, bounded terminal commands.
- If a command is likely to run longer, explicitly choose between a larger bash timeout, splitting the command, or asking the user to enable PTY support.
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

  return {
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

      output.system.push(ptyToolsAvailable ? PTY_AVAILABLE_TEXT : PTY_UNAVAILABLE_TEXT);
    },
  };
}

export { PTY_AVAILABLE_MARKER, PTY_AVAILABLE_TEXT, PTY_UNAVAILABLE_TEXT };

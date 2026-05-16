/**
 * Delete command guard — intercepts bash/shell tool calls containing
 * destructive commands and asks for user confirmation.
 *
 * DANGEROUS_DELETE_PATTERNS: commands that delete files/directories
 *   - rm -rf / rm -r / rm -f / del / rmdir / Remove-Item / shred
 *   - Script execution (./script.sh, bash script.sh, etc.)
 *
 * The script detection is heuristic — if the model runs a script file
 * that internally calls rm, we can only warn about it, not prevent it.
 * True sandboxing would require Docker/container isolation.
 */

import { type PluginInput } from '@opencode-ai/plugin';

const DANGEROUS_DELETE_PATTERNS = [
  // Unix-style deletion
  /\brm\s+-[rf]/i,
  /\brm\s+-rf/i,
  /\brm\s+-\w*[rfR]/i,
  /\brmdir\s+/i,
  /\bshred\s+/i,
  /\bwipe\s+/i,
  /\bdd\s+if=\/dev\/zero/i,
  // PowerShell deletion
  /\bRemove-Item\b/i,
  /\bdel\s+/i,
  /\brmdir\s+\/s/i,
  // Dangerous with pipe
  /\|.*\brm\b/i,
  /\|.*\bdel\b/i,
  // Recursive permission changes (can lead to data loss)
  /\bchmod\s+-R\s+777\s+\//i,
  /\bchown\s+-R\s+.*\s+\//i,
] as const;

const SCRIPT_EXECUTION_PATTERNS = [
  // Direct script execution
  /^\.\//,
  /^\. /,
  /^bash\s+/,
  /^sh\s+/,
  /^zsh\s+/,
  /^source\s+/,
  // PowerShell script execution
  /^\.\\/,
  /& \.\//,
  /powershell\s+-file/i,
  /pwsh\s+-/i,
] as const;

function matchesDeletePattern(command: string): boolean {
  for (const pattern of DANGEROUS_DELETE_PATTERNS) {
    if (pattern.test(command)) return true;
  }
  return false;
}

function matchesScriptPattern(command: string): boolean {
  for (const pattern of SCRIPT_EXECUTION_PATTERNS) {
    if (pattern.test(command)) return true;
  }
  return false;
}

export function createDeleteGuardHook(ctx: PluginInput) {
  return {
    'tool.execute.before': async (
      input: { tool: string; callID?: string },
      output: {
        args?: Record<string, unknown>;
        [key: string]: unknown;
      },
    ): Promise<void> => {
      // Only intercept shell-type tools
      const toolName = input.tool?.toLowerCase();
      if (
        toolName !== 'bash' &&
        toolName !== 'shell' &&
        toolName !== 'exec' &&
        toolName !== 'execute_command' &&
        toolName !== 'powershell'
      ) {
        return;
      }

      const command = (
        (output.args?.command as string) ||
        (output.args?.cmd as string) ||
        ''
      ).trim();

      if (!command) return;

      const hasDelete = matchesDeletePattern(command);
      const isScript = matchesScriptPattern(command);

      if (!hasDelete && !isScript) return;

      // Build warning message
      const warnings: string[] = [];
      if (hasDelete) {
        warnings.push('delete/filesystem-destructive command');
      }
      if (isScript) {
        warnings.push(`script execution (${command.slice(0, 80)})`);
      }

      // Ask user for confirmation
      try {
        const answer = await ctx.client.session.prompt({
          path: { id: ctx.directory },
          body: {
            parts: [
              {
                type: 'text',
                text: [
                  `⚠️ **Safety Guard: ${warnings.join(' + ')} detected**`,
                  '',
                  `\`\`\`bash`,
                  command.length > 200
                    ? command.slice(0, 200) + '...'
                    : command,
                  `\`\`\``,
                  '',
                  'Allow this command to proceed?',
                ].join('\n'),
              },
            ],
            // noReply: false — we want user input
          },
        });

        if (answer && typeof answer === 'object' && 'confirmed' in answer) {
          // User confirmed — proceed
          return;
        }
      } catch {
        // If the approval UI fails, reject the command to be safe
      }

      // Replace the execution args with a warning message
      // instead of running the dangerous command
      output.args = {
        command: [
          '# ⚠️ Command blocked by ExtendAI Lab Safety Guard',
          `# Reason: ${warnings.join(' + ')}`,
          '# The safety guard requires user approval in the UI.',
          '# If this is safe, cancel this run and execute it manually,',
          '# or disable the guard in extendai-lab.jsonc (not recommended).',
        ].join('\n'),
      };
    },
  };
}

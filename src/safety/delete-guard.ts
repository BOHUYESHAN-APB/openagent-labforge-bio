/**
 * Delete command guard — intercepts bash/shell tool calls containing
 * destructive commands. Uses OpenCode's native permission pattern:
 * instead of silently replacing the command, it leaves a clear trail
 * the AI must explain to the user.
 *
 * Flow:
 *   1. Dangerous command detected →
 *   2. Block with echo message showing the blocked command + reason
 *   3. AI sees the block in tool result →
 *   4. AI must EXPLAIN to user why it needs this command →
 *   5. User approves or denies
 *
 * Script content: when a local script file is executed (./script.sh,
 * python script.py, etc.), the guard CANNOT inspect inside the script.
 * True sandboxing requires OS-level isolation (Docker/Windows Sandbox).
 * For script execution we always warn — the user decides.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { PluginInput } from '@opencode-ai/plugin';

// ── Unix / PowerShell / Cross-platform delete patterns ────────────
const DELETE_PATTERNS = [
  /\brm\s+-[rf]+/,
  /\brm\s+-rf/i,
  /\brm\s+-\w*[rfR]/,
  /\brmdir\s+/,
  /\bshred\s+/,
  /\bwipe\s+/,
  /Remove-Item\b/i,
  /\bdel\s+/,
  /\brmdir\s+\/s/i,
  // Recursive permission changes (data loss risk)
  /\bchmod\s+-R\s+777\s+\//i,
  /\bchown\s+-R\s+.*\s+\//i,
  // Format/Mkfs (disk-level destruction)
  /\bmkfs\./,
  /\bformat\s+/,
] as const;

const DANGEROUS_COMBINED_PATTERNS = [
  /\|\s*rm\s/i,       // `| rm` pipe to delete
  /&&\s*rm\s/i,       // `&& rm` chain delete
  /;?\s*rm\s/i,       // `; rm` sequential delete
] as const;

// ── Script execution patterns ────────────────────────────────────
const SCRIPT_PATTERNS = [
  /^\.\//,             // ./script.sh
  /^\.\s/,             // . script.sh (source)
  /^(bash|sh|zsh|fish)\s+/,
  /^source\s+/,
  /^\.\\/,             // PowerShell .\script.ps1
  /& \.\//,
  /powershell\s+-file/i,
  /pwsh\s+-/i,
  /^python[23]?\s+/,
  /^node\s+/,
  /^deno\s+/,
  /^bun\s+/,
  /^ruby\s+/,
  /^perl\s+/,
  /^php\s+/,
] as const;

// ── Script languages that have file-delete capabilities ───────────
const CODE_DELETE_PATTERNS = [
  // Python
  /\bos\.remove\(/,
  /\bos\.rmdir\(/,
  /\bshutil\.rmtree\(/,
  /\bpathlib\.Path\(.*\)\.unlink/,
  /\bsend2trash/,
  // Node/JS
  /\bfs\.unlink(Sync)?\(/,
  /\bfs\.rm(Sync)?\(/,
  /\bfs\.rmdir(Sync)?\(/,
  /\bdel\(\s*["']/,
  // Shell inside scripts
  /\bsubprocess\.run\(\s*\[?\s*["']rm/,
  /\bexec\(\s*["']rm/,
  /\bos\.system\(\s*["']rm/,
  // Go
  /\bos\.Remove\(/,
  /\bos\.RemoveAll\(/,
  // Rust
  /\bstd::fs::remove_file/,
  /\bstd::fs::remove_dir_all/,
  // Java
  /\.delete\(\)/,
  /Files\.delete/,
  /Files\.walkFileTree.*delete/,
  // C/C++
  /\bremove\(/,
  /\bunlink\(/,
  /\bDeleteFile/,
  /\bRemoveDirectory/,
  // .NET
  /File\.Delete/,
  /Directory\.Delete/,
  // Docker
  /\bdocker\s+(rm|rmi|system\s+prune)/i,
  /\bdocker\s+volume\s+rm/i,
  // Git dangerous
  /\bgit\s+reset\s+--hard/i,
  /\bgit\s+clean\s+-f[d]/i,
  /\bgit\s+push\s+.*\s+--force/i,
] as const;

function hasDeletePattern(command: string): string | null {
  for (const p of DELETE_PATTERNS) {
    if (p.test(command)) return p.source;
  }
  for (const p of DANGEROUS_COMBINED_PATTERNS) {
    if (p.test(command)) return p.source;
  }
  return null;
}

function isScriptExecution(command: string): string | null {
  for (const p of SCRIPT_PATTERNS) {
    if (p.test(command)) return p.source;
  }
  return null;
}

/**
 * Try to read the script file and scan for delete operations.
 * Returns matched patterns if found, null if clean or unreadable.
 */
function scanScriptFile(command: string): string[] | null {
  // Extract script path from command
  const match = command.match(
    /^(?:\.\/|\.\s|(?:bash|sh|python[23]?|node|bun|deno|ruby)\s+)([\S]+)/i,
  );
  if (!match) return null;

  const scriptPath = match[1];
  if (!scriptPath) return null;

  // Resolve path relative to cwd (can't know exact cwd, try relative)
  let fullPath: string;
  if (isAbsolute(scriptPath)) {
    fullPath = scriptPath;
  } else {
    // Assume workspace root relative
    fullPath = resolve(scriptPath);
  }

  if (!existsSync(fullPath)) return null;

  try {
    const content = readFileSync(fullPath, 'utf8');
    const found: string[] = [];

    for (const p of CODE_DELETE_PATTERNS) {
      if (p.test(content)) {
        found.push(p.source);
      }
    }

    return found.length > 0 ? found : null;
  } catch {
    return null;
  }
}

function buildBlockMessage(
  command: string,
  matchedPattern: string | null,
  scriptMatches: string[] | null,
): string {
  const lines: string[] = [
    '⚠️ Permission Required: Destructive Command',
    '',
  ];

  lines.push('The following command was blocked:');
  lines.push('');

  // Show the command (truncated if very long)
  const displayCmd = command.length > 300
    ? command.slice(0, 300) + '...'
    : command;
  lines.push('```');
  lines.push(displayCmd);
  lines.push('```');
  lines.push('');

  if (matchedPattern) {
    lines.push(
      `**Reason**: Detected potential data-loss pattern \`${matchedPattern}\`.`,
    );
  }

  if (scriptMatches) {
    lines.push(
      '',
      `**Script contains dangerous operations:**`,
      ...scriptMatches.map((m) => `  • \`${m}\``),
    );
  }

  lines.push(
    '',
    '**What to do:**',
    '1. Explain to the user WHY this command needs to run.',
    '2. If the user approves, re-run the same command.',
    '3. If the command is not needed, explain why and proceed without it.',
    '',
    'This guard protects against accidental data loss.',
    'It follows the same security model as OpenCode\'s built-in permission system:',
    'the AI proposes, the user disposes.',
  );

  return lines.join('\n');
}

export function createDeleteGuardHook(_ctx: PluginInput) {
  return {
    'tool.execute.before': async (
      input: { tool: string; callID?: string },
      output: {
        args?: Record<string, unknown>;
        [key: string]: unknown;
      },
    ): Promise<void> => {
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

      const matchedDelete = hasDeletePattern(command);
      const matchedScript = isScriptExecution(command);

      if (!matchedDelete && !matchedScript) return;

      // For script execution, try to read the script and scan for danger
      let scriptMatches: string[] | null = null;
      if (matchedScript) {
        scriptMatches = scanScriptFile(command);
        // Only block script execution if we actually found dangers
        if (!scriptMatches) return;
      }

      // Block the command — replace with message
      const blockMsg = buildBlockMessage(command, matchedDelete, scriptMatches ?? null);

      output.args = {
        command: `echo "${blockMsg.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
      };
    },
  };
}

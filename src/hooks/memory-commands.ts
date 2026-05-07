import type { PluginInput } from '@opencode-ai/plugin';
import { validatePreferenceContent } from '../checkpoint/preference-rules';
import { createInternalAgentTextPart } from '../utils';
import type { CheckpointManager } from '../checkpoint/manager';

const WRITE_COMMAND = 'ol-memory-write';
const DELETE_COMMAND = 'ol-memory-delete';
const LIST_COMMAND = 'ol-memory-list';

type MemoryScope = 'workspace' | 'repository' | 'all';
type PreferenceKind = 'workflow' | 'preference' | 'tooling';

function parseKeyValueArgs(args: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /(\w+)=("([^"]*)"|'([^']*)'|(\S+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(args))) {
    result[match[1].toLowerCase()] =
      match[3] ?? match[4] ?? match[5] ?? '';
  }
  return result;
}

function normalizeScope(value: string | undefined): MemoryScope | null {
  if (!value) return 'workspace';
  if (value === 'workspace' || value === 'repository' || value === 'all') {
    return value;
  }
  return null;
}

function normalizeKind(value: string | undefined): PreferenceKind | null {
  if (!value) return 'workflow';
  if (value === 'workflow' || value === 'preference' || value === 'tooling') {
    return value;
  }
  return null;
}

function buildUsage(command: string): string {
  if (command === WRITE_COMMAND) {
    return `Usage: /${WRITE_COMMAND} kind=<workflow|preference|tooling> scope=<workspace|repository> content="..."`;
  }
  if (command === DELETE_COMMAND) {
    return `Usage: /${DELETE_COMMAND} id=<pref_...> [scope=<workspace|repository|all>]`;
  }
  return `Usage: /${LIST_COMMAND} [scope=<workspace|repository|all>]`;
}

export function createMemoryCommandsHook(
  ctx: PluginInput,
  checkpointManager: CheckpointManager,
) {
  function registerCommands(opencodeConfig: Record<string, unknown>): void {
    const configCommand = opencodeConfig.command as
      | Record<string, unknown>
      | undefined;
    if (!configCommand?.[WRITE_COMMAND]) {
      if (!opencodeConfig.command) {
        opencodeConfig.command = {};
      }
      (opencodeConfig.command as Record<string, unknown>)[WRITE_COMMAND] = {
        template: 'Write a manual workflow/preference/tooling memory entry.',
        description:
          'Write a manual memory entry for workflow habits, tooling preferences, or development process rules',
      };
    }
    if (!configCommand?.[DELETE_COMMAND]) {
      (opencodeConfig.command as Record<string, unknown>)[DELETE_COMMAND] = {
        template: 'Delete a manual workflow/preference/tooling memory entry.',
        description: 'Delete a previously recorded manual memory entry by id',
      };
    }
    if (!configCommand?.[LIST_COMMAND]) {
      (opencodeConfig.command as Record<string, unknown>)[LIST_COMMAND] = {
        template: 'List manual workflow/preference/tooling memory entries.',
        description: 'List recorded manual memory entries for this workspace or repository',
      };
    }
  }

  async function handleCommandExecuteBefore(
    input: {
      command: string;
      sessionID: string;
      arguments: string;
    },
    output: { parts: Array<{ type: string; text?: string }> },
  ): Promise<void> {
    if (
      input.command !== WRITE_COMMAND &&
      input.command !== DELETE_COMMAND &&
      input.command !== LIST_COMMAND
    ) {
      return;
    }

    checkpointManager.ensureSession(
      input.sessionID,
      ctx.directory,
      ctx.directory,
      `workspace:${ctx.directory}`,
    );

    output.parts.length = 0;

    if (input.command === LIST_COMMAND) {
      const scope = normalizeScope(input.arguments.trim() || undefined);
      if (!scope) {
        output.parts.push(createInternalAgentTextPart(buildUsage(LIST_COMMAND)));
        return;
      }
      const entries = checkpointManager.listManualPreferences(input.sessionID, scope);
      if (entries.length === 0) {
        output.parts.push(
          createInternalAgentTextPart(
            `[Memory: no manual entries found for scope ${scope}.]`,
          ),
        );
        return;
      }
      const lines = entries.map(
        (entry) =>
          `- ${entry.id} | ${entry.scope} | ${entry.kind} | ${entry.content}`,
      );
      output.parts.push(
        createInternalAgentTextPart(
          `[Memory list (${scope})]\n${lines.join('\n')}`,
        ),
      );
      return;
    }

    const parsed = parseKeyValueArgs(input.arguments);

    if (input.command === WRITE_COMMAND) {
      const kind = normalizeKind(parsed.kind);
      const scope = normalizeScope(parsed.scope);
      const content = parsed.content?.trim();
      if (!kind || !scope || scope === 'all' || !content) {
        output.parts.push(createInternalAgentTextPart(buildUsage(WRITE_COMMAND)));
        return;
      }
      const validation = validatePreferenceContent(content);
      if (!validation.ok) {
        output.parts.push(
          createInternalAgentTextPart(
            '[Memory write rejected: only workflow habits, tooling preferences, and development process rules may be stored. Do not store emotional or personality judgments about the user.]',
          ),
        );
        return;
      }
      const id = checkpointManager.recordManualPreference(input.sessionID, {
        kind,
        scope,
        content,
      });
      if (!id) {
        output.parts.push(
          createInternalAgentTextPart('[Memory write failed: session memory is unavailable.]'),
        );
        return;
      }
      output.parts.push(
        createInternalAgentTextPart(
          `[Memory recorded: ${id} | ${scope} | ${kind} | ${content}]`,
        ),
      );
      return;
    }

    const id = parsed.id?.trim();
    const scope = normalizeScope(parsed.scope);
    if (!id || !scope) {
      output.parts.push(createInternalAgentTextPart(buildUsage(DELETE_COMMAND)));
      return;
    }
    const removed = checkpointManager.removeManualPreferenceById(
      input.sessionID,
      id,
      scope,
    );
    output.parts.push(
      createInternalAgentTextPart(
        removed
          ? `[Memory removed: ${id}]`
          : `[Memory remove skipped: ${id} not found in scope ${scope}.]`,
      ),
    );
  }

  return {
    registerCommands,
    handleCommandExecuteBefore,
  };
}

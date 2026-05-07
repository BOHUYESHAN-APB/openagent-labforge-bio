import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { CheckpointManager } from '../checkpoint/manager';
import { createMemoryCommandsHook } from './memory-commands';

function createOutput() {
  return { parts: [] as Array<{ type: string; text?: string }> };
}

function getOutputText(output: ReturnType<typeof createOutput>): string {
  return output.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n');
}

describe('memory commands hook', () => {
  test('writes, lists, and deletes manual memory entries', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ol-memory-hook-'));
    try {
      const manager = new CheckpointManager(root);
      const hook = createMemoryCommandsHook({ directory: root } as any, manager);

      const writeOutput = createOutput();
      await hook.handleCommandExecuteBefore(
        {
          command: 'ol-memory-write',
          sessionID: 'session-hook',
          arguments:
            'kind=workflow scope=repository content="Prefer test -> build -> deploy order"',
        },
        writeOutput,
      );

      const writeText = getOutputText(writeOutput);
      expect(writeText).toContain('[Memory recorded: pref_');
      expect(writeText).toContain('| repository | workflow | Prefer test -> build -> deploy order');

      const idMatch = writeText.match(/pref_[^\s\]]+/);
      expect(idMatch).not.toBeNull();
      const entryId = idMatch?.[0] ?? '';

      const listOutput = createOutput();
      await hook.handleCommandExecuteBefore(
        {
          command: 'ol-memory-list',
          sessionID: 'session-hook',
          arguments: 'repository',
        },
        listOutput,
      );

      const listText = getOutputText(listOutput);
      expect(listText).toContain('[Memory list (repository)]');
      expect(listText).toContain(entryId);
      expect(listText).toContain('Prefer test -> build -> deploy order');

      const deleteOutput = createOutput();
      await hook.handleCommandExecuteBefore(
        {
          command: 'ol-memory-delete',
          sessionID: 'session-hook',
          arguments: `id=${entryId} scope=repository`,
        },
        deleteOutput,
      );

      expect(getOutputText(deleteOutput)).toContain(`[Memory removed: ${entryId}]`);

      const listAfterDelete = createOutput();
      await hook.handleCommandExecuteBefore(
        {
          command: 'ol-memory-list',
          sessionID: 'session-hook',
          arguments: 'repository',
        },
        listAfterDelete,
      );
      expect(getOutputText(listAfterDelete)).toContain(
        '[Memory: no manual entries found for scope repository.]',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects emotional or personality judgments', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ol-memory-hook-'));
    try {
      const manager = new CheckpointManager(root);
      const hook = createMemoryCommandsHook({ directory: root } as any, manager);
      const output = createOutput();

      await hook.handleCommandExecuteBefore(
        {
          command: 'ol-memory-write',
          sessionID: 'session-hook',
          arguments:
            'kind=preference scope=workspace content="User gets angry easily when tests fail"',
        },
        output,
      );

      const text = getOutputText(output);
      expect(text).toContain('[Memory write rejected:');
      expect(manager.listManualPreferences('session-hook')).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects scope=all for writes and shows usage', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ol-memory-hook-'));
    try {
      const manager = new CheckpointManager(root);
      const hook = createMemoryCommandsHook({ directory: root } as any, manager);
      const output = createOutput();

      await hook.handleCommandExecuteBefore(
        {
          command: 'ol-memory-write',
          sessionID: 'session-hook',
          arguments:
            'kind=workflow scope=all content="Prefer build before deploy"',
        },
        output,
      );

      expect(getOutputText(output)).toContain(
        'Usage: /ol-memory-write kind=<workflow|preference|tooling> scope=<workspace|repository> content="..."',
      );
      expect(manager.listManualPreferences('session-hook')).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

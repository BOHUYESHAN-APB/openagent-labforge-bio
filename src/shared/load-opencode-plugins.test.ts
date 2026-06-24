/// <reference path="../../bun-test.d.ts" />

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

type LoadOpencodePluginsModule = {
  loadOpencodePlugins: (directory: string) => string[];
  clearOpencodePluginsCache?: () => void;
};

function createTempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'opencode-plugins-test-'));
}

function createConfigFile(dir: string, content: object): void {
  const configDir = path.join(dir, '.opencode');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, 'opencode.json'),
    JSON.stringify(content, null, 2),
    'utf-8',
  );
}

async function importFreshLoadOpencodePluginsModule(): Promise<LoadOpencodePluginsModule> {
  const url = new URL(
    `./load-opencode-plugins.ts?test=${Date.now()}-${Math.random()}`,
    import.meta.url,
  );
  return import(url.href);
}

describe('loadOpencodePlugins', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('#given the same directory is loaded twice', () => {
    describe('#when loading plugins repeatedly', () => {
      it('#then returns cached result instead of re-reading from disk', async () => {
        // given
        createConfigFile(tempDir, {
          plugin: ['@test/plugin-a', '@test/plugin-b'],
        });
        const { loadOpencodePlugins } =
          await importFreshLoadOpencodePluginsModule();

        // when
        const firstResult = loadOpencodePlugins(tempDir);

        // Modify the file on disk to have different content
        createConfigFile(tempDir, {
          plugin: ['@test/plugin-c', '@test/plugin-d'],
        });

        const secondResult = loadOpencodePlugins(tempDir);

        // then
        // First result reads from disk and includes our test plugins
        expect(firstResult).toEqual(
          expect.arrayContaining(['@test/plugin-a', '@test/plugin-b']),
        );
        // Second result should return the SAME cached array as the first,
        // proving the file was not re-read from disk
        expect(secondResult).toEqual(firstResult);
      });
    });
  });

  describe('#given the plugin cache was cleared', () => {
    describe('#when loading the same directory again', () => {
      it('#then re-reads plugin config files from disk', async () => {
        // given
        createConfigFile(tempDir, {
          plugin: ['@test/plugin-a', '@test/plugin-b'],
        });
        const { loadOpencodePlugins, clearOpencodePluginsCache } =
          await importFreshLoadOpencodePluginsModule();

        if (typeof clearOpencodePluginsCache !== 'function') {
          throw new Error('clearOpencodePluginsCache export is missing');
        }

        // when
        const firstResult = loadOpencodePlugins(tempDir);

        // Modify the file on disk
        createConfigFile(tempDir, {
          plugin: ['@test/plugin-c', '@test/plugin-d'],
        });

        // Second load (cached) — should return the original cached value
        const secondResult = loadOpencodePlugins(tempDir);

        // Clear cache
        clearOpencodePluginsCache();

        // Third load — should re-read from disk and pick up the modified file
        const thirdResult = loadOpencodePlugins(tempDir);

        // then
        expect(firstResult).toEqual(
          expect.arrayContaining(['@test/plugin-a', '@test/plugin-b']),
        );
        // Cached result is identical to first
        expect(secondResult).toEqual(firstResult);
        // After cache clear, the new file content is picked up
        expect(thirdResult).toEqual(
          expect.arrayContaining(['@test/plugin-c', '@test/plugin-d']),
        );
        // The result changed after cache clear (re-read from disk)
        expect(thirdResult).not.toEqual(firstResult);
      });
    });
  });
});

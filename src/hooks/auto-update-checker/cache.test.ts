import { describe, expect, mock, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_NAME } from '../../config/product';

// Mock logger to avoid noise
mock.module('../../utils/logger', () => ({
  log: mock(() => {}),
}));

mock.module('../../cli/config-manager', () => ({
  stripJsonComments: (s: string) => s,
  getOpenCodeConfigPaths: () => [
    '/mock/config/opencode.json',
    '/mock/config/opencode.jsonc',
  ],
}));

// Import CACHE_DIR after mocking so it picks up the mocked config-manager
const { CACHE_DIR } = await import('./constants');

// Cache buster for dynamic imports
let importCounter = 0;

// Use path.join to build cross-platform paths
const MOCK_BASE = path.join(
  path.sep,
  'home',
  'user',
  '.cache',
  'opencode',
  'packages',
  `${PACKAGE_NAME}@latest`,
);
const MOCK_PKG_JSON = path.join(MOCK_BASE, 'package.json');
const MOCK_NODE_MODULES = path.join(MOCK_BASE, 'node_modules', PACKAGE_NAME);
const MOCK_RUNTIME_PKG = path.join(MOCK_NODE_MODULES, 'package.json');

describe('auto-update-checker/cache', () => {
  describe('resolveInstallContext', () => {
    test('detects OpenCode packages install root from runtime package path', async () => {
      const existsSpy = spyOn(fs, 'existsSync').mockImplementation(
        (p: string) => p === MOCK_PKG_JSON,
      );
      const { resolveInstallContext } = await import(
        `./cache?test=${importCounter++}`
      );

      const context = resolveInstallContext(MOCK_RUNTIME_PKG);

      expect(context).toEqual({
        installDir: MOCK_BASE,
        packageJsonPath: MOCK_PKG_JSON,
      });

      existsSpy.mockRestore();
    });

    test('does not fall back to legacy cache when runtime path is active but wrapper root is invalid', async () => {
      const existsSpy = spyOn(fs, 'existsSync').mockImplementation(() => false);
      const { resolveInstallContext } = await import(
        `./cache?test=${importCounter++}`
      );

      const context = resolveInstallContext(MOCK_RUNTIME_PKG);

      expect(context).toBeNull();

      existsSpy.mockRestore();
    });
  });

  describe('preparePackageUpdate', () => {
    test('returns null when no install context is available', async () => {
      const existsSpy = spyOn(fs, 'existsSync').mockReturnValue(false);
      const { preparePackageUpdate } = await import(
        `./cache?test=${importCounter++}`
      );

      const result = preparePackageUpdate('1.0.1');
      expect(result).toBeNull();

      existsSpy.mockRestore();
    });

    test('updates packages wrapper dependency and removes installed package', async () => {
      const existsSpy = spyOn(fs, 'existsSync').mockImplementation(
        (p: string) => p === MOCK_PKG_JSON || p === MOCK_NODE_MODULES,
      );
      const readSpy = spyOn(fs, 'readFileSync').mockImplementation(
        (p: string) => {
          if (p === MOCK_PKG_JSON) {
            return JSON.stringify({
              dependencies: {
                [PACKAGE_NAME]: '0.9.1',
              },
            });
          }
          return '';
        },
      );
      const writtenData: string[] = [];
      const writeSpy = spyOn(fs, 'writeFileSync').mockImplementation(
        (_path: string, data: string) => {
          writtenData.push(data);
        },
      );
      const rmSyncSpy = spyOn(fs, 'rmSync').mockReturnValue(undefined);
      const { preparePackageUpdate } = await import(
        `./cache?test=${importCounter++}`
      );

      const result = preparePackageUpdate(
        '0.9.11',
        PACKAGE_NAME,
        MOCK_RUNTIME_PKG,
      );

      expect(result).toBe(MOCK_BASE);
      expect(rmSyncSpy).toHaveBeenCalledWith(MOCK_NODE_MODULES, {
        recursive: true,
        force: true,
      });
      expect(writtenData.length).toBeGreaterThan(0);
      expect(JSON.parse(writtenData[0])).toEqual({
        dependencies: {
          [PACKAGE_NAME]: '0.9.11',
        },
      });

      existsSpy.mockRestore();
      readSpy.mockRestore();
      writeSpy.mockRestore();
      rmSyncSpy.mockRestore();
    });

    test('keeps working when dependency is already on target version', async () => {
      // Use actual CACHE_DIR from constants for platform compatibility
      const legacyPkgJson = path.join(CACHE_DIR, 'package.json');
      const legacyNodeModules = path.join(CACHE_DIR, 'node_modules', PACKAGE_NAME);

      const existsSpy = spyOn(fs, 'existsSync').mockImplementation(
        (p: string) => p === legacyPkgJson || p === legacyNodeModules,
      );
      const readSpy = spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          dependencies: {
            [PACKAGE_NAME]: '1.0.1',
          },
        }),
      );
      const writeSpy = spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      const rmSyncSpy = spyOn(fs, 'rmSync').mockReturnValue(undefined);
      const { preparePackageUpdate } = await import(
        `./cache?test=${importCounter++}`
      );

      const result = preparePackageUpdate(
        '1.0.1',
        PACKAGE_NAME,
        null,
      );

      expect(result).toBe(CACHE_DIR);
      expect(writeSpy).not.toHaveBeenCalled();
      expect(rmSyncSpy).toHaveBeenCalled();

      existsSpy.mockRestore();
      readSpy.mockRestore();
      writeSpy.mockRestore();
      rmSyncSpy.mockRestore();
    });
  });
});

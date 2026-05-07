import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureGlobalPluginConfigFile } from './bootstrap';

describe('config bootstrap', () => {
  const originalEnv = { ...process.env };
  let tmpDir: string | null = null;

  afterEach(() => {
    process.env = { ...originalEnv };
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
    tmpDir = null;
  });

  test('creates minimal global plugin config when missing', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'plugin-config-'));
    process.env.XDG_CONFIG_HOME = tmpDir;
    delete process.env.OPENCODE_CONFIG_DIR;

    const configPath = ensureGlobalPluginConfigFile();

    expect(configPath).toBe(join(tmpDir, 'opencode', 'extendai-lab.json'));
    expect(existsSync(configPath)).toBe(true);
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({
      $schema: './extendai-lab.schema.json',
    });
  });

  test('does not overwrite existing json config', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'plugin-config-'));
    process.env.XDG_CONFIG_HOME = tmpDir;
    delete process.env.OPENCODE_CONFIG_DIR;
    const configDir = join(tmpDir, 'opencode');
    const configPath = join(configDir, 'extendai-lab.json');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, '{"preset":"custom"}\n', { flush: true });

    const resultPath = ensureGlobalPluginConfigFile();

    expect(resultPath).toBe(configPath);
    expect(readFileSync(configPath, 'utf8')).toBe('{"preset":"custom"}\n');
  });

  test('prefers existing jsonc config over creating json', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'plugin-config-'));
    process.env.XDG_CONFIG_HOME = tmpDir;
    delete process.env.OPENCODE_CONFIG_DIR;
    const configDir = join(tmpDir, 'opencode');
    const jsoncPath = join(configDir, 'extendai-lab.jsonc');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(jsoncPath, '{ preset: "custom" }\n', { flush: true });

    const resultPath = ensureGlobalPluginConfigFile();

    expect(resultPath).toBe(jsoncPath);
    expect(existsSync(join(configDir, 'extendai-lab.json'))).toBe(false);
  });

  test('prefers existing legacy json config over creating new one', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'plugin-config-'));
    process.env.XDG_CONFIG_HOME = tmpDir;
    delete process.env.OPENCODE_CONFIG_DIR;
    const configDir = join(tmpDir, 'opencode');
    const legacyPath = join(configDir, 'extendai-lab.json');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(legacyPath, '{"preset":"legacy"}\n', { flush: true });

    const resultPath = ensureGlobalPluginConfigFile();

    expect(resultPath).toBe(legacyPath);
  });
});

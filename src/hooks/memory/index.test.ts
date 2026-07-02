import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildMemoryInjection,
  clearFileCache,
  getPreferencesPath,
  getProjectMemoryPath,
  getGlobalMemoryPath,
  getStorageDir,
  PREFS_TEMPLATE,
  PROJECT_MEMORY_TEMPLATE,
} from './index';

const TEST_DIR = '.opencode-test-memory';
const MIMO_TEST_DIR = '.mimocode-test-memory';

beforeEach(() => {
  clearFileCache();
  for (const dir of [TEST_DIR, MIMO_TEST_DIR]) {
    const extendaiDir = join(dir, '.opencode', 'extendai-lab');
    const mimoExtendaiDir = join(dir, '.mimocode', 'extendai-lab');
    if (!existsSync(extendaiDir)) mkdirSync(extendaiDir, { recursive: true });
    if (!existsSync(mimoExtendaiDir))
      mkdirSync(mimoExtendaiDir, { recursive: true });
  }
});

afterEach(() => {
  for (const dir of [TEST_DIR, MIMO_TEST_DIR]) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

describe('getStorageDir', () => {
  test('OpenCode uses .opencode/', () => {
    const dir = getStorageDir('/workspace', false);
    expect(dir).toContain('.opencode');
    expect(dir).toContain('extendai-lab');
  });

  test('MiMo Code uses .mimocode/', () => {
    const dir = getStorageDir('/workspace', true);
    expect(dir).toContain('.mimocode');
    expect(dir).toContain('extendai-lab');
  });
});

describe('getPreferencesPath', () => {
  test('OpenCode path', () => {
    const path = getPreferencesPath('/workspace', false);
    expect(path.endsWith('preferences.md')).toBe(true);
    expect(path.includes('.opencode')).toBe(true);
  });

  test('MiMo Code path', () => {
    const path = getPreferencesPath('/workspace', true);
    expect(path.endsWith('preferences.md')).toBe(true);
    expect(path.includes('.mimocode')).toBe(true);
  });
});

describe('getProjectMemoryPath', () => {
  test('OpenCode path', () => {
    const path = getProjectMemoryPath('/workspace', false);
    expect(path.endsWith('MEMORY.md')).toBe(true);
    expect(path.includes('.opencode')).toBe(true);
  });

  test('MiMo Code path', () => {
    const path = getProjectMemoryPath('/workspace', true);
    expect(path.endsWith('MEMORY.md')).toBe(true);
    expect(path.includes('.mimocode')).toBe(true);
  });
});

describe('getGlobalMemoryPath', () => {
  test('returns path in data dir', () => {
    const path = getGlobalMemoryPath('/data');
    expect(path).toContain('memory');
    expect(path).toContain('global');
    expect(path.endsWith('MEMORY.md')).toBe(true);
  });
});

describe('buildMemoryInjection', () => {
  test('returns empty when no files exist', () => {
    const result = buildMemoryInjection({
      workspaceRoot: '/tmp/nonexistent',
      dataDir: '/tmp/nonexistent-data',
      isMimoCode: false,
    });
    expect(result.sections).toEqual([]);
    expect(result.totalChars).toBe(0);
  });

  test('injects user preferences when file exists with content', () => {
    const prefsPath = getPreferencesPath(TEST_DIR, false);
    writeFileSync(prefsPath, '# Preferences\n## Coding Style\n- Use tabs\n');
    const result = buildMemoryInjection({
      workspaceRoot: TEST_DIR,
      dataDir: '/tmp/nonexistent',
      isMimoCode: false,
    });
    expect(result.sections.length).toBe(1);
    expect(result.sections[0]).toContain('User Preferences');
    expect(result.sections[0]).toContain('Use tabs');
  });

  test('does not inject template-only preferences', () => {
    const prefsPath = getPreferencesPath(TEST_DIR, false);
    writeFileSync(prefsPath, PREFS_TEMPLATE);
    const result = buildMemoryInjection({
      workspaceRoot: TEST_DIR,
      dataDir: '/tmp/nonexistent',
      isMimoCode: false,
    });
    // Template has no bullet points, so should not be injected
    expect(result.sections.length).toBe(0);
  });

  test('injects project memory when file exists', () => {
    const memPath = getProjectMemoryPath(TEST_DIR, false);
    writeFileSync(
      memPath,
      '# Project Memory\n## Rules\n- Use TypeScript\n',
    );
    const result = buildMemoryInjection({
      workspaceRoot: TEST_DIR,
      dataDir: '/tmp/nonexistent',
      isMimoCode: false,
    });
    expect(result.sections.length).toBe(1);
    expect(result.sections[0]).toContain('Project Memory');
    expect(result.sections[0]).toContain('Use TypeScript');
  });

  test('injects multiple sections', () => {
    const prefsPath = getPreferencesPath(TEST_DIR, false);
    const memPath = getProjectMemoryPath(TEST_DIR, false);
    writeFileSync(prefsPath, '# Prefs\n## Style\n- Tabs\n');
    writeFileSync(memPath, '# Memory\n## Rules\n- TS\n');
    const result = buildMemoryInjection({
      workspaceRoot: TEST_DIR,
      dataDir: '/tmp/nonexistent',
      isMimoCode: false,
    });
    expect(result.sections.length).toBe(2);
    expect(result.totalChars).toBeGreaterThan(0);
  });

  test('MiMo Code reads from .mimocode/', () => {
    const prefsPath = getPreferencesPath(MIMO_TEST_DIR, true);
    writeFileSync(prefsPath, '# Prefs\n## Style\n- Spaces\n');
    const result = buildMemoryInjection({
      workspaceRoot: MIMO_TEST_DIR,
      dataDir: '/tmp/nonexistent',
      isMimoCode: true,
    });
    expect(result.sections.length).toBe(1);
    expect(result.sections[0]).toContain('Spaces');
  });

  test('truncates long content', () => {
    const prefsPath = getPreferencesPath(TEST_DIR, false);
    const longContent = '# Prefs\n## Style\n' + '- x'.repeat(5000) + '\n';
    writeFileSync(prefsPath, longContent);
    const result = buildMemoryInjection({
      workspaceRoot: TEST_DIR,
      dataDir: '/tmp/nonexistent',
      isMimoCode: false,
      prefsBudget: 1000,
    });
    expect(result.sections[0]).toContain('[truncated]');
  });
});

describe('templates', () => {
  test('PREFS_TEMPLATE has expected sections', () => {
    expect(PREFS_TEMPLATE).toContain('Coding Style');
    expect(PREFS_TEMPLATE).toContain('Workflow Preferences');
    expect(PREFS_TEMPLATE).toContain('Tool Preferences');
    expect(PREFS_TEMPLATE).toContain('Communication Style');
    expect(PREFS_TEMPLATE).toContain('Lessons Learned');
  });

  test('PROJECT_MEMORY_TEMPLATE has expected sections', () => {
    expect(PROJECT_MEMORY_TEMPLATE).toContain('Project context');
    expect(PROJECT_MEMORY_TEMPLATE).toContain('Rules');
    expect(PROJECT_MEMORY_TEMPLATE).toContain('Architecture decisions');
    expect(PROJECT_MEMORY_TEMPLATE).toContain('Discovered durable knowledge');
  });
});

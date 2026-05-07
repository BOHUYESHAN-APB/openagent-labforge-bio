import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PACKAGE_NAME } from '../config/product';
import { getGlobalLogDir } from '../paths/plugin-paths';
import {
  flushLoggerForTesting,
  getLogDir,
  initLogger,
  log,
  resetLogger,
} from './logger';

describe('logger', () => {
  let tmpDir: string;
  let origLogDir: string | undefined;
  let origDataHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
    origLogDir = process.env.OPENCODE_LOG_DIR;
    origDataHome = process.env.XDG_DATA_HOME;
    process.env.OPENCODE_LOG_DIR = tmpDir;
    resetLogger();
  });

  afterEach(async () => {
    await flushLoggerForTesting();
    if (origLogDir === undefined) {
      delete process.env.OPENCODE_LOG_DIR;
    } else {
      process.env.OPENCODE_LOG_DIR = origLogDir;
    }
    if (origDataHome === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = origDataHome;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('log() silently no-ops before initLogger()', () => {
    log('should not crash');
    expect(fs.readdirSync(tmpDir).length).toBe(0);
  });

  test('initLogger creates per-session log file', () => {
    initLogger('20260416T143052');
    log('test message');

    const files = fs.readdirSync(tmpDir);
    expect(files).toEqual([`${PACKAGE_NAME}.20260416T143052.log`]);
  });

  test('writes log message with timestamp', async () => {
    initLogger('session1');
    log('timestamped message');
    await flushLoggerForTesting();

    const logPath = path.join(tmpDir, `${PACKAGE_NAME}.session1.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    expect(content).toContain('timestamped message');
  });

  test('logs message with data object', async () => {
    initLogger('session1');
    log('message with data', { key: 'value', number: 42 });
    await flushLoggerForTesting();

    const logPath = path.join(tmpDir, `${PACKAGE_NAME}.session1.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content).toContain('"key":"value"');
    expect(content).toContain('"number":42');
  });

  test('logs message without extra JSON when no data', async () => {
    initLogger('session1');
    log('message without data');
    await flushLoggerForTesting();

    const logPath = path.join(tmpDir, `${PACKAGE_NAME}.session1.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content.trim()).toMatch(/message without data\s*$/);
  });

  test('appends multiple log entries', async () => {
    initLogger('session1');
    log('first');
    log('second');
    log('third');
    await flushLoggerForTesting();

    const logPath = path.join(tmpDir, `${PACKAGE_NAME}.session1.log`);
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('first');
    expect(lines[1]).toContain('second');
    expect(lines[2]).toContain('third');
  });

  test('initLogger called twice uses second session file', async () => {
    initLogger('session1');
    log('from session1');
    initLogger('session2');
    log('from session2');
    await flushLoggerForTesting();

    const files = fs.readdirSync(tmpDir).sort();
    expect(files).toEqual([
      `${PACKAGE_NAME}.session1.log`,
      `${PACKAGE_NAME}.session2.log`,
    ]);

    const content1 = fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8');
    const content2 = fs.readFileSync(path.join(tmpDir, files[1]), 'utf-8');
    expect(content1).toContain('from session1');
    expect(content1).not.toContain('from session2');
    expect(content2).toContain('from session2');
  });

  test('cleanup keeps only 10 most recent log files', () => {
    // Create 12 log files with different timestamps
    const now = Date.now();
    for (let i = 0; i < 12; i++) {
      const fileName = `${PACKAGE_NAME}.file${i}.log`;
      const filePath = path.join(tmpDir, fileName);
      fs.writeFileSync(filePath, `log ${i}\n`);
      // Set mtime: older files have older timestamps
      const mtime = now - (12 - i) * 60 * 1000; // 1 minute apart
      fs.utimesSync(filePath, new Date(mtime), new Date(mtime));
    }

    initLogger('current');
    log('init');

    const files = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith(`${PACKAGE_NAME}.`));
    // Should have 10 files + current = 11 total (cleanup keeps 10, then we create 1 more)
    expect(files.length).toBeLessThanOrEqual(11);
    // The oldest files (file0, file1) should be deleted
    expect(files).not.toContain(`${PACKAGE_NAME}.file0.log`);
    expect(files).not.toContain(`${PACKAGE_NAME}.file1.log`);
    // The newest files should be kept
    expect(files).toContain(`${PACKAGE_NAME}.file11.log`);
    expect(files.find((f) => f.includes('current'))).toBeDefined();
  });

  test('cleanup preserves recent files', () => {
    const recentFileName = `${PACKAGE_NAME}.20260415T000000.log`;
    const recentPath = path.join(tmpDir, recentFileName);
    fs.writeFileSync(recentPath, 'recent log\n');

    initLogger('current');

    const files = fs.readdirSync(tmpDir);
    expect(files).toContain(recentFileName);
  });

  test('cleanup with mixed-age files keeps most recent', () => {
    const now = Date.now();

    // Create an old file
    const oldFileName = `${PACKAGE_NAME}.old.log`;
    const oldPath = path.join(tmpDir, oldFileName);
    fs.writeFileSync(oldPath, 'old log\n');
    fs.utimesSync(oldPath, new Date(now - 1000000), new Date(now - 1000000));

    // Create a recent file
    const recentFileName = `${PACKAGE_NAME}.recent.log`;
    const recentPath = path.join(tmpDir, recentFileName);
    fs.writeFileSync(recentPath, 'recent log\n');
    fs.utimesSync(recentPath, new Date(now - 1000), new Date(now - 1000));

    initLogger('current');
    log('init');

    const files = fs.readdirSync(tmpDir);
    // Both should be kept since we have < 10 files total
    expect(files).toContain(oldFileName);
    expect(files).toContain(recentFileName);
    expect(files.find((f) => f.includes('current'))).toBeDefined();
  });

  test('cleanup with no existing files does not crash', () => {
    expect(() => initLogger('fresh')).not.toThrow();
    log('init');
    const files = fs.readdirSync(tmpDir);
    expect(files.find((f) => f.includes('fresh'))).toBeDefined();
  });

  test('handles circular references in data', async () => {
    initLogger('session1');
    const circular: any = { name: 'test' };
    circular.self = circular;

    expect(() => log('circular data', circular)).not.toThrow();
    await flushLoggerForTesting();

    const logPath = path.join(tmpDir, `${PACKAGE_NAME}.session1.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content).toContain('circular data');
    expect(content).toContain('[unserializable]');
  });

  test('getLogDir returns OPENCODE_LOG_DIR when set', () => {
    expect(getLogDir()).toBe(tmpDir);
  });

  test('getLogDir falls back to os.homedir when env not set', () => {
    delete process.env.OPENCODE_LOG_DIR;
    const dataHome = fs.mkdtempSync(
      path.join(os.tmpdir(), 'logger-clean-home-'),
    );
    process.env.XDG_DATA_HOME = dataHome;
    try {
      expect(getLogDir()).toBe(getGlobalLogDir());
    } finally {
      fs.rmSync(dataHome, { recursive: true, force: true });
      if (origLogDir === undefined) {
        delete process.env.OPENCODE_LOG_DIR;
      } else {
        process.env.OPENCODE_LOG_DIR = origLogDir;
      }
      if (origDataHome === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = origDataHome;
      }
    }
  });

  test('handles complex data structures', async () => {
    initLogger('session1');
    log('complex data', {
      nested: { deep: { value: 'test' } },
      array: [1, 2, 3],
      boolean: true,
      null: null,
    });
    await flushLoggerForTesting();

    const logPath = path.join(tmpDir, `${PACKAGE_NAME}.session1.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content).toContain('"nested":');
    expect(content).toContain('"array":[1,2,3]');
    expect(content).toContain('"boolean":true');
  });
});

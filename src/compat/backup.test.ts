import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  applyInstallPlan,
  attachBackupEntries,
  backupFile,
  createBackupManifest,
  getBackupRoot,
  hashFile,
  writeBackupManifest,
} from './backup';
import { addPlanFile, createInstallPlan } from './install-plan';

describe('compat backup helpers', () => {
  test('attaches backup entries and copies existing files', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'compat-backup-'));
    try {
      const sourcePath = join(workspaceRoot, 'target.json');
      writeFileSync(sourcePath, '{"old":true}\n', 'utf8');
      const plan = createInstallPlan({
        runtimeId: 'opencode',
        runtimeDisplayName: 'OpenCode',
      });
      addPlanFile(plan, {
        path: sourcePath,
        relativePath: 'target.json',
        content: '{"new":true}\n',
        action: 'update',
        managed: true,
      });

      const backupRoot = getBackupRoot(
        workspaceRoot,
        'opencode',
        '2026-05-08T00-00-00Z',
      );
      attachBackupEntries(plan, backupRoot);

      expect(plan.backups).toHaveLength(1);
      expect(plan.backups[0].existedBefore).toBe(true);
      expect(plan.backups[0].action).toBe('update');
      expect(plan.backups[0].hash).toBe(hashFile(sourcePath));

      backupFile(plan.backups[0]);
      expect(existsSync(plan.backups[0].backupPath)).toBe(true);
      expect(readFileSync(plan.backups[0].backupPath, 'utf8')).toContain('old');
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('applyInstallPlan writes files and manifest while tracking created files', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'compat-apply-'));
    try {
      const existingPath = join(workspaceRoot, 'config.json');
      const createdPath = join(workspaceRoot, 'nested', 'new.json');
      writeFileSync(existingPath, '{"before":true}\n', 'utf8');

      const plan = createInstallPlan({
        runtimeId: 'openclaude',
        runtimeDisplayName: 'OpenClaude',
        dryRun: false,
      });
      addPlanFile(plan, {
        path: existingPath,
        relativePath: 'config.json',
        content: '{"after":true}\n',
        action: 'update',
        managed: true,
      });
      addPlanFile(plan, {
        path: createdPath,
        relativePath: 'nested/new.json',
        content: '{"created":true}\n',
        action: 'create',
        managed: true,
      });

      const result = applyInstallPlan(plan, {
        workspaceRoot,
        timestamp: '2026-05-08T00-00-00Z',
        packageVersion: '1.0.19',
      });

      expect(result.appliedCount).toBe(2);
      expect(result.skippedCount).toBe(0);
      expect(existsSync(result.manifestPath)).toBe(true);
      expect(readFileSync(existingPath, 'utf8')).toContain('after');
      expect(readFileSync(createdPath, 'utf8')).toContain('created');

      const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8'));
      expect(manifest.packageVersion).toBe('1.0.19');
      expect(manifest.entries).toHaveLength(2);
      expect(manifest.entries[0].action).toBe('update');
      expect(manifest.entries[0].existedBefore).toBe(true);
      expect(manifest.entries[1].action).toBe('create');
      expect(manifest.entries[1].existedBefore).toBe(false);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('writes backup manifest JSON', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'compat-manifest-'));
    try {
      const plan = createInstallPlan({
        runtimeId: 'codex',
        runtimeDisplayName: 'Codex',
      });
      const manifest = createBackupManifest(plan);
      const manifestPath = join(workspaceRoot, 'manifest.json');

      writeBackupManifest(manifestPath, manifest);

      const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
      expect(parsed.runtimeId).toBe('codex');
      expect(parsed.entries).toEqual([]);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('getBackupRoot makes ISO timestamps Windows-safe', () => {
    const backupRoot = getBackupRoot(
      'D:/workspace/example',
      'codex',
      '2026-05-08T15:42:21.724Z',
    );

    expect(backupRoot).toContain('2026-05-08T15-42-21.724Z');
    expect(backupRoot).not.toContain('2026-05-08T15:42:21.724Z');
    expect(backupRoot).toContain('compat');
    expect(backupRoot).toContain('codex');
    expect(backupRoot).toContain('install');
  });

  test('applyInstallPlan creates backup root with default timestamp on Windows-safe path', () => {
    const workspaceRoot = mkdtempSync(
      join(tmpdir(), 'compat-apply-default-ts-'),
    );
    try {
      const targetPath = join(workspaceRoot, 'openclaude', '.claude.json');
      const plan = createInstallPlan({
        runtimeId: 'openclaude',
        runtimeDisplayName: 'OpenClaude',
        dryRun: false,
      });
      addPlanFile(plan, {
        path: targetPath,
        relativePath: '.claude.json',
        content: '{"mcpServers":{}}\n',
        action: 'create',
        managed: true,
      });

      const result = applyInstallPlan(plan, {
        workspaceRoot,
        packageVersion: '1.0.19',
      });

      expect(existsSync(result.backupRoot)).toBe(true);
      expect(basename(result.backupRoot)).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z$/,
      );
      expect(basename(result.backupRoot)).not.toContain(':');
      expect(result.backupRoot).toContain('compat');
      expect(result.backupRoot).toContain('openclaude');
      expect(result.backupRoot).toContain('install');
      expect(existsSync(result.manifestPath)).toBe(true);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});

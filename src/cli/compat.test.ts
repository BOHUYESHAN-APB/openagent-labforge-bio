import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  applyCompatRuntimeInstall,
  applyCompatRuntimeInstalls,
  applyCompatRuntimeRollback,
  buildCompatDoctorReport,
  buildCompatInstallPreview,
  buildCompatRollbackPreview,
  buildCompatStatusReport,
  getCompatRuntimeIds,
} from './compat';

describe('compat CLI reports', () => {
  test('doctor report includes phase-one runtime detection and capability matrix', () => {
    const report = buildCompatDoctorReport(process.cwd());

    expect(report).toContain('ExtendAI Lab Compatibility Doctor');
    expect(report).toContain('Runtime detection:');
    expect(report).toContain('opencode');
    expect(report).toContain('openclaude');
    expect(report).toContain('codex');
    expect(report).toContain('Capability matrix:');
  });

  test('status report includes open-source-first order and ultra-minimal default', async () => {
    const report = await buildCompatStatusReport(process.cwd());

    expect(report).toContain('ExtendAI Lab Compatibility Status');
    expect(report).toContain('Phase-1 runtimes (open-source-first):');
    expect(report).toContain('OpenCode');
    expect(report).toContain('OpenClaude');
    expect(report).toContain('Codex');
    expect(report).toContain(
      'Current product order: OpenCode -> OpenClaude -> Codex -> closed-source Claude later.',
    );
    expect(report).toContain('Current default subagent mode: ultra-minimal.');
    expect(report).toContain('Optional compat SDK providers:');
    expect(report).toContain('Unified storage baseline:');
    expect(report).toContain('Current install/apply completion state:');
  });

  test('status report mentions openclaude as first Claude-family target', async () => {
    const report = await buildCompatStatusReport(process.cwd());

    expect(report).toContain('OpenClaude');
    expect(report).toContain('closed-source Claude later');
  });

  test('compat runtime list includes openclaude without requiring positional target', () => {
    expect(getCompatRuntimeIds()).toContain('openclaude');
    expect(getCompatRuntimeIds()).toContain('codex');
  });

  test('doctor report can be scoped to one runtime', () => {
    const report = buildCompatDoctorReport(process.cwd(), 'openclaude');

    expect(report).toContain('Runtime scope: openclaude');
    expect(report).toContain('openclaude');
    expect(report).not.toContain('codex: available=');
    expect(report).toContain('Degradation guidance:');
    expect(report).toContain('subagents -> main-only/checklists');
  });

  test('status report can be scoped to one runtime', async () => {
    const report = await buildCompatStatusReport(process.cwd(), 'codex');

    expect(report).toContain('Runtime scope: codex');
    expect(report).toContain('Codex');
    expect(report).toContain(
      'codex is part of the current open-source-first phase-1 runtime set.',
    );
    expect(report).toContain('Runtime degradation guidance:');
    expect(report).toContain('Unified storage baseline:');
  });

  test('status report explains current install/apply completion boundary', async () => {
    const report = await buildCompatStatusReport(process.cwd(), [
      'opencode',
      'openclaude',
      'codex',
    ]);

    expect(report).toContain('OpenCode: native-primary');
    expect(report).toContain('OpenClaude:');
    expect(report).toContain('Codex:');
    expect(report).toContain('native-primary');
    expect(report).toContain('partial-baseline');
  });

  test('doctor/status can use an overridden runtime root', async () => {
    const workspaceRoot = mkdtempSync(
      join(tmpdir(), 'compat-cli-runtime-root-'),
    );
    const runtimeRoot = join(workspaceRoot, 'openclaude-home');

    try {
      mkdirSync(runtimeRoot, { recursive: true });
      const doctor = buildCompatDoctorReport(process.cwd(), 'openclaude', {
        runtimeRoot,
      });
      const status = await buildCompatStatusReport(
        process.cwd(),
        'openclaude',
        {
          runtimeRoot,
        },
      );

      expect(doctor).toContain(`paths=${runtimeRoot}`);
      expect(status).toContain(`OpenClaude: available — ${runtimeRoot}`);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('install preview reports dry-run plan for selected runtime', () => {
    const report = buildCompatInstallPreview(process.cwd(), 'openclaude');

    expect(report).toContain('ExtendAI Lab Install Preview: OpenClaude');
    expect(report).toContain('Runtime scope: openclaude');
    expect(report).toContain('Planned files:');
    expect(report).toContain('Plan messages:');
    expect(report).toContain(
      'This path is still dry-run/status-first. Real writes should follow an explicit install-plan/apply step with backup + rollback.',
    );
  });

  test('rollback preview reports manifest-scoped dry-run restore', () => {
    const report = buildCompatRollbackPreview(
      process.cwd(),
      'codex',
      '.opencode/extendai-lab/backups/latest/manifest.json',
    );

    expect(report).toContain('ExtendAI Lab Rollback Preview: Codex');
    expect(report).toContain('Runtime scope: codex');
    expect(report).toContain(
      'Manifest path: .opencode/extendai-lab/backups/latest/manifest.json',
    );
    expect(report).toContain('Rollback messages:');
  });

  test('install apply writes compat runtime files into an overridden runtime root', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'compat-cli-apply-'));
    const runtimeRoot = join(workspaceRoot, 'openclaude-home');

    try {
      const report = applyCompatRuntimeInstall(workspaceRoot, 'openclaude', {
        packageVersion: '1.0.19',
        runtimeRoot,
        timestamp: '2026-05-08T12-00-00Z',
      });

      expect(report).toContain('ExtendAI Lab Install Apply: OpenClaude');
      expect(report).toContain('Applied files:');
      expect(report).toContain('Reload/restart the Claude-family runtime');
      expect(report).toContain('Install state:');
      expect(
        existsSync(join(runtimeRoot, '.claude-plugin', 'plugin.json')),
      ).toBe(true);
      expect(existsSync(join(runtimeRoot, '.claude.json'))).toBe(true);
      expect(existsSync(join(runtimeRoot, 'settings.json'))).toBe(true);
      expect(
        existsSync(join(runtimeRoot, 'plugins', 'known_marketplaces.json')),
      ).toBe(true);
      expect(
        existsSync(join(runtimeRoot, 'plugins', 'installed_plugins.json')),
      ).toBe(true);
      expect(
        readFileSync(join(runtimeRoot, 'settings.json'), 'utf8'),
      ).toContain('enabledPlugins');
      expect(
        readFileSync(
          join(runtimeRoot, 'plugins', 'installed_plugins.json'),
          'utf8',
        ),
      ).toContain('extendai-lab@extendai-lab-local');
      expect(
        readFileSync(
          join(runtimeRoot, 'plugins', 'known_marketplaces.json'),
          'utf8',
        ),
      ).toContain('extendai-lab-local');
      expect(existsSync(join(workspaceRoot, '.opencode', 'extendai-lab'))).toBe(
        true,
      );
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('multi-runtime install apply runs compat installs in open-source-first order', () => {
    const workspaceRoot = mkdtempSync(
      join(tmpdir(), 'compat-cli-multi-apply-'),
    );
    const runtimeRoot = join(workspaceRoot, 'shared-runtime-root');

    try {
      const report = applyCompatRuntimeInstalls(
        workspaceRoot,
        ['codex', 'openclaude'],
        {
          packageVersion: '1.0.19',
          runtimeRoot,
          timestamp: '2026-05-08T13-00-00Z',
        },
      );

      expect(report).toContain('ExtendAI Lab Multi-Runtime Install Apply');
      expect(report).toContain('Runtime scope: openclaude, codex');
      expect(report).toContain('ExtendAI Lab Install Apply: OpenClaude');
      expect(report).toContain('ExtendAI Lab Install Apply: Codex');
      expect(report).toContain('Install state:');
      expect(
        readFileSync(join(runtimeRoot, 'openclaude', 'settings.json'), 'utf8'),
      ).toContain('enabledPlugins');
      expect(
        readFileSync(join(runtimeRoot, 'codex', 'config.toml'), 'utf8'),
      ).toContain('# BEGIN EXTENDAI LAB MANAGED MARKETPLACE REGISTRATION');
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('rollback apply restores files from a manifest', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'compat-cli-rollback-'));
    try {
      const runtimeRoot = join(workspaceRoot, 'codex-home');
      const targetPath = join(runtimeRoot, 'config.toml');
      const backupPath = join(workspaceRoot, 'backup', 'config.toml');
      const manifestPath = join(workspaceRoot, 'manifest.json');

      mkdirSync(dirname(targetPath), { recursive: true });
      mkdirSync(dirname(backupPath), { recursive: true });
      writeFileSync(targetPath, 'after = true\n', 'utf8');
      writeFileSync(backupPath, 'before = true\n', 'utf8');
      writeFileSync(
        manifestPath,
        `${JSON.stringify({
          createdAt: new Date().toISOString(),
          runtimeId: 'codex',
          entries: [
            {
              sourcePath: targetPath,
              relativePath: 'config.toml',
              backupPath,
              existedBefore: true,
              action: 'update',
            },
          ],
        })}\n`,
        'utf8',
      );

      const report = applyCompatRuntimeRollback(
        'codex',
        manifestPath,
        workspaceRoot,
      );

      expect(report).toContain('ExtendAI Lab Rollback Apply: Codex');
      expect(report).toContain('Restored files: 1');
      expect(report).toContain('Install state:');
      expect(readFileSync(targetPath, 'utf8')).toContain('before = true');
      expect(
        existsSync(
          join(
            workspaceRoot,
            '.opencode',
            'extendai-lab',
            'compat',
            'codex',
            'install',
            'latest.json',
          ),
        ),
      ).toBe(true);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('rollback apply refuses manifest from a different runtime', () => {
    const workspaceRoot = mkdtempSync(
      join(tmpdir(), 'compat-cli-rollback-mismatch-'),
    );
    try {
      const manifestPath = join(workspaceRoot, 'manifest.json');
      writeFileSync(
        manifestPath,
        `${JSON.stringify({
          createdAt: new Date().toISOString(),
          runtimeId: 'codex',
          entries: [],
        })}\n`,
        'utf8',
      );

      const report = applyCompatRuntimeRollback(
        'openclaude',
        manifestPath,
        workspaceRoot,
      );

      expect(report).toContain(
        'Runtime mismatch: manifest was created for codex',
      );
      expect(report).toContain(
        'Refusing rollback to avoid restoring the wrong runtime',
      );
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});

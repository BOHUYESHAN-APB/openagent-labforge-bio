import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  claudeAdapter,
  codexAdapter,
  openclaudeAdapter,
  opencodeAdapter,
} from '.';

// OpenClaude/Codex compatibility features are on hold indefinitely.
// Only opencode adapter test remains active.
describe.skip('runtime adapter skeletons', () => {
  test('opencode adapter produces dry-run install plan', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'compat-opencode-'));
    try {
      const plan = opencodeAdapter.planInstall({ workspaceRoot, dryRun: true });
      expect(plan.runtimeId).toBe('opencode');
      expect(plan.dryRun).toBe(true);
      expect(plan.capabilities).toContain('document-output');
      expect(plan.messages[0]?.message).toContain('native installer');
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('openclaude, claude, and codex adapters remain dry-run skeletons', () => {
    const openclaudePlan = openclaudeAdapter.planInstall({
      workspaceRoot: process.cwd(),
      dryRun: true,
    });
    const claudePlan = claudeAdapter.planInstall({
      workspaceRoot: process.cwd(),
      dryRun: true,
    });
    const codexPlan = codexAdapter.planInstall({
      workspaceRoot: process.cwd(),
      dryRun: true,
    });

    expect(openclaudePlan.runtimeId).toBe('openclaude');
    expect(claudePlan.runtimeId).toBe('claude-code');
    expect(codexPlan.runtimeId).toBe('codex');
    expect(openclaudePlan.messages[0]?.message).toContain(
      'compatibility asset',
    );
    expect(claudePlan.messages[0]?.message).toContain('compatibility asset');
    expect(codexPlan.messages[0]?.message).toContain('compatibility asset');
    expect(openclaudePlan.files.map((file) => file.relativePath)).toEqual(
      expect.arrayContaining([
        '.claude-plugin/plugin.json',
        '.claude-plugin/marketplace.json',
        '.claude.json',
        'settings.json',
        'plugins/known_marketplaces.json',
        'plugins/installed_plugins.json',
        'skills/extendai-lab-foundation/SKILL.md',
        'agents/extendai-lab-orchestrator.md',
        'commands/extendai-lab-baseline.md',
        '.mcp.json',
      ]),
    );
    expect(claudePlan.files.map((file) => file.relativePath)).toEqual(
      expect.arrayContaining([
        '.claude-plugin/plugin.json',
        '.claude-plugin/marketplace.json',
        '.claude.json',
        'skills/extendai-lab-foundation/SKILL.md',
        'agents/extendai-lab-orchestrator.md',
        'commands/extendai-lab-baseline.md',
        '.mcp.json',
      ]),
    );
    expect(codexPlan.files.map((file) => file.relativePath)).toEqual(
      expect.arrayContaining([
        'plugins/cache/extendai-lab-local/extendai-lab/local/.codex-plugin/plugin.json',
        'plugins/cache/extendai-lab-local/extendai-lab/local/.app.json',
        '.agents/plugins/marketplace.json',
        'config.toml',
        'plugins/cache/extendai-lab-local/extendai-lab/local/skills/extendai-lab-foundation/SKILL.md',
        'plugins/cache/extendai-lab-local/extendai-lab/local/agents/extendai-lab-orchestrator.md',
        'plugins/cache/extendai-lab-local/extendai-lab/local/commands/extendai-lab-baseline.md',
        'plugins/cache/extendai-lab-local/extendai-lab/local/.mcp.json',
      ]),
    );

    expect(
      openclaudePlan.files.find((file) => file.relativePath === '.claude.json')
        ?.content,
    ).toContain('shared-context-server');
    expect(
      openclaudePlan.files.find((file) => file.relativePath === '.claude.json')
        ?.path,
    ).toContain('.claude.json');
    expect(
      claudePlan.files.find((file) => file.relativePath === '.claude.json')
        ?.content,
    ).toContain('shared-context-server');
    expect(
      codexPlan.files.find((file) => file.relativePath === 'config.toml')
        ?.content,
    ).toContain('# BEGIN EXTENDAI LAB MANAGED MCP REGISTRY');
    expect(
      codexPlan.files.find((file) => file.relativePath === 'config.toml')
        ?.content,
    ).toContain('# BEGIN EXTENDAI LAB MANAGED MARKETPLACE REGISTRATION');
    expect(
      codexPlan.files.find((file) => file.relativePath === 'config.toml')
        ?.content,
    ).toContain('# BEGIN EXTENDAI LAB MANAGED PLUGIN ACTIVATION');
    expect(
      openclaudePlan.files.find((file) => file.relativePath === 'settings.json')
        ?.content,
    ).toContain('enabledPlugins');
    expect(
      openclaudePlan.files.find((file) => file.relativePath === 'settings.json')
        ?.content,
    ).toContain('"extendai-lab@extendai-lab-local": true');
    expect(
      openclaudePlan.files.find(
        (file) => file.relativePath === 'plugins/installed_plugins.json',
      )?.content,
    ).toContain('extendai-lab@extendai-lab-local');
    expect(
      openclaudePlan.files.find(
        (file) => file.relativePath === 'plugins/known_marketplaces.json',
      )?.content,
    ).toContain('extendai-lab-local');
    expect(
      openclaudePlan.files.find(
        (file) => file.relativePath === 'plugins/known_marketplaces.json',
      )?.content,
    ).toContain('"source": "directory"');
    expect(
      codexPlan.files.find((file) => file.relativePath === 'config.toml')
        ?.content,
    ).toContain('[marketplaces.extendai-lab-local]');
    expect(
      codexPlan.files.find((file) => file.relativePath === 'config.toml')
        ?.content,
    ).toContain('source_type = "local"');
    expect(
      codexPlan.files.find((file) => file.relativePath === 'config.toml')
        ?.content,
    ).toContain('[plugins."extendai-lab@extendai-lab-local"]');
    expect(
      codexPlan.files.find(
        (file) => file.relativePath === '.agents/plugins/marketplace.json',
      )?.content,
    ).toContain('"installation": "AVAILABLE"');
  });

  test('openclaude and codex validate semantic activation bridge content', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'compat-validate-'));
    try {
      const openclaudeRoot = join(workspaceRoot, 'openclaude-home');
      const codexRoot = join(workspaceRoot, 'codex-home');

      for (const file of openclaudeAdapter.render({
        workspaceRoot,
        dryRun: false,
        runtimeRoot: openclaudeRoot,
      })) {
        mkdirSync(dirname(file.path), { recursive: true });
        writeFileSync(file.path, file.content, 'utf8');
      }

      for (const file of codexAdapter.render({
        workspaceRoot,
        dryRun: false,
        runtimeRoot: codexRoot,
      })) {
        mkdirSync(dirname(file.path), { recursive: true });
        writeFileSync(file.path, file.content, 'utf8');
      }

      const openclaudeValidation = openclaudeAdapter.validate({
        workspaceRoot,
        dryRun: false,
        runtimeRoot: openclaudeRoot,
      });
      const codexValidation = codexAdapter.validate({
        workspaceRoot,
        dryRun: false,
        runtimeRoot: codexRoot,
      });

      expect(openclaudeValidation.ok).toBe(true);
      expect(openclaudeValidation.findings).toContain(
        'OpenClaude activation bridge is semantically consistent (plugin manifest, enabledPlugins, installed plugins, marketplaces, and MCP config).',
      );
      expect(codexValidation.ok).toBe(true);
      expect(codexValidation.findings).toContain(
        'Codex activation bridge is semantically consistent (plugin manifest, marketplace registration, marketplace index, and MCP config).',
      );
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});

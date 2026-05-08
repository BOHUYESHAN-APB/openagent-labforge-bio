import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  claudeAdapter,
  codexAdapter,
  openclaudeAdapter,
  opencodeAdapter,
} from '.';

describe('runtime adapter skeletons', () => {
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
        '.claude.json',
        'skills/extendai-lab-foundation/SKILL.md',
        'agents/extendai-lab-orchestrator.md',
        'commands/extendai-lab-baseline.md',
        '.mcp.json',
      ]),
    );
    expect(codexPlan.files.map((file) => file.relativePath)).toEqual(
      expect.arrayContaining([
        '.codex-plugin/plugin.json',
        '.app.json',
        '.agents/plugins/marketplace.json',
        'config.toml',
        'skills/extendai-lab-foundation/SKILL.md',
        'agents/extendai-lab-orchestrator.md',
        'commands/extendai-lab-baseline.md',
        '.mcp.json',
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
      openclaudePlan.files.find((file) => file.relativePath === 'settings.json')
        ?.content,
    ).toContain('enabledPlugins');
    expect(
      openclaudePlan.files.find(
        (file) => file.relativePath === 'plugins/installed_plugins.json',
      )?.content,
    ).toContain('extendai-lab@extendai-lab-local');
  });
});

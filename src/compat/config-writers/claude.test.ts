import { describe, expect, test } from 'bun:test';
import {
  mergeClaudeEnabledPlugins,
  mergeClaudeInstalledPlugins,
  mergeClaudeKnownMarketplaces,
  mergeClaudeMcpServers,
} from './claude';

describe('mergeClaudeMcpServers', () => {
  test('adds managed servers into empty config', () => {
    const result = mergeClaudeMcpServers(undefined, {
      sharedContext: {
        command: 'npx',
        args: ['shared-context-server'],
        enabled: true,
      },
    });

    expect(result.changed).toBe(true);
    expect(result.added).toEqual(['sharedContext']);
    expect(result.updated).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.warnings).toEqual([]);

    const parsed = JSON.parse(result.content);
    expect(parsed.mcpServers.sharedContext.command).toBe('npx');
    expect(parsed.mcpServers.sharedContext.args).toEqual([
      'shared-context-server',
    ]);
  });

  test('updates, preserves unmanaged, and removes absent managed servers', () => {
    const existing = JSON.stringify(
      {
        theme: 'dark',
        mcpServers: {
          keepMe: { url: 'http://localhost:1234' },
          alpha: { command: 'old-alpha' },
          beta: { command: 'old-beta' },
        },
      },
      null,
      2,
    );

    const result = mergeClaudeMcpServers(
      existing,
      {
        alpha: { command: 'new-alpha' },
        gamma: { url: 'http://localhost:9999', type: 'http' },
      },
      ['alpha', 'beta'],
    );

    expect(result.changed).toBe(true);
    expect(result.added).toContain('gamma');
    expect(result.updated).toContain('alpha');
    expect(result.removed).toContain('beta');

    const parsed = JSON.parse(result.content);
    expect(parsed.theme).toBe('dark');
    expect(parsed.mcpServers.keepMe).toEqual({
      url: 'http://localhost:1234',
    });
    expect(parsed.mcpServers.alpha).toEqual({ command: 'new-alpha' });
    expect(parsed.mcpServers.gamma).toEqual({
      url: 'http://localhost:9999',
      type: 'http',
    });
    expect(parsed.mcpServers.beta).toBeUndefined();
  });

  test('returns warning and keeps content unchanged on invalid json', () => {
    const existing = '{ invalid json';
    const result = mergeClaudeMcpServers(existing, {
      sharedContext: { command: 'npx' },
    });

    expect(result.changed).toBe(false);
    expect(result.content).toBe(existing);
    expect(result.warnings[0]).toContain('Failed to parse Claude config JSON');
  });
});

describe('Claude activation bridge writers', () => {
  test('adds plugin id to enabledPlugins without removing existing entries', () => {
    const existing = JSON.stringify(
      {
        theme: 'dark',
        enabledPlugins: ['existing-plugin@local'],
      },
      null,
      2,
    );

    const result = mergeClaudeEnabledPlugins(existing, [
      'extendai-lab@extendai-lab-local',
    ]);

    expect(result.changed).toBe(true);
    expect(result.added).toEqual(['extendai-lab@extendai-lab-local']);
    const parsed = JSON.parse(result.content);
    expect(parsed.enabledPlugins).toEqual([
      'existing-plugin@local',
      'extendai-lab@extendai-lab-local',
    ]);
    expect(parsed.theme).toBe('dark');
  });

  test('writes installed_plugins v2 entry for extendai-lab', () => {
    const result = mergeClaudeInstalledPlugins(
      undefined,
      'extendai-lab@extendai-lab-local',
      'C:/plugins/extendai-lab',
    );

    expect(result.changed).toBe(true);
    const parsed = JSON.parse(result.content);
    expect(parsed.version).toBe(2);
    expect(
      parsed.plugins['extendai-lab@extendai-lab-local'][0].installPath,
    ).toBe('C:/plugins/extendai-lab');
  });

  test('writes known marketplace entry for local plugin activation', () => {
    const result = mergeClaudeKnownMarketplaces(
      undefined,
      'extendai-lab-local',
      'C:/plugins/extendai-lab',
    );

    expect(result.changed).toBe(true);
    const parsed = JSON.parse(result.content);
    expect(parsed['extendai-lab-local'].installLocation).toBe(
      'C:/plugins/extendai-lab',
    );
    expect(parsed['extendai-lab-local'].source.type).toBe('local');
  });
});

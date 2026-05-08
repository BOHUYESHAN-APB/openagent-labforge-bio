export interface ClaudeMcpServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type?: string;
  timeout?: number;
  enabled?: boolean;
  approval_mode?: string;
}

export interface ClaudeMcpMergeResult {
  content: string;
  changed: boolean;
  added: string[];
  updated: string[];
  removed: string[];
  warnings: string[];
}

export interface ClaudeEnabledPluginsMergeResult {
  content: string;
  changed: boolean;
  added: string[];
  warnings: string[];
}

export interface ClaudeInstalledPluginsMergeResult {
  content: string;
  changed: boolean;
  pluginKey: string;
  warnings: string[];
}

export interface ClaudeKnownMarketplaceMergeResult {
  content: string;
  changed: boolean;
  marketplaceName: string;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseJsonObject(
  existingContent: string | undefined,
  errorPrefix: string,
): {
  parsed: Record<string, unknown>;
  baseContent: string;
  warnings: string[];
  parseFailed: boolean;
} {
  const warnings: string[] = [];
  const baseContent = existingContent ?? '';
  const trimmed = baseContent.trim();
  let parsed: Record<string, unknown> = {};

  if (trimmed.length > 0) {
    try {
      const raw = JSON.parse(baseContent) as unknown;
      if (isRecord(raw)) {
        parsed = { ...raw };
      } else {
        warnings.push(`${errorPrefix} must contain a JSON object.`);
      }
    } catch (error) {
      warnings.push(`${errorPrefix}: ${String(error)}`);
      return { parsed: {}, baseContent, warnings, parseFailed: true };
    }
  }

  return { parsed, baseContent, warnings, parseFailed: false };
}

export function mergeClaudeMcpServers(
  existingContent: string | undefined,
  nextServers: Record<string, ClaudeMcpServerEntry>,
  managedNames: string[] = [],
): ClaudeMcpMergeResult {
  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];
  const { parsed, baseContent, warnings, parseFailed } = parseJsonObject(
    existingContent,
    'Failed to parse Claude config JSON',
  );

  if (parseFailed) {
    return {
      content: baseContent,
      changed: false,
      added,
      updated,
      removed,
      warnings,
    };
  }

  const existingMcpServers = isRecord(parsed.mcpServers)
    ? { ...(parsed.mcpServers as Record<string, unknown>) }
    : {};

  const managed = new Set(managedNames);
  for (const name of Object.keys(nextServers)) {
    managed.add(name);
  }

  const nextMcpServers: Record<string, unknown> = {
    ...existingMcpServers,
  };

  for (const name of managed) {
    if (Object.hasOwn(nextServers, name)) {
      const nextValue = nextServers[name];
      if (Object.hasOwn(existingMcpServers, name)) {
        if (!deepEqual(existingMcpServers[name], nextValue)) {
          updated.push(name);
        }
      } else {
        added.push(name);
      }
      nextMcpServers[name] = nextValue;
    } else if (Object.hasOwn(nextMcpServers, name)) {
      delete nextMcpServers[name];
      removed.push(name);
    }
  }

  if (Object.keys(nextMcpServers).length > 0) {
    parsed.mcpServers = nextMcpServers;
  } else {
    delete parsed.mcpServers;
  }

  const nextContent = `${JSON.stringify(parsed, null, 2)}\n`;
  return {
    content: nextContent,
    changed: nextContent !== baseContent,
    added,
    updated,
    removed,
    warnings,
  };
}

export function mergeClaudeEnabledPlugins(
  existingContent: string | undefined,
  pluginIds: string[],
): ClaudeEnabledPluginsMergeResult {
  const { parsed, baseContent, warnings, parseFailed } = parseJsonObject(
    existingContent,
    'Failed to parse Claude settings JSON',
  );
  if (parseFailed) {
    return { content: baseContent, changed: false, added: [], warnings };
  }

  const existing = Array.isArray(parsed.enabledPlugins)
    ? parsed.enabledPlugins.filter(
        (value): value is string => typeof value === 'string',
      )
    : [];
  const next = [...existing];
  const added: string[] = [];
  for (const pluginId of pluginIds) {
    if (!next.includes(pluginId)) {
      next.push(pluginId);
      added.push(pluginId);
    }
  }
  parsed.enabledPlugins = next;
  const nextContent = `${JSON.stringify(parsed, null, 2)}\n`;
  return {
    content: nextContent,
    changed: nextContent !== baseContent,
    added,
    warnings,
  };
}

export function mergeClaudeInstalledPlugins(
  existingContent: string | undefined,
  pluginKey: string,
  installPath: string,
): ClaudeInstalledPluginsMergeResult {
  const { parsed, baseContent, warnings, parseFailed } = parseJsonObject(
    existingContent,
    'Failed to parse Claude installed_plugins JSON',
  );
  if (parseFailed) {
    return { content: baseContent, changed: false, pluginKey, warnings };
  }

  const plugins = isRecord(parsed.plugins)
    ? { ...(parsed.plugins as Record<string, unknown>) }
    : {};
  const currentEntries = Array.isArray(plugins[pluginKey])
    ? (plugins[pluginKey] as unknown[])
    : [];
  const baseEntry = isRecord(currentEntries[0])
    ? { ...(currentEntries[0] as Record<string, unknown>) }
    : {};
  const nextEntry = {
    scope: 'user',
    installPath,
    installedAt:
      typeof baseEntry.installedAt === 'string'
        ? baseEntry.installedAt
        : new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
  plugins[pluginKey] = [nextEntry];
  parsed.version = 2;
  parsed.plugins = plugins;
  const nextContent = `${JSON.stringify(parsed, null, 2)}\n`;
  return {
    content: nextContent,
    changed: nextContent !== baseContent,
    pluginKey,
    warnings,
  };
}

export function mergeClaudeKnownMarketplaces(
  existingContent: string | undefined,
  marketplaceName: string,
  installLocation: string,
): ClaudeKnownMarketplaceMergeResult {
  const { parsed, baseContent, warnings, parseFailed } = parseJsonObject(
    existingContent,
    'Failed to parse Claude known_marketplaces JSON',
  );
  if (parseFailed) {
    return {
      content: baseContent,
      changed: false,
      marketplaceName,
      warnings,
    };
  }

  parsed[marketplaceName] = {
    source: {
      type: 'local',
      path: installLocation,
    },
    installLocation,
    lastUpdated: new Date().toISOString(),
  };

  const nextContent = `${JSON.stringify(parsed, null, 2)}\n`;
  return {
    content: nextContent,
    changed: nextContent !== baseContent,
    marketplaceName,
    warnings,
  };
}

export interface UnifiedMcpRegistryEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type?: string;
  timeout?: number;
}

const MANAGED_START = '# BEGIN EXTENDAI LAB MANAGED MCP REGISTRY';
const MANAGED_END = '# END EXTENDAI LAB MANAGED MCP REGISTRY';
const MARKETPLACE_MANAGED_START =
  '# BEGIN EXTENDAI LAB MANAGED MARKETPLACE REGISTRATION';
const MARKETPLACE_MANAGED_END =
  '# END EXTENDAI LAB MANAGED MARKETPLACE REGISTRATION';
const CODEX_MCP_SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const CODEX_MARKETPLACE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function renderTomlString(value: string): string {
  return `"${escapeTomlString(value)}"`;
}

function renderTomlStringArray(values: string[]): string {
  return `[${values.map(renderTomlString).join(', ')}]`;
}

function renderTomlEnvTable(env: Record<string, string>): string {
  const entries = Object.entries(env)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key} = ${renderTomlString(value)}`);
  return `{ ${entries.join(', ')} }`;
}

function renderCodexServerBlock(
  name: string,
  entry: UnifiedMcpRegistryEntry,
): string {
  const lines = [`[mcp_servers.${name}]`];

  if (entry.command) {
    lines.push(`command = ${renderTomlString(entry.command)}`);
  }
  if (entry.args && entry.args.length > 0) {
    lines.push(`args = ${renderTomlStringArray(entry.args)}`);
  }
  if (entry.url) {
    lines.push(`url = ${renderTomlString(entry.url)}`);
  }
  if (entry.type) {
    lines.push(`type = ${renderTomlString(entry.type)}`);
  }
  if (entry.env && Object.keys(entry.env).length > 0) {
    lines.push(`env = ${renderTomlEnvTable(entry.env)}`);
  }
  if (entry.timeout) {
    lines.push(`startup_timeout_sec = ${entry.timeout}`);
  }

  return lines.join('\n');
}

function stripManagedBlock(content: string): string {
  const pattern = new RegExp(
    `${MANAGED_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${MANAGED_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\n?`,
    'g',
  );
  return content.replace(pattern, '').trimEnd();
}

function parseCodexMcpServerNames(content: string): Set<string> {
  const names = new Set<string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^\[mcp_servers\.([^\]]+)\]$/);
    if (match) {
      const name = match[1].trim();
      if (name && CODEX_MCP_SERVER_NAME_PATTERN.test(name)) {
        names.add(name);
      }
    }
  }
  return names;
}

type NamedRegistryEntry = UnifiedMcpRegistryEntry & { name: string };

function renderManagedBlock(registry: NamedRegistryEntry[]): string {
  if (registry.length === 0) return '';
  const blocks = registry.map((entry) =>
    renderCodexServerBlock(entry.name, entry),
  );
  return [
    MANAGED_START,
    '',
    ...blocks.flatMap((block, index) => (index === 0 ? [block] : ['', block])),
    '',
    MANAGED_END,
  ].join('\n');
}

export interface CodexTomlMergeResult {
  content: string;
  changed: boolean;
  added: string[];
  skipped: string[];
}

export interface CodexMarketplaceMergeResult {
  content: string;
  changed: boolean;
  registered: string[];
  skipped: string[];
}

export function mergeCodexMcpServers(
  existingContent: string,
  registry: Record<string, UnifiedMcpRegistryEntry>,
): CodexTomlMergeResult {
  const base = stripManagedBlock(existingContent);
  const existingNames = parseCodexMcpServerNames(base);
  const added: string[] = [];
  const skipped: string[] = [];

  const managedEntries = Object.entries(registry)
    .filter(([name]) => CODEX_MCP_SERVER_NAME_PATTERN.test(name))
    .filter(([name]) => {
      if (existingNames.has(name)) {
        skipped.push(name);
        return false;
      }
      added.push(name);
      return true;
    })
    .map(([name, entry]) => ({ ...entry, name }));

  const managedBlock = renderManagedBlock(managedEntries);
  const nextContent = managedBlock
    ? `${base ? `${base}\n\n` : ''}${managedBlock}\n`
    : base
      ? `${base}\n`
      : '';

  return {
    content: nextContent,
    changed: nextContent !== existingContent,
    added,
    skipped,
  };
}

function renderMarketplaceBlock(name: string, source: string): string {
  return [
    `[marketplaces.${name}]`,
    'source_type = "local"',
    `source = ${renderTomlString(source)}`,
  ].join('\n');
}

function stripManagedMarketplaceBlock(content: string): string {
  const pattern = new RegExp(
    `${MARKETPLACE_MANAGED_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${MARKETPLACE_MANAGED_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\n?`,
    'g',
  );
  return content.replace(pattern, '').trimEnd();
}

function parseCodexMarketplaceNames(content: string): Set<string> {
  const names = new Set<string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^\[marketplaces\.([^\]]+)\]$/);
    if (match) {
      const name = match[1].trim();
      if (name && CODEX_MARKETPLACE_NAME_PATTERN.test(name)) {
        names.add(name);
      }
    }
  }
  return names;
}

export function mergeCodexMarketplaceRegistration(
  existingContent: string,
  marketplaceName: string,
  sourcePath: string,
): CodexMarketplaceMergeResult {
  const base = stripManagedMarketplaceBlock(existingContent);
  const existingNames = parseCodexMarketplaceNames(base);

  if (!CODEX_MARKETPLACE_NAME_PATTERN.test(marketplaceName)) {
    return {
      content: existingContent,
      changed: false,
      registered: [],
      skipped: [marketplaceName],
    };
  }

  if (existingNames.has(marketplaceName)) {
    const nextContent = base ? `${base}\n` : '';
    return {
      content: nextContent,
      changed: nextContent !== existingContent,
      registered: [],
      skipped: [marketplaceName],
    };
  }

  const block = [
    MARKETPLACE_MANAGED_START,
    '',
    renderMarketplaceBlock(marketplaceName, sourcePath),
    '',
    MARKETPLACE_MANAGED_END,
  ].join('\n');

  const nextContent = `${base ? `${base}\n\n` : ''}${block}\n`;
  return {
    content: nextContent,
    changed: nextContent !== existingContent,
    registered: [marketplaceName],
    skipped: [],
  };
}

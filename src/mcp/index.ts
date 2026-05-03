import type { McpName, WebsearchConfig } from '../config';
import { normalizeLocalMcpCommand } from '../utils/mcp-command-normalizer';
import { bioNext, uniprot } from './bioinformatics';
import { context7 } from './context7';
import {
  arxiv_mcp,
  browser_puppeteer,
  chrome_devtools_mcp,
  deepwiki_mcp,
  open_websearch_mcp,
  paper_search_mcp,
  semantic_scholar_fastmcp,
} from './extended';
import { grep_app } from './grep-app';
import type { McpConfig } from './types';
import { createWebsearchConfig, websearch } from './websearch';

export type {
  LocalMcpConfig,
  McpConfig,
  RemoteMcpConfig,
} from './types';

const allBuiltinMcps: Record<McpName, McpConfig> = {
  websearch,
  context7,
  grep_app,
  arxiv_mcp,
  browser_puppeteer,
  chrome_devtools_mcp,
  deepwiki_mcp,
  open_websearch_mcp,
  paper_search_mcp,
  semantic_scholar_fastmcp,
  bioNext,
  uniprot,
};

/**
 * Creates MCP configurations, excluding disabled ones.
 * Normalizes local commands for Windows (cmd /c wrapping).
 */
export function createBuiltinMcps(
  disabledMcps: readonly string[] = [],
  websearchConfig?: WebsearchConfig,
): Record<string, McpConfig> {
  const disabledSet = new Set(disabledMcps);
  const mcps: Record<string, McpConfig> = {};

  for (const [name, builtin] of Object.entries(allBuiltinMcps)) {
    if (disabledSet.has(name)) continue;

    const normalized =
      builtin.type === 'local'
        ? {
            ...builtin,
            command: normalizeLocalMcpCommand(builtin.command),
          }
        : builtin;

    mcps[name] = normalized;
  }

  // Override websearch with user-configured provider (default: Exa)
  if (!disabledSet.has('websearch')) {
    mcps.websearch = createWebsearchConfig(websearchConfig);
  }

  return mcps;
}

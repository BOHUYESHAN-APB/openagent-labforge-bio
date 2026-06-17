import type { PluginInput, ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';

const z = tool.schema;

/** MCPs that CANNOT be disabled (core infrastructure) */
const NEVER_DISABLE = new Set([
  'websearch',
  'context7',
  'grep_app',
  'extendaiLab',
]);

/** MCPs that CANNOT be enabled by AI (too dangerous) */
const NEVER_ENABLE = new Set([
  'cua_driver', // Desktop automation — user must enable manually
]);

/** Paper search MCPs — only enable ONE at a time */
const PAPER_MCPS = [
  'semantic_scholar_fastmcp',
  'arxiv_mcp',
  'paper_search_mcp',
];

/** Primary orchestrator agents that can use this tool */
const PRIMARY_AGENTS = new Set([
  'orchestrator',
  'engineer',
  'deep-worker',
  'bio-orchestrator',
  'chem-orchestrator',
  'prometheus',
  'atlas',
]);

/** Retry configuration for MCP connect/disconnect */
// TODO(#1): Remove retry after upstream fixes Windows MCP process cleanup
// Upstream: anomalyco/opencode#26336, anomalyco/opencode#29939
const MCP_RETRY_MAX = 3;
const MCP_RETRY_BASE_DELAY_MS = 2000;

/**
 * Retry an async operation with exponential backoff.
 * Handles multi-window race conditions where MCP server startup
 * may fail due to npx/uvx cache locks or process cleanup delays.
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  maxRetries = MCP_RETRY_MAX,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        const delay = MCP_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError ?? new Error(`${label} failed after ${maxRetries} attempts`);
}

/**
 * Creates a tool that allows the AI to enable/disable MCP servers
 * for the current session only (does not modify global config).
 * Only available to primary orchestrator agents.
 *
 * Includes retry logic with exponential backoff to handle multi-window
 * race conditions (npx/uvx cache locks, Windows process cleanup delays).
 */
export function createMcpToggleTool(
  client: PluginInput['client'],
): ToolDefinition {
  return tool({
    description: `Enable or disable an MCP server for the current session only. Does NOT modify global config — other sessions are unaffected. ONLY for primary orchestrator agents.

RULES:
- NEVER disable: websearch, context7, grep_app, extendaiLab (core infra)
- NEVER enable: cua_driver (desktop automation — user must enable manually)
- Browser: prefer chrome_devtools_mcp first; browser_puppeteer as fallback
- Paper search: enable ONLY ONE at a time (semantic_scholar_fastmcp recommended)

Available MCPs (enable when user needs these capabilities):

Browser automation (for web testing, screenshots, scraping):
- chrome_devtools_mcp — Chrome DevTools protocol. Control Chrome browser. Best for most use cases.
- browser_puppeteer — Playwright browser. Alternative if chrome_devtools_mcp unavailable.

Academic paper search (for finding papers, citations, references):
- semantic_scholar_fastmcp — Semantic Scholar API. Search papers, get citations, find references. RECOMMENDED.
- arxiv_mcp — arXiv API. Search and download arXiv preprints.
- paper_search_mcp — General paper search across multiple sources.

Bioinformatics (for protein/genomics data):
- bioNext — Multi-omics data analysis platform.
- uniprot — UniProt protein database. Query protein sequences, functions, structures.

Web search (alternative to built-in websearch):
- open_websearch_mcp — Open web search via DuckDuckGo/Bing/Exa/Brave/Baidu.

Knowledge base:
- deepwiki_mcp — DeepWiki. Query GitHub repository documentation and wikis.

NEVER enable:
- cua_driver — Desktop automation via CUA. SECURITY RISK. User must enable manually.

NOTE: If enable fails with timeout, retry automatically (multi-window race condition).`,
    args: {
      action: z
        .enum(['enable', 'disable'])
        .describe('Enable or disable the MCP server'),
      name: z.string().describe('MCP server name'),
    },
    async execute(args, toolContext) {
      if (
        !toolContext ||
        typeof toolContext !== 'object' ||
        !('sessionID' in toolContext)
      ) {
        return 'Error: No session ID available';
      }

      // Restrict to primary orchestrator agents
      const agent = (toolContext as { agent?: string }).agent;
      if (agent && !PRIMARY_AGENTS.has(agent)) {
        return `Error: mcp_toggle is only available to primary orchestrator agents. Current agent: ${agent}`;
      }

      const { action, name } = args as { action: string; name: string };

      // Safety checks
      if (action === 'disable' && NEVER_DISABLE.has(name)) {
        return `Error: MCP "${name}" is a core infrastructure server and cannot be disabled.`;
      }
      if (action === 'enable' && NEVER_ENABLE.has(name)) {
        return `Error: MCP "${name}" requires explicit user enable for security. Ask the user to enable it manually.`;
      }
      try {
        if (action === 'enable') {
          // Retry with backoff — handles multi-window race conditions
          // where npx/uvx cache locks or Windows process cleanup delays
          // cause first-attempt failures
          await withRetry(
            () => (client.mcp as any).connect({ path: { name } }),
            `enable MCP "${name}"`,
          );
          const warning = PAPER_MCPS.includes(name)
            ? `\nNote: Only enable ONE paper search MCP at a time.`
            : '';
          return `MCP server "${name}" enabled for this session.${warning}`;
        }
        // SDK v1 path format: { path: { name } }
        await (client.mcp as any).disconnect({ path: { name } });
        return `MCP server "${name}" disabled for this session.`;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const retryInfo =
          action === 'enable'
            ? ` after ${MCP_RETRY_MAX} attempts`
            : '';
        return `Failed to ${action} MCP "${name}"${retryInfo}: ${msg}`;
      }
    },
  });
}

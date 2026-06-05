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
  'prometheus',
  'atlas',
]);

/**
 * Creates a tool that allows the AI to enable/disable MCP servers
 * for the current session only (does not modify global config).
 * Only available to primary orchestrator agents.
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

Available MCPs:
- chrome_devtools_mcp — Chrome DevTools browser (disabled by default)
- browser_puppeteer — Playwright browser (disabled by default)
- semantic_scholar_fastmcp — Semantic Scholar paper search (disabled by default)
- arxiv_mcp — arXiv paper search (disabled by default)
- paper_search_mcp — Paper search (disabled by default)
- bioNext — Multi-omics data (disabled by default)
- uniprot — Protein data (disabled by default)
- deepwiki_mcp — DeepWiki (disabled by default)
- open_websearch_mcp — Open web search (disabled by default)`,
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
          // SDK v1 path format: { path: { name } }
          await (client.mcp as any).connect({ path: { name } });
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
        return `Failed to ${action} MCP "${name}": ${msg}`;
      }
    },
  });
}

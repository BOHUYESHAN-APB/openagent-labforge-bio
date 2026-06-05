import type { PluginInput, ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';

const z = tool.schema;

/**
 * Creates a tool that allows the AI to enable/disable MCP servers
 * for the current session only (does not modify global config).
 */
export function createMcpToggleTool(
  client: PluginInput['client'],
): ToolDefinition {
  return tool({
    description: `Enable or disable an MCP server for the current session only. Does NOT modify global config — other sessions are unaffected.

Common MCP servers:
- browser_puppeteer — Playwright browser automation (disabled by default)
- chrome_devtools_mcp — Chrome DevTools protocol (disabled by default)
- bioNext — Multi-omics data (disabled by default)
- uniprot — Protein data (disabled by default)

Use when: you need a browser tool but agent-browser is not sufficient, or need a specific MCP tool that is currently disabled.`,
    args: {
      action: z
        .enum(['enable', 'disable'])
        .describe('Enable or disable the MCP server'),
      name: z
        .string()
        .describe(
          'MCP server name (e.g. "browser_puppeteer", "chrome_devtools_mcp")',
        ),
    },
    async execute(args, toolContext) {
      if (
        !toolContext ||
        typeof toolContext !== 'object' ||
        !('sessionID' in toolContext)
      ) {
        return 'Error: No session ID available';
      }

      const { action, name } = args as { action: string; name: string };

      try {
        if (action === 'enable') {
          // SDK v1 path format: { path: { name } }
          await (client.mcp as any).connect({ // eslint-disable-line @typescript-eslint/no-explicit-any
            path: { name },
          });
          return `MCP server "${name}" enabled for this session. Tools from this MCP are now available.`;
        }
        // SDK v1 path format: { path: { name } }
        await (client.mcp as any).disconnect({ // eslint-disable-line @typescript-eslint/no-explicit-any
          path: { name },
        });
        return `MCP server "${name}" disabled for this session.`;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Failed to ${action} MCP "${name}": ${msg}`;
      }
    },
  });
}

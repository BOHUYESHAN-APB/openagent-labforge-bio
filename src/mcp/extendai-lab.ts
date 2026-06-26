import type { McpConfig } from './types';

/**
 * extendai-lab built-in MCP server.
 *
 * Runs as a local process: `bun run extendai-server`.
 * Provides document/design tools and a web dashboard on localhost:25569.
 *
 * Tools:
 *   - extendai_list_skills        List available document/design skills
 *   - extendai_read_plan          Read saved plans
 *   - extendai_dashboard_status   Workspace status & port
 *   - extendai_dashboard_status   Dashboard status
 */
export const extendaiLab: McpConfig = {
  type: 'local',
  command: ['bun', 'run', 'extendai-server'],
  enabled: true,
};

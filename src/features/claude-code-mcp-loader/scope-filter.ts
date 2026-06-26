/**
 * Compatibility stub for claude-code-mcp-loader scope filter.
 * Returns true for all MCP servers (no scope filtering).
 */
export function shouldLoadMcpServer(_config: unknown, _cwd: string): boolean {
  return true;
}

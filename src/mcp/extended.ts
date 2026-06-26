import type { McpConfig } from './types';

// Increased from 90s to 120s to handle multi-window race conditions
// where npx/uvx cache locks or Windows process cleanup delays cause timeouts
const LOCAL_MCP_STARTUP_TIMEOUT_MS = 120_000;

export const arxiv_mcp: McpConfig = {
  type: 'local',
  command: ['uvx', 'arxiv-mcp-server'],
  enabled: false,
  timeout: LOCAL_MCP_STARTUP_TIMEOUT_MS,
};

export const browser_puppeteer: McpConfig = {
  type: 'local',
  command: ['npx', '-y', '@modelcontextprotocol/server-puppeteer'],
  enabled: false,
  timeout: LOCAL_MCP_STARTUP_TIMEOUT_MS,
};

export const chrome_devtools_mcp: McpConfig = {
  type: 'local',
  command: ['npx', '-y', 'chrome-devtools-mcp@latest'],
  enabled: false,
  timeout: LOCAL_MCP_STARTUP_TIMEOUT_MS,
};

export const fetch_browser: McpConfig = {
  type: 'local',
  command: ['npx', '-y', '@TheSethRose/Fetch-Browser'],
  enabled: false,
  timeout: LOCAL_MCP_STARTUP_TIMEOUT_MS,
};

export const deepwiki_mcp: McpConfig = {
  type: 'remote',
  url: 'https://mcp.deepwiki.com/mcp',
  enabled: false,
  oauth: false,
};

export const open_websearch_mcp: McpConfig = {
  type: 'local',
  command: ['npx', '-y', 'open-websearch@2.0.0'],
  enabled: false,
  environment: {
    MODE: 'stdio',
    DEFAULT_SEARCH_ENGINE: 'duckduckgo',
    ALLOWED_SEARCH_ENGINES: 'duckduckgo,bing,exa,brave,baidu,csdn,juejin',
    SEARCH_MODE: 'request',
  },
  timeout: LOCAL_MCP_STARTUP_TIMEOUT_MS,
};

export const paper_search_mcp: McpConfig = {
  type: 'local',
  command: [
    'uvx',
    '--native-tls',
    '--from',
    'paper-search-mcp',
    'python',
    '-m',
    'paper_search_mcp.server',
  ],
  enabled: false,
  timeout: LOCAL_MCP_STARTUP_TIMEOUT_MS,
};

export const semantic_scholar_fastmcp: McpConfig = {
  type: 'local',
  command: [
    'uvx',
    '--native-tls',
    '--from',
    'semantic-scholar-fastmcp<3.0',
    'semantic-scholar-fastmcp',
  ],
  // Disabled by default because uvx-backed FastMCP startup can exceed the
  // OpenCode SDK initialize request timeout on warm restarts. Users can opt in
  // explicitly once their local uv/Python environment is prepared.
  enabled: false,
  environment: {
    SEMANTIC_SCHOLAR_ENABLE_HTTP_BRIDGE: '0',
    UV_NO_PROGRESS: '1',
  },
  timeout: LOCAL_MCP_STARTUP_TIMEOUT_MS,
};

// CUA Driver: Desktop automation via CUA (Computer Use Agent)
// MIT License - https://github.com/trycua/cua
// Supports macOS, Windows, Linux (background operation)
// Install: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)"
// Or Windows: irm https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.ps1 | iex
export const cua_driver: McpConfig = {
  type: 'local',
  command: ['cua-driver', 'mcp'],
  enabled: false, // Disabled by default, enable via config
  timeout: LOCAL_MCP_STARTUP_TIMEOUT_MS,
};

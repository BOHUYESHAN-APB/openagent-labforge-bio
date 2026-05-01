// MCP types - McpName is defined in config/schema.ts to avoid duplication

export type RemoteMcpConfig = {
  type: 'remote';
  url: string;
  enabled: boolean;
  headers?: Record<string, string>;
  oauth?: false;
};

export type LocalMcpConfig = {
  type: 'local';
  command: string[];
  enabled: boolean;
  environment?: Record<string, string>;
  timeout?: number;
};

export type McpConfig = RemoteMcpConfig | LocalMcpConfig;

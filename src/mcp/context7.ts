import type { RemoteMcpConfig } from './types';

/**
 * Context7 - official documentation lookup for libraries
 * @see https://context7.com
 */
export const context7: RemoteMcpConfig = {
  type: 'remote',
  url: 'https://mcp.context7.com/mcp',
  enabled: true,
  headers: process.env.CONTEXT7_API_KEY
    ? { Authorization: `Bearer ${process.env.CONTEXT7_API_KEY}` }
    : undefined,
  oauth: false,
};

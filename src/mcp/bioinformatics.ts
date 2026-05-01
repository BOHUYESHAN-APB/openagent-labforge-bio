// Bioinformatics MCP Servers (integrated)
// License: All third-party MCPs retain their original licenses.
// See THIRD_PARTY_NOTICES.md for verified license details.
//
// Verified licenses (2025-05-02):
//   - BioNext-mcp: MIT (Cherine0205/BioNext-mcp)
//   - UniProt MCP: MIT (TakumiY235/uniprot-mcp-server)
//
// Non-commercial MCPs are NOT integrated here — see README for user-installable recommendations.

import type { McpConfig } from './types.js';

const BIO_MCP_TIMEOUT_MS = 90_000;

// --- BioNext-mcp: Intelligent Bioinformatics Analysis Assistant ---
// Natural language → Python scripts for scRNA-seq, genomics, proteomics
// GitHub: https://github.com/Cherine0205/BioNext-mcp
// License: MIT
export const bioNext: McpConfig = {
  type: 'local',
  command: ['node'],
  enabled: false,
  timeout: BIO_MCP_TIMEOUT_MS,
  environment: {},
};

// --- UniProt MCP Server: Protein function and sequence data ---
// Access UniProt protein info (name, function, sequence, organism)
// GitHub: https://github.com/TakumiY235/uniprot-mcp-server
// License: MIT
export const uniprot: McpConfig = {
  type: 'local',
  command: ['uv', '--directory', '', 'run', 'uniprot-mcp-server'],
  enabled: false,
  timeout: BIO_MCP_TIMEOUT_MS,
};

# Third-Party Notices

This document tracks the provenance and licenses of third-party MCP servers
integrated by openagent-labforge.

> Unless noted otherwise, entries describe upstream projects that are invoked
> by configuration or runtime integration and are **not relicensed** by this
> repository.

## Section 1: MCP License Policy

**Preferred licenses:** MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC

**Conditional review:** MPL-2.0, LGPL (depends on distribution model)

**Not bundled:** GPL/AGPL — requires explicit legal review before integration

## Section 2: Third-Party MCP Register

### Core MCPs

| Component | Upstream | License (verified) | Notes |
|-----------|----------|-------------------|-------|
| websearch | [mcp.exa.ai](https://mcp.exa.ai) | Proprietary (Exa) | API key required |
| context7 | [context7.com](https://mcp.context7.com) | Proprietary | Optional API key |
| grep_app | [mcp.grep.app](https://mcp.grep.app) | Proprietary | No auth required |

### Extended MCPs

| Component | Upstream | License (verified) | Command |
|-----------|----------|-------------------|---------|
| arxiv_mcp | [arxiv-mcp-server](https://github.com/) | Apache-2.0 | `uvx arxiv-mcp-server` |
| browser_puppeteer | [@modelcontextprotocol/server-puppeteer](https://github.com/modelcontextprotocol/servers) | MIT | `npx -y @modelcontextprotocol/server-puppeteer` |
| chrome_devtools_mcp | [chrome-devtools-mcp](https://github.com/) | MIT | `npx -y chrome-devtools-mcp@latest` |
| deepwiki_mcp | [mcp.deepwiki.com](https://mcp.deepwiki.com) | Proprietary | Remote MCP |
| open_websearch_mcp | [open-websearch](https://github.com/) | Apache-2.0 | `npx -y open-websearch@2.0.0` |
| paper_search_mcp | [paper-search-mcp](https://github.com/) | MIT | `uvx --from paper-search-mcp ...` |
| semantic_scholar_fastmcp | [semantic-scholar-fastmcp](https://github.com/) | MIT | `uvx --from semantic-scholar-fastmcp<3.0 ...` |

### Bioinformatics MCPs (Project-installable templates)

| Component | Upstream | License (verified) | Command | Notes |
|-----------|----------|-------------------|---------|-------|
| bioNext | [Cherine0205/BioNext-mcp](https://github.com/Cherine0205/BioNext-mcp) | MIT | project-local clone/build required | General bioinformatics workflow engine |
| uniprot | [TakumiY235/uniprot-mcp-server](https://github.com/TakumiY235/uniprot-mcp-server) | MIT | project-local clone/build required | Protein sequence/function data |

### Bioinformatics MCPs (Recommended, User-Installable)

These MCPs are NOT integrated due to licensing or dependency requirements. Users can add them manually.

**MIT / Apache-2.0 Licensed:**

| Component | Upstream | License | Stars | Install |
|-----------|----------|---------|-------|---------|
| PubMed MCP Server | [cyanheads/pubmed-mcp-server](https://github.com/cyanheads/pubmed-mcp-server) | Apache-2.0 | 89 | `npx pubmed-mcp-server` |
| ChatSpatial | [cafferychen777/ChatSpatial](https://github.com/cafferychen777/ChatSpatial) | MIT | 33 | `pip install chatspatial` |
| BioThings MCP | [longevity-genie/biothings-mcp](https://github.com/longevity-genie/biothings-mcp) | MIT | 31 | See repo |
| gget MCP | [longevity-genie/gget-mcp](https://github.com/longevity-genie/gget-mcp) | MIT | 27 | See repo |
| OpenTargets MCP | [nickzren/opentargets-mcp](https://github.com/nickzren/opentargets-mcp) | MIT | 16 | See repo |
| Precision Medicine MCP | [lynnlangit/precision-medicine-mcp](https://github.com/lynnlangit/precision-medicine-mcp) | Apache-2.0 | 13 | See repo |
| PubChem MCP Server | [cyanheads/pubchem-mcp-server](https://github.com/cyanheads/pubchem-mcp-server) | Apache-2.0 | 8 | `npx pubchem-mcp-server` |
| Ensembl MCP Server | [effieklimi/ensembl-mcp-server](https://github.com/effieklimi/ensembl-mcp-server) | MIT | 6 | See repo |
| PDBe MCP Servers | [PDBeurope/PDBe-MCP-Servers](https://github.com/PDBeurope/PDBe-MCP-Servers) | Apache-2.0 | 5 | See repo |

**Non-Commercial Licensed (Personal Use Only):**

| Component | Upstream | License | Stars | Notes |
|-----------|----------|---------|-------|-------|
| AlphaFold MCP | [Augmented-Nature/AlphaFold-MCP-Server](https://github.com/Augmented-Nature/AlphaFold-MCP-Server) | Non-Commercial | 34 | Protein structure predictions |
| PDB MCP | [Augmented-Nature/PDB-MCP-Server](https://github.com/Augmented-Nature/PDB-MCP-Server) | Non-Commercial | 24 | Protein Data Bank |
| Gene Ontology MCP | [Augmented-Nature/GeneOntology-MCP-Server](https://github.com/Augmented-Nature/GeneOntology-MCP-Server) | Non-Commercial | 8 | GO data |
| STRING DB MCP | [Augmented-Nature/STRING-db-MCP-Server](https://github.com/Augmented-Nature/STRING-db-MCP-Server) | Non-Commercial | 4 | Protein interactions |

## Section 3: Intake and Verification Rule

Before enabling any MCP in default profiles:
1. Verify license is MIT, Apache-2.0, BSD, or ISC
2. Confirm upstream repository is actively maintained
3. Check for hardcoded secrets or network requirements
4. Add record to this notice matrix
5. If license cannot be verified, keep status as `defer`

## Section 4: Usage Notes

- All MCPs are `enabled: false` by default except: websearch, context7, grep_app, semantic_scholar_fastmcp
- Project-installable Bio MCPs (bioNext, uniprot) require clone/build under `.opencode/openagent-labforge/mcp/servers/` before use
- Windows users need `uv` installed (`pip install uv`) for Python-based MCPs
- Windows local MCP commands: npm-family shims are wrapped with `cmd /c`; `uv`/`uvx` run directly
- `semantic_scholar_fastmcp` uses `SEMANTIC_SCHOLAR_ENABLE_HTTP_BRIDGE=0` env var (not `--no-http` flag, which is invalid)
- Augmented-Nature servers (PDB, AlphaFold, GeneOntology, STRING) have non-commercial licenses — NOT integrated
- PubMed MCP (NCBI) and Semantic Scholar (Allen AI) serve different databases — no conflict, can coexist

---

*Last updated: 2025-05-02*

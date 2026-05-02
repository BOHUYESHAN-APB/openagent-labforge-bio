# Storage and MCP layout

openagent-labforge uses three storage scopes. Keep these scopes separate.

## 1. Package resources (read-only)

Bundled assets live under the installed plugin package root:

```text
<package-root>/resources/
└── bioSkills/
```

Use this scope for static resources shipped by npm. Do not write runtime state
here. In local development, `<package-root>` is the local plugin checkout. In an
npm/OpenCode install, `<package-root>` is the package manager/OpenCode plugin
install location.

## 2. Project state (repository-scoped)

Project-specific state lives under the active repository/workspace:

```text
<repo>/.opencode/openagent-labforge/
├── checkpoints/
├── memory/
│   ├── repository.json
│   ├── workspace.json
│   └── sessions/
├── mcp/
│   ├── servers/
│   ├── cache/
│   ├── env/
│   └── state.json
├── handoff/
├── plans/
└── logs/
```

Use this scope for checkpoint state, repository memory, project-installed MCPs,
and project-specific plans/handoffs. This directory is safe to `.gitignore`.

## 3. Global user state (cross-repository)

Global state lives under OpenCode's user config area:

```text
Windows: %APPDATA%/opencode/openagent-labforge/
Linux:   ${XDG_CONFIG_HOME:-~/.config}/opencode/openagent-labforge/
macOS:   ${XDG_CONFIG_HOME:-~/.config}/opencode/openagent-labforge/
```

Use this scope for cross-repo memory indexes, user preferences, global MCP
registry/cache metadata, and model/profile preferences.

## MCP installation classes

### Remote MCPs

Remote MCPs are URL-only and do not install into the project:

- websearch
- context7
- grep_app
- deepwiki_mcp

### Lightweight local MCPs

These run via `npx`/`uvx` and use package-manager caches. They should not be
vendored into every repository:

- semantic_scholar_fastmcp
- arxiv_mcp
- paper_search_mcp
- open_websearch_mcp
- browser_puppeteer
- chrome_devtools_mcp

Windows command rules:

- `npx`, `npm`, `bunx`, `pnpm`, `yarn` run through `cmd /c`
- `uv`, `uvx`, `node`, `python` run directly

Linux/macOS command rules:

- run commands directly, without `cmd /c`

### Project-installed MCPs

Large or source-based MCPs should be installed into the repository state tree:

```text
<repo>/.opencode/openagent-labforge/mcp/servers/<server-name>/
```

Examples:

- BioNext-mcp
- uniprot-mcp-server

These require explicit install steps (`git clone`, `npm install`, `npm run
build`, `uv sync`, etc.) before being enabled. Do not ship placeholder commands
that OpenCode will try to start directly.

## Checkpoint and memory direction

The checkpoint API currently has in-memory stores. Durable storage should map
to the project/global scopes above:

- session memory -> `<repo>/.opencode/openagent-labforge/memory/sessions/`
- repository memory -> `<repo>/.opencode/openagent-labforge/memory/repository.json`
- workspace memory -> `<repo>/.opencode/openagent-labforge/memory/workspace.json`
- cross-repo index -> global `memory/repositories.json`
- user preferences -> global `memory/user-preferences.json`

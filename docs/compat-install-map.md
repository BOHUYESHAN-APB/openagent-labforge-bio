# Compatibility Install Map

This document tracks the **real writable config targets** for the three
open-source-first runtime families ExtendAI Lab is currently prioritizing:

1. OpenCode
2. OpenClaude / open-source Claude-family surface
3. Codex

Closed-source Claude remains later in the same Claude-family renderer.

## Purpose

The goal is to keep install/apply work explicit and reversible:

- know which file owns which setting
- know which file format is being merged (`json`, `toml`, `markdown`)
- know whether a file is a plugin asset or a host config file
- know whether writes should be marker-based, key-based, or full-file generated

This avoids the common failure mode where a compatibility installer pretends all
hosts can be treated like the same plugin runtime.

## OpenCode

OpenCode is the native runtime, so ExtendAI Lab already owns a larger surface.

| Target | Format | Ownership | Write Strategy |
|---|---|---|---|
| `~/.config/opencode/config.json` or project config | JSON | Host config | structured merge |
| `~/.config/opencode/extendai-lab.json` / lite config | JSON | ExtendAI Lab-owned config | overwrite from generated config |
| `~/.config/opencode/extendai-lab.schema.json` | JSON schema | ExtendAI Lab-owned artifact | overwrite from generated schema |
| `.opencode/extendai-lab/plans/*.md` | Markdown | ExtendAI Lab-owned state | host-owned save service |
| `.opencode/extendai-lab/compat/<runtime>/install/backups/**` | JSON + files | ExtendAI Lab-owned compat state | manifest + managed backup copies |
| `.opencode/extendai-lab/compat/<runtime>/install/latest.json` | JSON | ExtendAI Lab-owned compat state | overwrite latest install/apply/rollback status |

## OpenClaude / Claude-family

Derived from local references:

- `Future\oh-my-claudecode`
- `Future\claudecode-main`
- `Future\openclaude`

| Target | Format | Ownership | Write Strategy |
|---|---|---|---|
| `.claude-plugin/plugin.json` | JSON | plugin asset | generated file |
| `.mcp.json` | JSON | plugin asset | generated file |
| `settings.json` | JSON | host config | narrow key merge only |
| `.claude.json` | JSON | canonical Claude-family MCP config | managed `mcpServers` merge |
| `CLAUDE.md` | Markdown | host/project instruction file | marker-based merge |
| `skills/**` | Markdown/files | plugin/runtime asset | generated files |
| `agents/**` | Markdown/files | plugin/runtime asset | generated files |
| `commands/**` | Markdown/files | plugin/runtime asset | generated files |
| `hooks/**` and plugin `hooks/hooks.json` | JSON + scripts | runtime/plugin support files | later, managed hook install |

### Current ExtendAI Lab writer foundation

- `src/compat/config-writers/claude.ts`
- `mergeClaudeMcpServers(...)`

This writer is intentionally narrow right now: it merges managed Claude-family
`mcpServers` entries while preserving unmanaged JSON content.

## Codex

Derived from local references:

- `Future\codex`
- `Future\oh-my-codex`

| Target | Format | Ownership | Write Strategy |
|---|---|---|---|
| `.codex-plugin/plugin.json` | JSON | plugin asset | generated file |
| `.mcp.json` | JSON | plugin asset | generated file |
| `.app.json` | JSON | plugin asset | generated file |
| `.agents/plugins/marketplace.json` | JSON | discovery/marketplace index | managed JSON merge or generated local index |
| `config.toml` | TOML | host config | managed block merge |
| `hooks.json` | JSON | host config | managed JSON merge |
| `skills/**` | Markdown/files | plugin/runtime asset | generated files |
| `agents/**` | Markdown/files | plugin/runtime asset | generated files |
| `AGENTS.md` | Markdown | project/user instruction file | marker-based merge |

### Current ExtendAI Lab writer foundation

- `src/compat/config-writers/codex.ts`
- `mergeCodexMcpServers(...)`

This writer currently focuses on one safe sub-surface: managed MCP registry
blocks in `config.toml`. It preserves unmanaged TOML and replaces only the
`# BEGIN EXTENDAI LAB MANAGED MCP REGISTRY ... # END ...` block.

## Reference implementation boundaries

High-priority local references to keep nearby while implementing real apply
paths:

- `Future\oh-my-claudecode`
- `Future\claudecode-main`
- `Future\codex`
- `Future\oh-my-codex`
- `Future\oh-my-openagent`
- `Future\oh-my-opencode-slim`
- `Future\openclaude`

Rules:

- use them as **surface maps and install-shape references**
- do not copy license-restricted implementations
- prefer marker-based or key-based merges over blind overwrite
- prefer `doctor -> install-plan preview -> apply -> validate -> rollback`

## Unified storage baseline

When users operate multiple runtimes together, ExtendAI Lab should keep its own
project/global state as unified as possible instead of scattering logs, memory,
and install metadata across unrelated host trees.

Project-owned baseline:

- `.opencode/extendai-lab/compat/<runtime>/logs`
- `.opencode/extendai-lab/compat/<runtime>/cache`
- `.opencode/extendai-lab/compat/<runtime>/memory`
- `.opencode/extendai-lab/compat/<runtime>/install`
- `.opencode/extendai-lab/compat/<runtime>/install/backups/<timestamp>/manifest.json`
- `.opencode/extendai-lab/compat/<runtime>/install/latest.json`

Global baseline:

- `<global data dir>/compat/<runtime>/logs`
- `<global data dir>/compat/<runtime>/memory`

Host config roots such as `~/.claude`, `~/.codex`, and OpenCode config dirs still
exist for plugin registration and activation, but ExtendAI Lab's own durable
logs, memory, and install state should converge on the plugin-owned compat
baseline.

## Current runtime completion boundary

- **OpenCode**: most complete native install/runtime path.
- **OpenClaude**: real install/apply + rollback baseline exists, but broader host
  activation closure still needs more work.
- **Codex**: real install/apply + rollback baseline exists, but broader host
  activation closure still needs more work.
- **Claude Code (closed-source)**: preview-only by design for now.

## Current implementation status

Implemented foundation:

- runtime-scoped CLI previews for `install`, `doctor`, `status`, `rollback`
- adapter/renderers for OpenCode, OpenClaude, Codex, Claude-family later target
- Claude-family JSON MCP merge writer
- Codex TOML managed MCP registry writer
- OpenClaude activation bridge via `settings.json.enabledPlugins`, `plugins/installed_plugins.json`, and `plugins/known_marketplaces.json`
- Codex activation bridge via managed marketplace registration block in `config.toml`
- real apply path for `install --runtime=openclaude|codex`
- manifest-backed real restore path for `rollback --runtime=<id> --manifest=...`
- isolated runtime-root testing via `--runtime-root=<path>`
- post-apply validation now checks required plugin/config assets and emits reload/restart guidance for OpenClaude/Codex
- runtime-specific backup roots and `latest.json` install-state records under `.opencode/extendai-lab/compat/<runtime>/install/`

Still pending for full install/apply closure:

- validation that the written config is accepted by each host runtime
- broader host-specific validation beyond file-write success (current checks now cover presence of activation bridge files/blocks, but not host process acceptance yet)
- closed-source Claude real apply path (still preview-only by design)

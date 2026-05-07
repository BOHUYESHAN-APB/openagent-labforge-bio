# Tools & Capabilities

Built-in tools available to agents beyond the standard file and shell operations.

## apply_patch rescue

Slim only intercepts `apply_patch` before the native tool runs. It rewrites recoverable stale patches, canonizes safe tolerant matches against the real file when unicode/trim drift is the only mismatch, keeps the authored `new_lines` bytes intact, preserves the existing file EOL/final-newline state for updates, validates malformed patches strictly before helper execution, uses a conservative bounded LCS fallback, accumulates helper state when the same path appears in multiple `Update File` hunks, blocks `apply_patch` before native execution if any patch path falls outside the allowed root/worktree, and fails on ambiguity instead of guessing. It does not rewrite `edit` or `write` inputs.

---

## Web Fetch

Fetch remote pages with content extraction tuned for docs/static sites.

| Tool | Description |
|------|-------------|
| `webfetch` | Fetch a URL, optionally prefer `llms.txt`, extract main content from HTML, include metadata, and optionally save binary responses |

`webfetch` blocks cross-origin redirects unless the requested URL or derived permission patterns explicitly allow them, and it can fall back to the raw fetched content when secondary-model summarization is unavailable.

---

## Code Search Tools

Fast, structural code search and refactoring — more powerful than plain text grep.

| Tool | Description |
|------|-------------|
| `grep` | Fast content search using ripgrep |
| `ast_grep_search` | AST-aware code pattern matching across 25 languages |
| `ast_grep_replace` | AST-aware code refactoring with dry-run support |

`ast_grep` understands code structure, so it can find patterns like "all arrow functions that return a JSX element" rather than relying on exact text matching.

---

## Formatters

OpenCode automatically formats files after they are written or edited, using language-specific formatters. No manual step needed.

Includes Prettier, Biome, `gofmt`, `rustfmt`, `ruff`, and 20+ others.

> See the [official OpenCode docs](https://opencode.ai/docs/formatters/#built-in) for the complete list.

---

## Diagnostics Strategy

Diagnostics policy should follow this order:

1. use LSP diagnostics when a reliable LSP path exists;
2. otherwise use the language's own diagnostics/check tools;
3. then layer tests/build/runtime verification on top as needed.

This matters especially for ecosystems where OpenCode LSP coverage is incomplete
or uneven, such as some R/statistics-heavy workflows.

See:

- [Engineering Modules: diagnostics strategy](engineering-modules/diagnostics-strategy.md)

---

## Context Pressure Strategy

ExtendAI Lab uses the **actual context limit reported by OpenCode for the current
provider/model/session**. It does not guess limits from model family names.

Pressure levels are ratio-based:

- engineering default: `L1=0.50`, `L2=0.65`, `L3=0.80`
- bio default: `L1=0.55`, `L2=0.70`, `L3=0.85`

These ratios are applied to the real `limit.context` value OpenCode exposes for
the active model. This matters because the same model family may have different
effective context limits across providers or account types.

Current behavior:

- L1: keep outputs concise and avoid unnecessary recap
- L2: prefer checkpoint/light-compression behavior before starting a large new phase
- L3: force checkpoint/compress-first continuation and prepare restart-ready
  summary/handoff behavior if no compression plugin is active

Configuration lives under `compression.profiles.engineering` and
`compression.profiles.bio` in `extendai-lab.jsonc`.

---

## Memory Commands

ExtendAI Lab supports a small manual memory command layer for explicit
development preferences and workflow habits:

- `/ol-memory-write kind=<workflow|preference|tooling> scope=<workspace|repository> content="..."`
- `/ol-memory-list [workspace|repository|all]`
- `/ol-memory-delete id=<pref_...> [scope=<workspace|repository|all>]`

Rules:

- Only store concrete engineering habits and process rules: test/build/deploy
  order, tooling preferences, review expectations, preferred operational flow.
- Do **not** store emotional or personality judgments about the user.
- `repository` scope is for repo-wide habits; `workspace` scope is for the
  current local workspace.
- Automatic preference capture is stricter than manual capture: only a small
  allowlisted set of workflow/tooling patterns should be auto-written, and any
  emotional, personality-based, or speculative phrasing must be rejected.
- Current safe trigger for auto capture is approved batch-summary text when it
  cleanly matches an allowlisted pattern. Reject/blocked review outcomes must
  not write preferences automatically.

---

## Todo Continuation

Auto-continue has its own guide now:

- [Todo Continuation](todo-continuation.md) — controls, safety gates, behavior, and config

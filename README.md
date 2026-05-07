# ExtendAI Lab

> Bioinformatics + Engineering dual-track AI agent orchestration plugin for [OpenCode](https://github.com/anomalyco/opencode)

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![OpenCode](https://img.shields.io/badge/OpenCode-plugin-green.svg)](https://opencode.ai/docs/plugins)

English | [中文](#中文)

---

## Overview

ExtendAI Lab is a lightweight agent orchestration system that currently
ships as a full OpenCode plugin. It extends OpenCode with **18 specialized
agents** (6 primary + 12 subagents), a three-tier prompt system, optional
bioinformatics capabilities, and a checkpoint-based memory architecture.

Current default agent remains `engineer`. `bio-analyst` is available as the
biological-science expert, but it is not used as the default agent unless you
configure it explicitly. If you only want one visible expert to appear more
prominently in UI ordering, use `preferredVisibleAgent` instead of changing
`default_agent`.

> Repository naming note: the current GitHub repository is still named
> `openagent-labforge-bio` for historical release continuity. The product and
> package name are `extendai-lab`; bio is the first discipline pack, not
> the product boundary. See
> [`docs/architecture/repository-rename.md`](docs/architecture/repository-rename.md).

**Key differentiators from base OpenCode:**

- 5 primary agents with distinct roles (engineer, deep-worker, planner, executor, bio-analyst)
- Three-tier prompt system: Heavy / Light / Turbo, switchable at runtime
- Optional biological-science discipline foundation: dedicated bio expert, chem overlap module, 439 domain skills, 2 integrated bio MCPs
- Checkpoint mechanism: light (same-session) + heavy (cross-session) recovery
- 14 slash commands for workflow control
- All runtime prompts injected via system channel — user messages remain pure

---

## Installation

### Recommended: Local Build

Clone and build from source. This gives you full control and is the approach used in production.

```bash
git clone git@github.com:BOHUYESHAN-APB/openagent-labforge-bio.git
cd openagent-labforge-bio
bun install
bun run build
```

Then register the plugin in your OpenCode config:

**Windows** (`%APPDATA%\opencode\opencode.json`):
```jsonc
{
  "plugin": ["file:///D:/path/to/openagent-labforge-bio"]
}
```

**macOS / Linux** (`~/.config/opencode/opencode.json`):
```jsonc
{
  "plugin": ["file:///home/user/openagent-labforge-bio"]
}
```

### Alternative: npm (when published)

```jsonc
{
  "plugin": ["extendai-lab"]
}
```

> See [OpenCode Plugin Docs](https://opencode.ai/docs/zh-cn/plugins/) for full plugin loading options.

### DeepSeek-TUI adapter (current minimal scope)

DeepSeek-TUI is currently supported only through a minimal file-based adapter,
not a runtime plugin. The current CLI can install/uninstall a small command pack:

```bash
bunx extendai-lab install dstui
bunx extendai-lab uninstall dstui
```

This currently manages:

- `~/.deepseek/commands/ol-engineer.md`
- `~/.deepseek/commands/ol-bio.md`
- `~/.deepseek/commands/ol-plan.md`
- `~/.deepseek/commands/ol-review.md`
- `~/.deepseek/skills/extendai-lab-scientific-rigor/SKILL.md`
- `~/.deepseek/skills/extendai-lab-anti-overconfidence/SKILL.md`
- `~/.deepseek/skills/extendai-lab-bio-research-design/SKILL.md`
- `~/.deepseek/extendai-lab/install-manifest.json`

It does not yet install MCP snippets or hooks.

Host-specific docs:

- [OpenCode plugin guide](docs/opencode/README.md) /
  [中文](docs/opencode/README.zh-CN.md)
- [DeepSeek-TUI adapter guide](docs/deepseek-tui/README.md) /
  [中文](docs/deepseek-tui/README.zh-CN.md)
- [Host adapter architecture](docs/architecture/adapters.md) /
  [中文](docs/architecture/adapters.zh-CN.md)

---

## Configuration

Create `extendai-lab.jsonc` in `~/.config/opencode/`, or create `.opencode/extendai-lab.jsonc` inside your project for repository-local overrides:

```jsonc
{
  // Default agent behavior
  "defaultAgentName": "engineer",

  // Optional: make one visible primary expert appear first in UI ordering
  // without changing default_agent
  // "preferredVisibleAgent": "bio-analyst",

  // Prompt mode: "light" (default), "heavy", "turbo"
  "promptMode": {
    "defaultMode": "light",
    "allowModeSwitch": true
  },

  // Bio Skills: on-demand loading from bundled resources/bioSkills
  "bioSkills": {
    "enabled": true
    // Optional override: "repoPath": "/absolute/path/to/bioSkills"
  },

  // Model presets: "openai", "deepseek", "mixed"
  "modelPreferences": {
    "profile": "openai"
  }
}
```

See [`extendai-lab.example.jsonc`](extendai-lab.example.jsonc) for the current full configuration reference. Legacy `openagent-labforge*.json/jsonc` files remain readable during the compatibility window and are planned to be removed in `v1.0.16`.

### Context pressure / compression guidance

ExtendAI Lab does **not** guess model-family context sizes. Instead, it uses the
actual `provider/model -> limit.context` values reported by OpenCode for the
current session and computes L1/L2/L3 pressure ratios from that real limit.

- `engineering` default thresholds: `0.50 / 0.65 / 0.80`
- `bio` default thresholds: `0.55 / 0.70 / 0.85`

These ratios can be tuned in config:

```jsonc
{
  "compression": {
    "enabled": true,
    "profiles": {
      "engineering": { "l1": 0.5, "l2": 0.65, "l3": 0.8 },
      "bio": { "l1": 0.55, "l2": 0.7, "l3": 0.85 }
    }
  }
}
```

When pressure reaches L2/L3, ExtendAI Lab now prefers a checkpoint/compress-first
continuation path. If no compression plugin is active, it explicitly nudges the
agent toward concise summary/handoff/restart-safe behavior instead of pretending
compression already happened.

---

## Agent Architecture

### Primary Agents (visible in OpenCode UI)

| Agent | Display | Role | Mode Support |
|-------|---------|------|--------------|
| `engineer` (`orchestrator`) | Ultraworker | Main engineering agent | Heavy / Light / Turbo |
| `deep-worker` | Deep Agent | Autonomous deep worker | Heavy / Light / Turbo |
| `planner` (`prometheus`) | Plan Builder | Strategic planner | Light |
| `executor` (`atlas`) | Plan Executor | Plan execution coordinator | Light |
| `bio-analyst` (`bio-orchestrator`) | Bio Ultraworker | Biological science expert for bioinformatics, experimental design, study strategy, and validation planning | Heavy / Light / Turbo |

### Subagents (hidden, delegated to)

| Agent | Role |
|-------|------|
| `explorer` | Parallel codebase search |
| `librarian` | External documentation lookup |
| `oracle` | Architecture advisor, code reviewer |
| `designer` | UI/UX specialist |
| `fixer` | Fast execution for bounded tasks |
| `observer` | Visual analysis (images, PDFs) |
| `council` | Multi-LLM consensus/review engine |
| `councillor` | Council member (internal) |
| `requirements-analyst` (`metis`) | Pre-planning consultant |
| `plan-reviewer` (`momus`) | Plan reviewer (5-dimension scoring) |
| `multimodal-looker` | Media analysis |
| `reviewer` | Code review (4-layer analysis) |

---

## Three-Tier Mode System

| Mode | Source | Use Case |
|------|--------|----------|
| **Light** (default) | [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) | Daily development, balanced delegation |
| **Heavy** | Inspired by [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) | Complex tasks, Phase 0-3 workflow, failure recovery |
| **Turbo** | Inspired by [opencode-workspace](https://github.com/kdcokenny/opencode-workspace) | Fast execution, minimal overhead |

Switch at runtime: `/ol-light`, `/ol-heavy`, `/ol-turbo`

---

## Command System

ExtendAI Lab has two different concepts that should not be confused:

- **Preset switching** (`/ol-preset`) changes model/provider/settings for agents at
  runtime. It is configuration control.
- **Guidance commands** such as `/ol-karpathy` inject task behavior rules into the
  current session. They do not change models, providers, or agent presets.

The project is derived from OMO / oh-my-openagent ideas, but user-facing
LabForge user-facing commands use the `ol-` prefix to avoid collisions with other
OpenCode plugins. Some legacy unprefixed hook commands are still accepted for
backward compatibility, but they are not registered or documented as primary
commands.

### Mode Commands (direct execution)
| Command | Description |
|---------|-------------|
| `/ol-light` | Switch to light mode |
| `/ol-heavy` | Switch to heavy mode |
| `/ol-turbo` | Switch to turbo mode |

### Checkpoint Commands (AI-executed)
| Command | Description |
|---------|-------------|
| `/ol-checkpoint [l\|h\|light\|heavy] [goal]` | Create durable checkpoint (`l` = light, `h` = heavy) |
| `/ol-handoff [goal]` | Create context summary for new session |
| `/ol-checkpoint-resume [latest\|session-id\|path]` | Resume from checkpoint |

### Workflow Commands (AI-executed)
| Command | Description |
|---------|-------------|
| `/ol-start-work [plan-name] [--worktree <path>]` | Start plan execution with executor / internal `atlas` (hook-backed) |
| `/ol-ralph-loop "task" [--max-iterations=N]` | Self-referential loop until completion |
| `/ol-cancel-ralph` | Cancel active Ralph Loop |
| `/ol-stop-continuation` | Stop all continuation mechanisms |

### Utility Commands
| Command | Description |
|---------|-------------|
| `/ol-auto-continue [on\|off]` | Toggle or explicitly enable/disable auto-continuation |
| `/ol-preset [name]` | Switch runtime model/provider presets for agents; does not inject coding guidance |
| `/ol-interview [idea]` | Start product interview |
| `/ol-karpathy [task-or-review-target]` | Apply Karpathy coding guidelines as task/review guidance; does not change model presets |

### Command Execution Modes

| Type | Commands | Behavior |
|------|----------|----------|
| Prompt-template | `/ol-checkpoint`, `/ol-handoff`, `/ol-checkpoint-resume`, `/ol-start-work`, `/ol-karpathy`, `/ol-ralph-loop`, `/ol-cancel-ralph` | Registered command template is sent to the AI to execute |
| Mixed template + hook | `/ol-stop-continuation` | Template performs broad cleanup; hook hard-disables todo auto-continuation |
| Hook-driven | `/ol-auto-continue`, `/ol-preset`, `/ol-interview`, `/ol-light`, `/ol-heavy`, `/ol-turbo` | `command.execute.before` handles the command directly and replaces the LLM template output |

`/ol-preset` and `/ol-karpathy` intentionally live in different categories:
`/ol-preset` changes agent runtime configuration; `/ol-karpathy` applies the fully
migrated Andrej Karpathy prompt guidelines from
[`karpathy-guidelines`](src/skills/karpathy-guidelines/SKILL.md).

### Guidance Skills

| Skill | Description |
|-------|-------------|
| `karpathy-guidelines` | Full migrated Karpathy prompt for reducing LLM coding mistakes: think before coding, simplicity first, surgical changes, and goal-driven verification |

Use `/ol-karpathy` when you want the current session to apply the Karpathy
behavior without manually loading a skill. The full prompt is also available as
the `karpathy-guidelines` skill for agents that support skill loading. It is
especially useful before implementation, refactoring, code review, or any task
where assumptions, overengineering, or broad accidental diffs are likely.

See also:

- [`docs/commands.md`](docs/commands.md) for the full command execution-mode
  taxonomy and `ol-` prefix policy.
- [`docs/plan-workflow.md`](docs/plan-workflow.md) for planner plan files,
  `/ol-start-work`, executor behavior, boulder state, and the role of `council`.

### Media / Visual QA Tools

| Tool | Description |
|------|-------------|
| `media_inventory` | Discover image/PDF files in a file or directory and return absolute paths for `read` or `@observer` analysis |

Use `media_inventory` when you generate plots, screenshots, diagrams, or PDF
artifacts and want the AI to inspect them. OpenCode's native `read` tool can
load returned image/PDF paths as multimodal attachments for a vision-capable
model; `@observer` is the preferred agent for batch visual QA because it keeps
raw image bytes out of the main context.

By default, the tool scans only the requested file or directory (not
subdirectories), includes PDFs, returns up to 50 media files, and has a hard cap
of 500 returned files. Set `recursive: true` to scan subdirectories. Large scans
are bounded and may report incomplete results if the entry/dir budget is reached.
`@observer` should be configured with a vision-capable model for actual image or
PDF interpretation.

Recommended checks for generated images include blank/corrupt output, missing
labels or legends, unreadable text, poor contrast, problematic color palettes,
and whether the figure visually supports the intended engineering or
bioinformatics conclusion.

Visual QA is not bioinformatics-specific. Any agent planning or completing work
that produces visual artifacts should verify what a user would actually see:

- **Web/UI work**: open the local app or generated HTML with browser automation,
  capture screenshots, then inspect rendering, layout, responsive behavior,
  overflow, blank pages, and visible errors.
- **Reference screenshots**: read the image/PDF from disk first; do not require
  users to paste every UI reference into the chat window.
- **Scientific/bioinformatics figures**: check labels, legends, units,
  statistical annotations, color distinguishability, and whether the figure
  supports the stated conclusion.
- **PDFs/reports**: check page rendering, readability, embedded tables/figures,
  truncation, missing pages, and OCR-critical text.
- **Diagrams and engineering charts**: check node/edge clarity, axes/ranges,
  legend consistency, and whether the visual communicates the intended flow or
  trend.

For one or two target files, the main agent can call `read` directly after
`media_inventory`. For directories or batches, delegate visual interpretation to
`@observer` / `multimodal-looker` so raw media does not pollute the main context.

---

## Bioinformatics

### Project-installable Bio MCPs

| MCP | License | Status |
|-----|---------|--------|
| [UniProt MCP](https://github.com/TakumiY235/uniprot-mcp-server) | MIT | Project install required |
| [BioNext MCP](https://github.com/Cherine0205/BioNext-mcp) | MIT | Project install required |

Project-installed MCPs should live under `.opencode/extendai-lab/mcp/servers/` in the active repository. Legacy `.opencode/openagent-labforge/...` paths remain readable during the compatibility window and are planned for removal in `v1.0.16`.

### Recommended Bio MCPs (user-installable)

| MCP | Stars | Description | Install |
|-----|-------|-------------|---------|
| [PubMed MCP Server](https://github.com/cyanheads/pubmed-mcp-server) | 89 | NCBI E-utilities | `npx pubmed-mcp-server` |
| [ChatSpatial](https://github.com/cafferychen777/ChatSpatial) | 33 | Spatial transcriptomics | `pip install chatspatial` |
| [BioThings MCP](https://github.com/longevity-genie/biothings-mcp) | 31 | Genetics, variants | See repo |
| [gget MCP](https://github.com/longevity-genie/gget-mcp) | 27 | Bioinformatics functions | See repo |
| [Semantic Scholar](https://github.com/zongmin-yu/semantic-scholar-fastmcp) | — | Academic paper search | Bundled (opt-in via `enabled_mcps`) |

> PubMed (NCBI) and Semantic Scholar (Allen AI) serve different databases and can coexist.

### Bio Skills

439 SKILL.md files across 65 categories (RNA-seq, ChIP-seq, CRISPR, scRNA-seq, etc.), loaded on-demand via the `load_bio_skills` tool. Skills are sourced from the [bioSkills](https://github.com/BOHUYESHAN-APB/bioSkills) repository.

---

## Checkpoint Mechanism

| Type | Trigger | Scope | Versions |
|------|---------|-------|----------|
| **Light** | L2 context (60-75%) | Same-session recovery | 3 (configurable) |
| **Heavy** | L3 context (>75%) | Cross-session handoff | 5 (configurable) |

Heavy checkpoints carry 115+ metadata fields for full state reconstruction.

Checkpoint kind arguments accept both full words and one-letter shorthands:

```bash
/ol-checkpoint l "quick recovery point"
/ol-checkpoint h "cross-session handoff"
```

Use the same shorthand style for future parameterized commands when the meaning
is unambiguous, while keeping full words available for readability.

### Manual memory commands

Use these commands to store or remove explicit development preferences and workflow habits.
Only record concrete engineering preferences such as test/build/deploy order, tool choices,
review expectations, or preferred operating flow. Do not store emotional or personality judgments.
ExtendAI Lab may also auto-capture a very small allowlisted subset of workflow/tooling
preferences from approved batch summaries, but only when the summary matches a conservative
safe pattern. Reject, blocked, speculative, or emotional summaries must not be written as memory.

```bash
/ol-memory-write kind=workflow scope=repository content="Prefer test -> build -> deploy order for release work"
/ol-memory-list repository
/ol-memory-delete id=pref_abc123 scope=repository
```

---

## Roadmap

### Near-term
- [ ] Context pressure monitor (auto-trigger checkpoints)
- [ ] Extended MCP registry with lane-based permissions
- [ ] Bio task auto-detection improvements

### Mid-term
- [ ] GitHub Actions CI/CD (automated testing + npm publish)
- [ ] Automated test suite (Bun test + typecheck + lint)
- [ ] DeepSeek-TUI plugin integration ([DeepSeek-TUI](https://github.com/BOHUYESHAN-APB/DeepSeek-TUI))

### Long-term
- [ ] Cross-workspace memory persistence
- [ ] Advanced compression strategies (cache-aware, compartmentalized)

---

## Development

```bash
# Build
bun run build

# Type check
bun run typecheck

# Lint
bun run lint

# Test
bun test

# Full check
bun run check:ci
```

---

## License

[Apache-2.0](LICENSE)

## Credits

**Direct base** (MIT):
- [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) — Slimmed agent orchestration plugin for OpenCode. This project is a fork that extends the original 9-agent system.

**Architecture inspiration** (design patterns, NOT code):
- [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) — Inspired the agent architecture (primary agents, delegation model, planning tier), three-tier prompt system (heavy/light/turbo), keyword mode detection, and command system design.

**Turbo mode inspiration** (MIT):
- [opencode-workspace](https://github.com/kdcokenny/opencode-workspace) — Inspired the turbo mode prompt ("KEEP GOING" philosophy) and lightweight agent design.

**Future integration** (MIT):
- [DeepSeek-TUI](https://github.com/Hmbown/DeepSeek-TUI) — Terminal UI for DeepSeek models. Planned plugin integration.

---

## 中文

### 概述

ExtendAI Lab 是 [OpenCode](https://github.com/anomalyco/opencode) 的轻量级代理编排系统，当前以完整 OpenCode 插件形式交付，扩展为 **17 个代理**（5 主 + 12 子），支持三层提示词系统、可选生物信息学能力和检查点记忆架构。

**核心特性**：
- 5 个主代理各司其职（编排、深度执行、规划、计划执行、生物信息学）
- 三层提示词：重量 / 轻量 / 极速，运行时切换
- 生物信息学一等公民：专用代理 + 439 领域技能 + 2 个已集成 MCP
- 检查点机制：轻量（同会话）+ 重量（跨会话）恢复
- 13 个斜杠命令控制工作流
- 所有运行时提示通过系统通道注入，用户消息保持纯净

### 安装

**推荐：本地构建**

```bash
git clone git@github.com:BOHUYESHAN-APB/openagent-labforge-bio.git
cd openagent-labforge-bio
bun install
bun run build
```

在 OpenCode 配置中注册插件：

**Windows** (`%APPDATA%\opencode\opencode.json`):
```jsonc
{
  "plugin": ["file:///D:/path/to/openagent-labforge-bio"]
}
```

**macOS / Linux** (`~/.config/opencode/opencode.json`):
```jsonc
{
  "plugin": ["file:///home/user/openagent-labforge-bio"]
}
```

> 详见 [OpenCode 插件文档](https://opencode.ai/docs/zh-cn/plugins/)。

### 代理系统

**6 个主代理（UI 可见）**：

| 代理 | 显示名 | 角色 | 模式 |
|------|--------|------|------|
| `engineer` (`orchestrator`) | Ultraworker | 工程主代理 | 重量/轻量/极速 |
| `deep-worker` | Deep Agent | 自主深度工作者 | 重量/轻量/极速 |
| `planner` (`prometheus`) | Plan Builder | 战略规划师 | 轻量 |
| `executor` (`atlas`) | Plan Executor | 计划执行协调员 | 轻量 |
| `bio-analyst` (`bio-orchestrator`) | Bio Ultraworker | 生物科学主专家，负责生信分析、实验设计、研究策略与验证规划 | 重量/轻量/极速 |

**12 个子代理（隐藏）**：explorer, librarian, oracle, designer, fixer, observer, council, councillor, requirements-analyst (`metis`), plan-reviewer (`momus`), multimodal-looker, reviewer

### 三层模式系统

| 模式 | 来源 | 适用场景 |
|------|------|---------|
| **轻量**（默认） | [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) | 日常开发 |
| **重量** | 启发自 [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) | 复杂任务，Phase 0-3 工作流 |
| **极速** | 启发自 [opencode-workspace](https://github.com/kdcokenny/opencode-workspace) | 快速执行 |

切换：`/ol-light`、`/ol-heavy`、`/ol-turbo`

### 生物信息学

- **Bio Skills**：439 个 SKILL.md，65 个类别（RNA-seq, ChIP-seq, CRISPR 等）
- **已集成 MCP**：UniProt (MIT)、BioNext (MIT)、Semantic Scholar (MIT)
- **推荐 MCP**：PubMed、ChatSpatial、BioThings、gget 等（见英文章节表格）

### 路线图

- 近期：上下文压力监控、扩展 MCP 权限
- 中期：GitHub Actions CI/CD、自动化测试、DeepSeek-TUI 插件集成
- 远期：跨工作区记忆、高级压缩策略

### 许可证

[Apache-2.0](LICENSE)

### 致谢

**直接基础**（MIT）：
- [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) — 轻量级 OpenCode 代理编排插件。本项目是其扩展分支。

**架构启发**（设计模式，非代码）：
- [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) — 启发了代理架构（主代理、委派模型、规划层）、三层提示词系统、关键词模式检测和指令系统设计。

**极速模式启发**（MIT）：
- [opencode-workspace](https://github.com/kdcokenny/opencode-workspace) — 启发了极速模式提示词（"KEEP GOING" 哲学）和轻量代理设计。

**未来集成**（MIT）：
- [DeepSeek-TUI](https://github.com/Hmbown/DeepSeek-TUI) — DeepSeek 终端 UI，计划开发插件集成。

# OpenAgent LabForge

> Bioinformatics + Engineering dual-track AI agent orchestration plugin for [OpenCode](https://github.com/anomalyco/opencode)

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![OpenCode](https://img.shields.io/badge/OpenCode-plugin-green.svg)](https://opencode.ai/docs/plugins)

English | [中文](#中文)

---

## Overview

OpenAgent LabForge is a lightweight agent orchestration plugin that extends OpenCode with **17 specialized agents** (5 primary + 12 subagents), a three-tier prompt system, bioinformatics capabilities, and a checkpoint-based memory architecture.

**Key differentiators from base OpenCode:**

- 5 primary agents with distinct roles (orchestrator, deep-worker, prometheus, atlas, bio-orchestrator)
- Three-tier prompt system: Heavy / Light / Turbo, switchable at runtime
- Bioinformatics-first: dedicated agent, 439 domain skills, 2 integrated bio MCPs
- Checkpoint mechanism: light (same-session) + heavy (cross-session) recovery
- 13 slash commands for workflow control
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
  "plugin": ["openagent-labforge"]
}
```

> See [OpenCode Plugin Docs](https://opencode.ai/docs/zh-cn/plugins/) for full plugin loading options.

---

## Configuration

Create `openagent-labforge.jsonc` in your project root or `~/.config/opencode/`:

```jsonc
{
  // Prompt mode: "light" (default), "heavy", "turbo"
  "promptMode": {
    "defaultMode": "light",
    "allowModeSwitch": true
  },

  // Bio Skills: on-demand loading from bioSkills repository
  "bioSkills": {
    "enabled": false,
    "repoPath": "Future/clone/bioSkills"
  },

  // Model presets: "openai", "deepseek", "mixed"
  "modelPreferences": {
    "profile": "openai"
  }
}
```

See [`openagent-labforge.example.jsonc`](openagent-labforge.example.jsonc) for the full configuration reference.

---

## Agent Architecture

### Primary Agents (visible in OpenCode UI)

| Agent | Display | Role | Mode Support |
|-------|---------|------|--------------|
| `orchestrator` | Ultraworker | Main engineering orchestrator | Heavy / Light / Turbo |
| `deep-worker` | Deep Agent | Autonomous deep worker | Heavy / Light / Turbo |
| `prometheus` | Plan Builder | Strategic planner | Light |
| `atlas` | Plan Executor | Plan execution coordinator | Light |
| `bio-orchestrator` | Bio Ultraworker | Bioinformatics specialist | Heavy / Light / Turbo |

### Subagents (hidden, delegated to)

| Agent | Role |
|-------|------|
| `explorer` | Parallel codebase search |
| `librarian` | External documentation lookup |
| `oracle` | Architecture advisor, code reviewer |
| `designer` | UI/UX specialist |
| `fixer` | Fast execution for bounded tasks |
| `observer` | Visual analysis (images, PDFs) |
| `council` | Multi-LLM consensus engine |
| `councillor` | Council member (internal) |
| `metis` | Pre-planning consultant |
| `momus` | Plan reviewer (5-dimension scoring) |
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

### Mode Commands (direct execution)
| Command | Description |
|---------|-------------|
| `/ol-light` | Switch to light mode |
| `/ol-heavy` | Switch to heavy mode |
| `/ol-turbo` | Switch to turbo mode |

### Checkpoint Commands (AI-executed)
| Command | Description |
|---------|-------------|
| `/ol-checkpoint [light\|heavy] [goal]` | Create durable checkpoint |
| `/ol-handoff [goal]` | Create context summary for new session |
| `/ol-checkpoint-resume [latest\|session-id\|path]` | Resume from checkpoint |

### Workflow Commands (AI-executed)
| Command | Description |
|---------|-------------|
| `/start-work [plan-name]` | Start work session from plan |
| `/ralph-loop "task" [--max-iterations=N]` | Self-referential loop until completion |
| `/cancel-ralph` | Cancel active Ralph Loop |
| `/stop-continuation` | Stop all continuation mechanisms |

### Utility Commands
| Command | Description |
|---------|-------------|
| `/auto-continue` | Toggle auto-continuation |
| `/preset [name]` | Switch agent presets |
| `/interview [idea]` | Start product interview |

---

## Bioinformatics

### Integrated Bio MCPs

| MCP | License | Status |
|-----|---------|--------|
| [UniProt MCP](https://github.com/TakumiY235/uniprot-mcp-server) | MIT | Bundled (disabled by default) |
| [BioNext MCP](https://github.com/Cherine0205/BioNext-mcp) | MIT | Bundled (disabled by default) |

### Recommended Bio MCPs (user-installable)

| MCP | Stars | Description | Install |
|-----|-------|-------------|---------|
| [PubMed MCP Server](https://github.com/cyanheads/pubmed-mcp-server) | 89 | NCBI E-utilities | `npx pubmed-mcp-server` |
| [ChatSpatial](https://github.com/cafferychen777/ChatSpatial) | 33 | Spatial transcriptomics | `pip install chatspatial` |
| [BioThings MCP](https://github.com/longevity-genie/biothings-mcp) | 31 | Genetics, variants | See repo |
| [gget MCP](https://github.com/longevity-genie/gget-mcp) | 27 | Bioinformatics functions | See repo |
| [Semantic Scholar](https://github.com/zongmin-yu/semantic-scholar-fastmcp) | — | Academic paper search | Bundled (enabled by default) |

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

OpenAgent LabForge 是 [OpenCode](https://github.com/anomalyco/opencode) 的轻量级代理编排插件，扩展为 **17 个代理**（5 主 + 12 子），支持三层提示词系统、生物信息学能力和检查点记忆架构。

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

**5 个主代理（UI 可见）**：

| 代理 | 显示名 | 角色 | 模式 |
|------|--------|------|------|
| `orchestrator` | Ultraworker | 工程主编排器 | 重量/轻量/极速 |
| `deep-worker` | Deep Agent | 自主深度工作者 | 重量/轻量/极速 |
| `prometheus` | Plan Builder | 战略规划师 | 轻量 |
| `atlas` | Plan Executor | 计划执行协调员 | 轻量 |
| `bio-orchestrator` | Bio Ultraworker | 生物信息学专家 | 重量/轻量/极速 |

**12 个子代理（隐藏）**：explorer, librarian, oracle, designer, fixer, observer, council, councillor, metis, momus, multimodal-looker, reviewer

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

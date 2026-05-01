# OpenAgent LabForge

> 生物信息学 + 工程能力的双轨 AI 代理编排插件
>
> Bioinformatics + Engineering dual-track AI agent orchestration plugin for OpenCode

---

## English

### What is OpenAgent LabForge?

OpenAgent LabForge is an agent orchestration plugin for [OpenCode](https://github.com/anomalyco/opencode), forked from [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim). It extends the original 9-agent system to **17 agents** (5 primary + 12 subagents) with:

- **Three-tier prompt system**: Heavy (Omo-inspired) / Light (OMOS-native) / Turbo (OLD-2-inspired)
- **Bioinformatics specialization**: Dedicated bio-orchestrator agent + 2 integrated bio MCPs + 439 bio skills
- **Checkpoint mechanism**: Light (same-session recovery) + Heavy (cross-session handoff)
- **Command system**: 13 slash commands for workflow control
- **Mode detection**: Automatic search/analyze/heavy mode injection via keyword detection

### Design Principles

1. **Main agent priority** - Primary agents do real work, not just dispatch
2. **Lightweight** - Don't reimplement OpenCode mechanisms, extend them
3. **Bio as first-class capability** - Not an add-on, deeply integrated
4. **Token-friendly** - Cost-sensitive, use cheaper models for subagents
5. **User message purity** - Runtime prompts injected via system channel, not user messages
6. **OpenCode-only platform** - No multi-platform abstraction

### Architecture

#### Agent System

**5 Primary Agents (visible in OpenCode UI)**:

| Agent | Display Name | Role | Mode Support |
|-------|-------------|------|--------------|
| `orchestrator` | Ultraworker | Main engineering orchestrator | Heavy/Light/Turbo |
| `deep-worker` | Deep Agent | Autonomous deep worker | Heavy/Light/Turbo |
| `prometheus` | Plan Builder | Strategic planner (interview + plan) | Light only |
| `atlas` | Plan Executor | Plan execution coordinator | Light only |
| `bio-orchestrator` | Bio Ultraworker | Bioinformatics specialist | Heavy/Light/Turbo |

**12 Subagents (hidden, delegated to)**:

| Agent | Role |
|-------|------|
| `explorer` | Parallel codebase search |
| `librarian` | External documentation lookup |
| `oracle` | Architecture advisor, code reviewer |
| `designer` | UI/UX specialist |
| `fixer` | Fast execution for well-defined tasks |
| `observer` | Visual analysis (images, PDFs) |
| `council` | Multi-LLM consensus engine |
| `councillor` | Council member (internal) |
| `metis` | Pre-planning consultant |
| `momus` | Plan reviewer (5-dimension scoring) |
| `multimodal-looker` | Media analysis |
| `reviewer` | Code review (4-layer analysis) |

#### Three-Tier Mode System

| Mode | Source | Lines | Use Case |
|------|--------|-------|----------|
| **Light** (default) | OMOS native | 200-300 | Daily development |
| **Heavy** | Omo-inspired | 542 | Complex tasks, Phase 0-3 workflow |
| **Turbo** | OLD-2-inspired | 58 | Fast execution, "KEEP GOING" philosophy |

Switch modes: `/ol-light`, `/ol-heavy`, `/ol-turbo`

#### Command System

**Mode Commands** (direct execution, bypass LLM):

| Command | Description |
|---------|-------------|
| `/ol-light` | Switch to light mode |
| `/ol-heavy` | Switch to heavy mode |
| `/ol-turbo` | Switch to turbo mode |

**Checkpoint Commands** (prompt injection, AI executes):

| Command | Description |
|---------|-------------|
| `/ol-checkpoint [light\|heavy] [goal]` | Create durable checkpoint |
| `/ol-handoff [goal]` | Create context summary for new session |
| `/ol-checkpoint-resume [latest\|session-id\|path]` | Resume from checkpoint |

**Workflow Commands** (prompt injection, AI executes):

| Command | Description |
|---------|-------------|
| `/start-work [plan-name]` | Start work session from Prometheus plan |
| `/ralph-loop "task" [--max-iterations=N]` | Self-referential loop until completion |
| `/cancel-ralph` | Cancel active Ralph Loop |
| `/stop-continuation` | Stop all continuation mechanisms |

**Utility Commands**:

| Command | Description |
|---------|-------------|
| `/auto-continue` | Toggle auto-continuation |
| `/preset [name]` | Switch agent presets |
| `/interview [idea]` | Start product interview |

#### Bioinformatics Features

- **Bio Skills**: 439 SKILL.md files across 65 categories, loaded on-demand via `load_bio_skills` tool
- **Bio MCPs (integrated)**: UniProt (MIT), BioNext (MIT)
- **Bio MCPs (extended)**: Semantic Scholar (MIT), PubMed search via arxiv_mcp
- **Bio Orchestrator**: Specialized agent with genomics/proteomics/computational biology workflows

#### Recommended Bio MCPs (User-Installable)

These MCPs are **not bundled** due to licensing or dependency requirements, but highly recommended for bioinformatics work. Add them to your `opencode.jsonc` under `mcp`:

**MIT / Apache-2.0 Licensed (Recommended)**:

| MCP | Stars | Description | Install |
|-----|-------|-------------|---------|
| [PubMed MCP Server](https://github.com/cyanheads/pubmed-mcp-server) | 89 | NCBI E-utilities: PubMed search, MeSH terms, citations | `npx pubmed-mcp-server` |
| [ChatSpatial](https://github.com/cafferychen777/ChatSpatial) | 33 | Spatial transcriptomics: 60+ methods, 15 categories | `pip install chatspatial` |
| [BioThings MCP](https://github.com/longevity-genie/biothings-mcp) | 31 | Genetics, variants, bioinformatics data | See repo |
| [gget MCP](https://github.com/longevity-genie/gget-mcp) | 27 | Bioinformatics functions (gget library) | See repo |
| [OpenTargets MCP](https://github.com/nickzren/opentargets-mcp) | 16 | Genomics, drug discovery data | See repo |
| [Precision Medicine MCP](https://github.com/lynnlangit/precision-medicine-mcp) | 13 | Multiomics/genomics + spatial transcriptomics | See repo |
| [PubChem MCP Server](https://github.com/cyanheads/pubchem-mcp-server) | 8 | Chemical database: compounds, safety, bioactivity | `npx pubchem-mcp-server` |
| [Ensembl MCP Server](https://github.com/effieklimi/ensembl-mcp-server) | 6 | Ensembl REST API: genome annotation | See repo |
| [PDBe MCP Servers](https://github.com/PDBeurope/PDBe-MCP-Servers) | 5 | Protein Data Bank Europe: structure data | See repo |

**Non-Commercial Licensed (Personal Use Only)**:

| MCP | Stars | Description | License |
|-----|-------|-------------|---------|
| [AlphaFold MCP](https://github.com/Augmented-Nature/AlphaFold-MCP-Server) | 34 | Protein structure predictions, confidence analysis | Non-Commercial |
| [PDB MCP](https://github.com/Augmented-Nature/PDB-MCP-Server) | 24 | Protein Data Bank: 3D structures, validation | Non-Commercial |
| [Gene Ontology MCP](https://github.com/Augmented-Nature/GeneOntology-MCP-Server) | 8 | Gene Ontology data, functional enrichment | Non-Commercial |
| [STRING DB MCP](https://github.com/Augmented-Nature/STRING-db-MCP-Server) | 4 | Protein interaction networks | Non-Commercial |

> **Note**: PubMed MCP and Semantic Scholar serve different databases (NCBI vs Allen AI) and can coexist without conflict.

#### Checkpoint Mechanism

**Light Checkpoint** (same-session recovery):
- Triggered at L2 context usage (60-75%)
- Auto-summarizes current state
- Keeps 3 versions (configurable)

**Heavy Checkpoint** (cross-session handoff):
- Triggered at L3 context usage (>75%)
- Full state transfer with 115 metadata fields
- Recommends session switch
- Keeps 5 versions (configurable)

---

## 中文

### 什么是 OpenAgent LabForge？

OpenAgent LabForge 是 [OpenCode](https://github.com/anomalyco/opencode) 的代理编排插件，从 [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) 分支而来。它将原来的 9 代理系统扩展为 **17 个代理**（5 个主代理 + 12 个子代理），并提供：

- **三层提示词系统**：重量（Omo 启发）/ 轻量（OMOS 原生）/ 极速（OLD-2 启发）
- **生物信息学专业化**：专用 bio-orchestrator 代理 + 2 个已集成生物 MCP + 439 个生物技能
- **检查点机制**：轻量（同会话恢复）+ 重量（跨会话转交）
- **指令系统**：13 个斜杠命令用于工作流控制
- **模式检测**：通过关键词自动注入 search/analyze/heavy 模式提示词

### 设计原则

1. **主代理优先** - 主代理做实际工作，不仅仅是调度
2. **轻量化** - 不重新实现 OpenCode 机制，而是扩展
3. **生物信息学一等公民** - 不是附加功能，深度集成
4. **Token 友好** - 成本敏感，子代理使用更便宜的模型
5. **用户消息纯净** - 运行时提示通过系统通道注入，不污染用户消息
6. **仅支持 OpenCode** - 不做多平台抽象

### 架构

#### 代理系统

**5 个主代理（OpenCode UI 可见）**：

| 代理 | 显示名称 | 角色 | 模式支持 |
|------|---------|------|---------|
| `orchestrator` | Ultraworker | 工程主编排器 | 重量/轻量/极速 |
| `deep-worker` | Deep Agent | 自主深度工作者 | 重量/轻量/极速 |
| `prometheus` | Plan Builder | 战略规划师 | 仅轻量 |
| `atlas` | Plan Executor | 计划执行协调员 | 仅轻量 |
| `bio-orchestrator` | Bio Ultraworker | 生物信息学专家 | 重量/轻量/极速 |

**12 个子代理（隐藏，被委派）**：

| 代理 | 角色 |
|------|------|
| `explorer` | 并行代码库搜索 |
| `librarian` | 外部文档查询 |
| `oracle` | 架构顾问、代码审查 |
| `designer` | UI/UX 专家 |
| `fixer` | 快速执行明确定义的任务 |
| `observer` | 视觉分析（图片、PDF） |
| `council` | 多 LLM 共识引擎 |
| `councillor` | Council 成员（内部） |
| `metis` | 规划前顾问 |
| `momus` | 计划审查员（5 维度评分） |
| `multimodal-looker` | 媒体分析 |
| `reviewer` | 代码审查（4 层分析） |

#### 三层模式系统

| 模式 | 来源 | 行数 | 适用场景 |
|------|------|------|---------|
| **轻量**（默认） | OMOS 原生 | 200-300 | 日常开发 |
| **重量** | Omo 启发 | 542 | 复杂任务、Phase 0-3 工作流 |
| **极速** | OLD-2 启发 | 58 | 快速执行、"KEEP GOING" 哲学 |

切换模式：`/ol-light`、`/ol-heavy`、`/ol-turbo`

#### 指令系统

**模式指令**（直接执行，绕过 LLM）：

| 指令 | 说明 |
|------|------|
| `/ol-light` | 切换到轻量模式 |
| `/ol-heavy` | 切换到重量模式 |
| `/ol-turbo` | 切换到极速模式 |

**检查点指令**（提示词注入，AI 执行）：

| 指令 | 说明 |
|------|------|
| `/ol-checkpoint [light\|heavy] [goal]` | 创建持久检查点 |
| `/ol-handoff [goal]` | 创建新会话的上下文摘要 |
| `/ol-checkpoint-resume [latest\|session-id\|path]` | 从检查点恢复 |

**工作流指令**（提示词注入，AI 执行）：

| 指令 | 说明 |
|------|------|
| `/start-work [plan-name]` | 从 Prometheus 计划启动工作会话 |
| `/ralph-loop "task" [--max-iterations=N]` | 自循环直到任务完成 |
| `/cancel-ralph` | 取消活跃的 Ralph 循环 |
| `/stop-continuation` | 停止所有继续机制 |

**工具指令**：

| 指令 | 说明 |
|------|------|
| `/auto-continue` | 切换自动继续 |
| `/preset [name]` | 切换代理预设 |
| `/interview [idea]` | 启动产品访谈 |

#### 生物信息学功能

- **Bio Skills**：439 个 SKILL.md 文件，涵盖 65 个类别，通过 `load_bio_skills` 工具按需加载
- **Bio MCP（已集成）**：UniProt (MIT)、BioNext (MIT)
- **Bio MCP（扩展）**：Semantic Scholar (MIT)、PubMed 检索（通过 arxiv_mcp）
- **Bio Orchestrator**：专用代理，支持基因组学/蛋白质组学/计算生物学工作流

#### 推荐安装的生物 MCP（用户自行配置）

以下 MCP 因协议或依赖原因未集成，但强烈推荐生物信息学用户安装。在 `opencode.jsonc` 的 `mcp` 中添加：

**MIT / Apache-2.0 协议（推荐）**：

| MCP | Stars | 说明 | 安装方式 |
|-----|-------|------|---------|
| [PubMed MCP Server](https://github.com/cyanheads/pubmed-mcp-server) | 89 | NCBI E-utilities：PubMed 检索、MeSH 术语、引用 | `npx pubmed-mcp-server` |
| [ChatSpatial](https://github.com/cafferychen777/ChatSpatial) | 33 | 空间转录组学：60+ 方法，15 个类别 | `pip install chatspatial` |
| [BioThings MCP](https://github.com/longevity-genie/biothings-mcp) | 31 | 遗传学、变异、生物信息学数据 | 见仓库 |
| [gget MCP](https://github.com/longevity-genie/gget-mcp) | 27 | 生物信息学函数库（gget） | 见仓库 |
| [OpenTargets MCP](https://github.com/nickzren/opentargets-mcp) | 16 | 基因组学、药物发现数据 | 见仓库 |
| [Precision Medicine MCP](https://github.com/lynnlangit/precision-medicine-mcp) | 13 | 多组学/基因组学 + 空间转录组学 | 见仓库 |
| [PubChem MCP Server](https://github.com/cyanheads/pubchem-mcp-server) | 8 | 化学数据库：化合物、安全性、生物活性 | `npx pubchem-mcp-server` |
| [Ensembl MCP Server](https://github.com/effieklimi/ensembl-mcp-server) | 6 | Ensembl REST API：基因组注释 | 见仓库 |
| [PDBe MCP Servers](https://github.com/PDBeurope/PDBe-MCP-Servers) | 5 | 欧洲蛋白质数据库：结构数据 | 见仓库 |

**非商业协议（仅限个人使用）**：

| MCP | Stars | 说明 | 协议 |
|-----|-------|------|------|
| [AlphaFold MCP](https://github.com/Augmented-Nature/AlphaFold-MCP-Server) | 34 | 蛋白质结构预测、置信度分析 | 非商业 |
| [PDB MCP](https://github.com/Augmented-Nature/PDB-MCP-Server) | 24 | 蛋白质数据库：3D 结构、验证 | 非商业 |
| [Gene Ontology MCP](https://github.com/Augmented-Nature/GeneOntology-MCP-Server) | 8 | 基因本体数据、功能富集 | 非商业 |
| [STRING DB MCP](https://github.com/Augmented-Nature/STRING-db-MCP-Server) | 4 | 蛋白质相互作用网络 | 非商业 |

> **注意**：PubMed MCP 和 Semantic Scholar 服务不同数据库（NCBI vs Allen AI），可以共存，无冲突。

#### 检查点机制

**轻量检查点**（同会话恢复）：
- 在 L2 上下文使用率（60-75%）时触发
- 自动总结当前状态
- 保留 3 个版本（可配置）

**重量检查点**（跨会话转交）：
- 在 L3 上下文使用率（>75%）时触发
- 完整状态转移，包含 115 个元数据字段
- 推荐会话切换
- 保留 5 个版本（可配置）

---

## Installation

```bash
bunx openagent-labforge@latest install
```

## Configuration

Create `.opencode/openagent-labforge.json` in your project:

```jsonc
{
  "promptMode": {
    "defaultMode": "light",
    "allowModeSwitch": true,
    "applyToAgents": ["orchestrator", "bio-orchestrator", "deep-worker"]
  },
  "bioSkills": {
    "enabled": true,
    "repoPath": "Future/clone/bioSkills",
    "allowedAgents": ["*"]
  },
  "compression": {
    "enabled": false,
    "strategy": "auto",
    "thresholdTokens": 100000,
    "preserveRecent": 10
  }
}
```

## License

Apache-2.0

## Credits

Based on [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) by Boring Dystopia Development.
Agent architecture inspired by [oh-my-openagent](https://github.com/anomalyco/oh-my-openagent) and [openagent-labforge](https://github.com/bohuyeshan/openagent-labforge).

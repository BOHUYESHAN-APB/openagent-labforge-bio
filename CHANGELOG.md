# Changelog / 更新日志

All notable changes to this project are documented here.

本文件记录项目的重要变更。由于 `v1.0.5` 之前主要是内部开发、迁移和
checkpoint 式迭代，早期版本条目为基于现有提交历史和功能阶段整理的补记。

## v1.3.5 — 2026-06-24

### Added / 新增

- **Plan mode switching**: New `plan_enter`/`plan_exit` tools switch the active
  agent to prometheus (planner) for strategic planning, with read-only access
  and 5-phase workflow. Hook-based overlay mechanism isolates the planner prompt
  and sets `output.message.agent` for UI agent display.
- 计划模式切换：新增 `plan_enter`/`plan_exit` 工具，将当前的主代理切换到
  prometheus（规划师）进行战略规划，只读权限 + 5 阶段工作流。
- **Continuation intent detection**: Auto-detects LLM stop signals ("should I?",
  truncated output) and injects force-continue messages to prevent premature
  stops mid-plan.
- 延续意图检测：自动检测 LLM 停止信号和截断输出，注入强制继续消息。
- **Agent name set dynamic**: `AGENT_NAME_SET` now uses `ALL_AGENT_NAMES`
  instead of hardcoded subset, fixing task session management for 10 previously
  missing agents (metis, momus, multimodal-looker, reviewer, etc.).
- Agent 名称集动态化：`AGENT_NAME_SET` 现在使用 `ALL_AGENT_NAMES`，修复了
  10 个之前缺失的 agent 的任务会话管理。

### Fixed / 修复

- **Context compaction contamination**: Compaction prompt now includes Boundary
  Declaration and Context Isolation sections, preventing conversation formatting
  instructions from leaking into compaction summaries. `output.context` is
  cleared before compaction runs.
- 上下文压缩污染修复：压缩提示词增加边界声明和上下文隔离，防止对话中的格式
  要求泄漏到压缩摘要中。压缩运行前清除 `output.context`。
- **Agent switching for plan/review overlays**: `system.transform` now early-
  returns for prometheus overlay (matching reviewer pattern), other hooks no
  longer dilute the isolated prompt. `chat.message` always sets
  `output.message.agent` when overlay is active.
- Agent 切换修复：`system.transform` 对 prometheus 增加 early return，
  `chat.message` 在 overlay 激活时强制设置 `output.message.agent`。

### Removed / 移除

- **subagentPolicy system**: Ultra-minimal/minimal/full/custom/main-only subagent
  policies removed. Agent registration now uses only `disabled_agents`.
  Commands `/ol-subagents-*` deleted.
- subagentPolicy 系统移除：极简/最小/完整/自定义/主代理模式全部删除。Agent
  注册仅使用 `disabled_agents`。`/ol-subagents-*` 指令已删除。

## v1.1.4 — 2026-05-27

### Fixed / 修复

- **MCP server port conflict**: Changed from fixed port 25569 to dynamic
  port (OS-assigned). Multiple OpenCode windows can now run simultaneously
  without port conflicts.
- MCP 服务器端口冲突修复：从固定端口 25569 改为动态端口（系统分配）。
  多个 OpenCode 窗口现在可以同时运行而不会发生端口冲突。

## v1.1.3 — 2026-05-27

### Added / 新增

- **Session Goal**: `/goal` command for setting session objectives that keep
  todos, delegation, and verification aligned. Supports manual goals, interview
  integration, and goal inheritance for child sessions.
- 会话目标：`/goal` 命令用于设置会话目标，保持 todo、委派和验证对齐。
  支持手动目标、面试集成和子会话目标继承。

- **Subtask**: `/subtask` tool for running bounded child workers. Creates a
  separate orchestrator session for focused work, returns structured summary
  to the parent session.
- 子任务：`/subtask` 工具用于运行有界子任务。创建独立的协调器会话执行
  聚焦工作，返回结构化摘要到父会话。

## v1.1.2 — 2026-05-27

### Fixed / 修复

- **Sub-agent model inheritance**: `DEFAULT_MODELS` all set to `undefined`
  so sub-agents inherit the main agent's model via OpenCode's native
  inheritance (`next.model ?? parentModel`). Previously, hardcoded defaults
  like `openai/gpt-5.4-mini` broke inheritance — a main agent using MiMo
  would spawn sub-agents on Gemini.
- 子 agent 模型继承修复：`DEFAULT_MODELS` 全部设为 `undefined`，子 agent
  通过 OpenCode 原生机制继承主 agent 模型。之前硬编码的默认值会破坏继承。

- **Preset command interception**: `/ol-preset-ds-first` and other preset
  subcommands no longer leak output as prompts to the LLM. Model switching
  happens silently via `client.config.update()`.
- 预设指令拦截修复：`/ol-preset-ds-first` 等指令不再将输出作为提示词
  发送给 LLM。模型切换通过 `client.config.update()` 静默执行。

- **Preset JSON syntax**: removed trailing `}` errors in `deepseek.json`,
  `openai.json`, `mixed.json`.
- 预设 JSON 语法修复：移除多余的 `}`。

### Added / 新增

- **Xiaomi MiMo presets**: new `mimo` and `mimo-ds` presets for Xiaomi
  MiMo V2.5 models (`mimo-v2.5-pro`, `mimo-v2.5-flash`).
- 小米 MiMo 预设：新增 `mimo` 和 `mimo-ds` 预设，支持 MiMo V2.5 系列模型。

- **Preset file auto-loading**: `switchPreset()` now loads from preset files
  (`src/config/presets/{name}.json`) when the preset is not in `config.presets`.
- 预设文件自动加载：`switchPreset()` 在 `config.presets` 中找不到时自动从
  预设文件加载。

## v1.1.1 — 2026-05-22

### Breaking Changes / 破坏性变更

- **MCP server architecture**: removed shared-server logic. Each OpenCode
  window now runs an independent MCP server instance via
  `StdioServerTransport`. Fixes multi-window connection failures and race
  conditions where a second window's MCP requests would hang or crash.
- MCP 服务器架构变更：每个 OpenCode 窗口独立运行 MCP 服务器实例
  （`StdioServerTransport`）。修复多窗口连接失败和竞争条件问题。

### Added / 新增

#### Academic Paper Mode（论文模式）

- **Academic Paper Mode skills** (`resources/academicSkills/`): new skill
  category system following `resources/bioSkills/` pattern:
  - `citation/cnki-parser` — CNKI multi-format export (`.txt`, `.net`, `.enw`,
    `.ris`, `.bib`) → unified BibTeX, auto-detect format, merge multi-file
  - `citation/cite-match` — Body text `[[cite:keywords]]` → `[N]` citation
    markers with multi-layer matching (keyword → TF-IDF → semantic)
  - `formatting/md2docx` — Three-pipeline DOCX generation:
    - Pipeline A (v4): Python direct parse — REF field codes + Word auto-numbering
    - Pipeline B: Pandoc direct — quick drafts with --citeproc
    - Pipeline C: HTML intermediate — fallback only, NOT for final output
  - `writing/latex-pipeline` — LaTeX project templates (ctex), xelatex+biber
    compilation pipeline, Chinese formatting, error troubleshooting
  - `writing/citation-database` — Local citation vector database: PDF text
    extraction → BGE embedding → Chroma vector search for sentence-level
    citation matching
- 新增论文模式技能体系 (`resources/academicSkills/`)，包含 CNKI 解析、
  正文引文匹配、三管线 DOCX 生成、LaTeX 模板编译、本地引用向量数据库。

- **`document-formatting` skill**: updated to v4 final spec — 14pt body,
  0.74cm indent, fullwidth CJK punctuation, `[5][6]` tight multi-citation,
  REF field code cross-reference, GB/T 7714-2015 reference format, custom
  numbering XML with `[%1]` format, `<w:suff w:val="space"/>` spacing control.
- `document-formatting` 技能更新至 v4 最终版规范。

- **`academic-writing` skill**: rewritten with full pipeline architecture
  diagram, tool chain checklist, pipeline comparison matrix, and decision tree.
- `academic-writing` 技能重写，整合完整管线架构。

- **Academic writing tool stack (P0)**:
  - Environment-aware tool checking (`academic_check_tools()`) for Windows/WSL/
    Linux/macOS — checks pandoc, papis, python-docx, xelatex, biber, PyMuPDF,
    jieba, chromadb, sentence-transformers
  - MD → DOCX pipeline with Chinese academic formatting (GB/T 7714-2015):
    宋体/Times New Roman/SimHei fonts, proper sizing
  - MD → HTML → DOCX with `academic_build_docx()` MCP tool
  - Registration: `academic_check_tools` and `academic_build_docx` as MCP tools
  - Skill documentation: comprehensive SKILL.md with workflows and patterns
- 新增学术写作工具栈 P0：环境感知工具检测、MD→DOCX 管线、MCP 工具注册。

- **Standardized document parser** (`src/tools/doc-parser/`):
  - `parse_pdf.py` — PyMuPDF-based PDF parser with preserved paragraph/sentence
    boundaries, unified JSON output format
  - `parse_docx.py` — python-docx DOCX parser with style and table extraction
  - `index.ts` — TypeScript entry point with crossSpawn Python integration
  - `SKILL.md` — Documentation with three-pipeline design (text PDF / OCR / DOCX)
- 新增标准化文档解析器：PDF（PyMuPDF）+ DOCX（python-docx）稳定解析脚本。

#### Core Architecture（核心架构）

- **Storm-breaker hook**: sliding-window duplicate tool call suppression.
  Detects and blocks repeated identical tool invocations within a configurable
  window to prevent infinite loops.
- 新增 Storm-breaker hook：滑动窗口去重工具调用抑制。

- **Prefix-stability hook**: SHA-256 system prompt fingerprint drift detection.
  Warns when the system prompt changes unexpectedly mid-session.
- 新增 Prefix-stability hook：SHA-256 系统提示词指纹漂移检测。

- **Schema-sanitize hook**: JSON Schema cleanup filter for DeepSeek strict mode.
  Removes schemas with `additionalProperties` conflicts that cause DeepSeek
  validation errors.
- 新增 Schema-sanitize hook：清理 JSON Schema 中的 DeepSeek 严格模式冲突。

- **Flash-escalation hook**: failure-count-based auto model escalation.
  After N consecutive API failures, automatically switches to a fallback model
  for the current session.
- 新增 Flash-escalation hook：基于失败次数的自动模型升级切换。

- **Delegation model v2**: three-mode subagent execution — `background=false`
  (blocking, default), `background=true` (fire-and-forget), batch (parallel
  blocking). Added shared-prefix snapshot protocol for cache-friendly parallel
  children. Resuming existing specialist sessions preferred over new ones.
- 委派模型 v2：三模式子代理执行（阻塞/即弃/批量）+ 共享前缀协议。

- **Review system v2**: dual-mode review — main-agent self-review (Option A)
  for simple tasks, @oracle subagent delegation (Option B) for complex work.
- 审查系统 v2：双模式审查（主代理自审 / @oracle 委派审查）。

- **Git discipline rules**: auto-review now checks for uncommitted analysis
  results; generated files must be committed before task completion.
- Git 纪律规则：审查时检查未提交的分析结果文件。

- **File/output discipline**: explicit file creation rules (conversation vs
  workspace), output style rules (paragraph over bullets), script type hints.
- 文件/输出纪律：文件创建规则、段落优先输出风格。

- **Bio/chem mode detection**: automatic mode detection for bioinformatics
  and chemistry tasks; HTML output rules for generated reports.
- 生物/化学模式自动检测与 HTML 输出规则。

- **Thinking-language hook**: `reasoning_summary` language directive based on
  provider; Chinese models → Chinese thinking, foreign models → English.
- `reasoning_summary` 语言指令：国模中文、海外模型英文。

- **Delegate-task retry hook**: `run_in_background` → `background` parameter
  alignment for OpenCode v1.15.0+ compatibility.
- 委派任务重试 hook：参数与 OpenCode v1.15.0+ 对齐。

#### Dashboard & Server（仪表板与服务）

- **extendai-lab MCP server**: new built-in MCP server providing:
  `extendai_list_skills`, `extendai_read_plan`, `extendai_list_checkpoints`,
  `extendai_dashboard_status`. Runs on `bun run extendai-server`.
- 新增 extendai-lab MCP 服务器（localhost:25569），提供技能浏览、计划读取、
  checkpoint 列表、仪表板状态等工具。

- **Web dashboard v1**: localhost:25569 web UI with:
  - Skills viewer and category browser
  - Markdown renderer for saved plans
  - Theme toggle (light/dark)
  - Docs viewer for plugin documentation
- 新增 Web 仪表板 v1：技能浏览、计划渲染、主题切换、文档查看。

- **Web dashboard v2** → **v4 dashboard**:
  - Schema config editor with JSON validation
  - AI HTML viewer for generated pages
  - Modern UI with sidebar navigation
  - Dashboard status endpoint integration
- Web 仪表板 v2→v4：Schema 配置编辑器、AI HTML 查看器、侧栏导航、状态集成。

- **Shared server fix**: lock file coordination for multi-window MCP server
  startup; parent exit detection for clean server shutdown.
- 共享服务器修复：多窗口 MCP 锁文件协调、父进程退出检测。

#### Third-Party Skills（第三方技能）

- **Registered ThirdParty skills** as OpenCode skill paths:
  `html-anything-skills` (47 skills), `guizang-html-ppt` (Apache-2.0),
  `html-ppt-skill` (MIT). Converted git submodules to committed files.
- 注册第三方技能路径：47 个 HTML 设计技能、PPT 技能。

- **Removed `.git` internals** from ThirdParty skill directories to prevent
  git conflicts during packaging.
- 移除第三方技能目录中的 `.git` 内部文件。

- **`THIRD_PARTY_NOTICES.md`**: full provenance tracking with Section 5
  (Integrated Skills) and Section 6 (Contribution Guidelines).
- 更新 Third-Party Notices，完整标注所有第三方技能出处。

### Fixed / 修复

- **Plugin path resolution**: replaced build-time `__dirname` hardcoding with
  runtime `getPackageRoot(import.meta.url)`. Previously, `src/skills` and
  `ThirdParty` paths were baked to the build machine's filesystem at build
  time, causing skill discovery to fail on npm-installed copies.
- 修复插件路径硬编码：构建时 `__dirname` → 运行时 `import.meta.url`。
  此前路径绑定到构建机器的绝对路径，npm 安装后技能发现失败。

- **Bio skills catalog**: replaced hardcoded routing guide with auto-generated
  entries from catalog.json. Removed absolute path leakage from
  `<bio_skills_loaded>` block.
- Bio Skills 目录路由指南从硬编码改为 catalog.json 自动生成，移除绝对路径暴露。

- **MCP server**: switched from raw TCP to `StdioServerTransport` with proper
  SDK Server class. Added dual logging (stderr for SDK, stdout for protocol).
  Fixes OpenCode v1.14+ protocol compatibility.
- MCP 服务器修复：改用 SDK Server+StdioServerTransport，修复协议兼容性。

- **Delete guard**: expanded tool name matching to cover bash, shell, exec,
  execute_command, powershell, run_command, system, cmd, terminal (v1.1.0+).
- 删除护栏：扩展匹配工具名覆盖范围。

- **Cross-session auto_continue**: global fallback on state load when
  session-specific state is missing. Ensures continuation survives crashes.
- 跨会话 auto_continue：状态加载时全局回退，确保续跑能在崩溃后存活。

- **Abort loop fix**: 30-second suppression window + `abortedByUser` flag after
  user cancellation. Clears on next user activity to prevent double-abort.
- 中止循环修复：30 秒抑制窗口 + `abortedByUser` 标记，防止重复中止。

- **Review command cleanup**: `review` now delegates to valid `@oracle`
  subagent; removed dead `/ol-review` command.
- 审查命令清理：`review` 委派到有效 `@oracle` 子代理，移除无效 `/ol-review`。

- **save_plan tool**: enhanced description with explicit prohibition against
  outputting plan content to conversation.
- `save_plan` 工具描述强化，禁止将计划内容输出到对话。

- **Start Work command**: improved cross-window state recovery with explicit
  context section for path information injection.
- Start Work 命令：跨窗口状态恢复增强，注入明确的路径信息上下文。

### Changed / 变更

- **`package.json`**: added `resources/academicSkills` to published manifest.
- npm 包新增 `resources/academicSkills` 目录发布。

- **`src/index.ts`**: registered `resources/academicSkills` path in skill
  discovery and `external_directory` permission rules. Registered academic
  MCP tools (`academic_check_tools`, `academic_build_docx`).
- 注册学术技能路径和文件读取权限，注册学术 MCP 工具。

- **`AGENTS.md`**: rewritten with agent delegation rules, batch execution
  model, subagent policy, session reuse, task complexity assessment,
  context pressure management, auto-review system, MCP architecture,
  cross-window state management, delete guard, subagent philosophy.
- 重写 `AGENTS.md`：完整的工作流规则和代理编排文档。

### Known Issues Resolved / 已解决

- ✅ Plugin Skill Path Resolution (build-time `__dirname` — fixed)
- ✅ MCP Multi-Window Sharing (removed shared logic — fixed)
- ✅ Delete Command Guard (expanded tool matching — fixed)
- ✅ Plan Mode Prompt Overhead (optimized save_plan description — fixed)
- ✅ MCP Server Protocol (StdioServerTransport + dual logging — fixed)
- ✅ Auto-Review Dual Mode (self-review + @oracle — implemented)
- ✅ Subagent Delegation Model (three-mode execution — implemented)
- ✅ Academic Paper Mode (P0 + v4 spec — complete)
- ⚠️ Start Work Command Detection (improved, may need further testing)

## v1.0.24 - 2026-05-11

### Added / 新增

- **Delete command safety guard**: intercepts `rm -rf`, `del`, `Remove-Item`,
  script execution, and language-level delete operations (Python `os.remove`,
  Node `fs.unlink`, etc.). Follows OpenCode's permission model — AI explains
  why, user approves. (`src/safety/delete-guard.ts`)
- 新增删除命令安全护栏，遵循 OpenCode 权限模型：AI 解释原因，用户批准执行。

- **State persistence for auto-continuation**: continuation state is now persisted
  to `.opencode/extendai-lab/continuation-state.json`, enabling crash recovery
  across session restarts. Pattern from oh-my-openagent's ralph-loop.
- 自动续跑状态持久化，重启后可恢复续跑状态。

- **Crash recovery gate**: `session.deleted` events mark the session as recovering
  for 5 seconds to prevent re-injection into crashed sessions.
- 崩溃恢复栅极：session 崩溃后 5 秒内阻止重新注入。

- **Completion promise detector**: `<promise>DONE</promise>` marker detection in
  assistant messages, with incremental scanning via `sinceMessageIndex`.
- 完成标记检测：扫描 `<promise>DONE</promise>` 标记，支持增量扫描。

- **`autoReviewModel` config**: optional separate model for auto-review
  (e.g., `opencode-go/deepseek-v4-flash`). Defaults to the orchestrator's model.
- 可选独立审查模型配置。

### Changed / 变更

- **SDK upgraded** to `@opencode-ai/sdk@^1.4.0` / `@opencode-ai/plugin@^1.4.0`.
- SDK 升级至 1.4.0。

- **`maxContinuations` default raised** from 5 to 100 (configurable up to 500).
- 自动续跑上限默认 5→100，可配置至 500。

- **settle delay gate**: 150ms delay after `session.idle` before injecting
  continuation, preventing double-fire in OpenCode v1.15.0+. Pattern from
  oh-my-openagent's prompt-async-gate.
- 闲置事件后 150ms 沉降延迟，防止 v1.15.0 事件系统重复触发。

- **5-preset model system**: free / ds-first / openai / openai-go / custom.
  `/ol-preset-free`, `/ol-preset-ds-first`, `/ol-preset-openai`,
  `/ol-preset-openai-go`, `/ol-preset-custom` explicit subcommands.
- 五套模型预设系统。

- **`load_agent_instructions` tool**: main agent reads subagent prompts
  without spawning child sessions.
- 子代理提示词读取工具。

### Docs / 文档

- Complete bilingual README in English (`README.md`) and Chinese
  (`README.zh-CN.md`).
- AI-agent-friendly install command in README (`curl` + install guide).
- Cleaned up 7 development-artifact markdown files.
- 完整双语 README + AI 可读的 curl 安装命令。

## v1.0.22 - 2026-05-11

### Fixed / 修复

- Fixed thinking-language hook: previously only matched exact `deepseek-chat`/
  `deepseek-reasoner` names, missing newer models like `deepseek-v4-pro`.
  Rewritten to use provider-aware pattern matching covering all major Chinese
  models (deepseek, glm, kimi, mimo, qwen, doubao, minimax) and foreign models
  (claude, gpt, gemini, grok, mistral).
- 修复思考语言 hook：之前只匹配精确的 `deepseek-chat`/`deepseek-reasoner` 名称，
  遗漏了新模型 `deepseek-v4-pro`。重写为 provider 感知模式匹配，覆盖所有主流国模
  （deepseek/glm/kimi/mimo/qwen/doubao/minimax）和海外模型。

- Token economics optimization: Chinese models → Chinese thinking (cheaper tokens),
  foreign models → English thinking (cheaper tokens). Uses three-hook coordination
  (messages.transform → language detection, chat.params → model capture,
  system.transform → injection).
- Token 经济学优化：国模 → 中文思考（token 更廉），海外模型 → 英文思考
  （token 更廉）。三 hook 协作。

## v1.0.21 - 2026-05-11

### Added / 新增

- Added `load_agent_instructions` tool — allows the main agent to read subagent
  system prompts and workflows without spawning child sessions. Supports all
  15 agents (explorer, librarian, oracle, designer, fixer, observer, council,
  councillor, metis, momus, multimodal-looker, reviewer, deep-worker, prometheus,
  atlas).
- 新增 `load_agent_instructions` 工具 — 允许主代理读取子代理的系统提示词和
  工作流程，无需启动子会话。支持全部 15 个代理。

### Changed / 变更

- Three primary orchestrators (orchestrator, bio-orchestrator, chem-orchestrator)
  now have `save_plan` tool awareness and @prometheus delegation guidance, enabling
  them to persist structured plans to `.opencode/extendai-lab/plans/` for
  cross-session continuity.
- 三个主协调者（工程、生物、化学）现在可以感知 `save_plan` 工具和 @prometheus
  委派，能将结构化计划持久化到 `.opencode/extendai-lab/plans/` 实现跨会话连续性。

- Installed local `extendai-lab` as `file:` dependency replacing the older npm
  `oh-my-openagent` package so the current development version is loaded at
  OpenCode restart.
- 安装本地 `extendai-lab` 为 `file:` 依赖，替换旧版 npm `oh-my-openagent` 包，
  OpenCode 重启后加载当前开发版本。

### Docs / 文档

- Added Agent Instructions Tool section to README.
- Updated orchestrator prompts with prometheus agent description.
- 新增 Agent Instructions Tool 文档到 README；
- 更新协调者提示词，补充 prometheus 代理描述。

## v1.0.20 - 2026-05-10

### Changed / 变更

- Re-focused development priorities: current and future work concentrates on
  OpenCode core functionality (todo-continuation, auto-review, agent
  orchestration). OpenClaude/Codex runtime compatibility has been moved to a
  feature branch and placed on indefinite hold.
- 开发重心回归：当前及后续开发专注于 OpenCode 核心功能（todo-continuation、
  auto-review、agent 编排）。OpenClaude/Codex 运行时兼容移至 feature 分支，
  无限期搁置。

- Enhanced command execution robustness with retry logic and configurable temp
  directory handling.
- 增强命令执行健壮性：加入重试逻辑和可配置临时目录处理。

- Updated MCP server registration logic and config handling for improved
  reliability.
- 更新 MCP 服务器注册逻辑与配置处理，提升可靠性。

### Docs / 文档

- Added COMPAT_STATUS.md documenting the current state of cross-runtime
  compatibility features.
- Updated README with development status and current focus area.
- Updated CLI help text to reflect shelved compat features.
- 新增 COMPAT_STATUS.md 说明跨运行时兼容性状态；
- 更新 README 明确当前开发重心；
- 更新 CLI 帮助信息移除搁置功能的示例。

## Unreleased / 未发布

- No changes yet.
- 暂无变更。

## v1.0.19 - 2026-05-08

### Added / 新增

- Added a host-owned `document-output` foundation plus a real `save_plan` path,
  so planner-style workflows save markdown files through receipts instead of
  chat-only claims.
- 新增宿主拥有的 `document-output` 基础层与真实 `save_plan` 路径，使 planner
  类工作流通过保存回执来落盘 markdown，而不是只在对话里声称已保存。

- Added compatibility-foundation building blocks for the three primary runtimes:
  capability contracts, config priority merging, runtime isolation,
  install-plan/backup/rollback/doctor helpers, adapter skeletons, and renderer
  registry output for plugin manifests, skills, agents, commands, MCP, and
  shared-prefix snapshots.
- 新增面向三大主运行时的 compatibility foundation：capability contract、配置优先级合并、
  runtime isolation、install-plan / backup / rollback / doctor 辅助层、adapter skeleton，
  以及可输出 plugin manifest、skills、agents、commands、MCP、shared-prefix snapshot 的
  renderer registry。

- Added a host-neutral memory/evolution baseline of primitives and references:
  memory capsules, replayable summaries, handoff-related helpers, controlled
  promotion primitives, and structured reference-lesson boundaries for Hermes,
  agent-harness, oh-my-codex, and oh-my-openagent.
- 新增宿主无关的 memory / evolution 基线原语与参考边界：包括 memory capsule、
  可回放 summary、handoff 相关 helper、受控行为晋升 primitive，以及针对
  Hermes、agent-harness、oh-my-codex、oh-my-openagent 的结构化参考边界。

### Changed / 变更

- Planner defaults now use the dedicated Prometheus plan-file contract instead of
  a stale inline prompt, and `/ol-start-work` lookup now shares plan-name
  normalization with the save path.
- planner 默认 prompt 现在统一走 Prometheus 的 plan-file contract，不再使用陈旧的内联 prompt；
  同时 `/ol-start-work` 的计划名查找已与保存路径共用同一套 normalization 规则。

- Context-pressure and auto-continue reminders now have a stronger user-visible
  baseline, while auto-review re-checks the earliest real user request and
  ignores fake user-shaped internal/system control text. This flow still
  requires ongoing behavior hardening in continuation/review edge cases.
- context-pressure 与 auto-continue 提醒现在具备更强的用户可见基线；auto-review
  会重新核对最早的真实用户需求，并忽略伪装成 user message 的内部/system 控制文本。
  但 continuation/review 的边界行为仍需继续加固。

- Review/validation baselines now include broader focused tests for planner,
  compat foundation, reminder flow, memory evolution, and runtime adapters while
  keeping optional SDK providers lazy and non-blocking for OpenCode-only users.
- review / validation 基线现在覆盖了 planner、compat foundation、提醒链路、memory evolution 与
  runtime adapter 的更广 focused tests，同时继续保证可选 SDK provider 保持 lazy、不会阻塞仅使用 OpenCode 的用户。

## v1.0.18 - 2026-05-07

### Added / 新增

- Added configurable subagent cost policy modes: `minimal`, `full`, `custom`,
  and `main-only`, with `minimal` as the then-current cache-sensitive default and custom
  `allowedAgents` support.
- 新增可配置的子代理成本策略模式：`minimal`、`full`、`custom` 与
  `main-only`；当时 `minimal` 作为面向缓存命中的默认模式，并支持自定义
  `allowedAgents` 白名单。

- Added complete slash-command variants for finite choices so OpenCode command
  completion can surface them directly: `/ol-subagents-M`, `/ol-subagents-F`,
  `/ol-subagents-C`, `/ol-subagents-MO`, `/ol-auto-continue-on`,
  `/ol-auto-continue-off`, `/ol-checkpoint-light`,
  `/ol-checkpoint-heavy`, and `/ol-checkpoint-resume-latest`.
- 新增有限选项的完整斜杠指令变体，方便当前 OpenCode UI 直接补全命令名：
  `/ol-subagents-M`、`/ol-subagents-F`、`/ol-subagents-C`、
  `/ol-subagents-MO`、`/ol-auto-continue-on`、`/ol-auto-continue-off`、
  `/ol-checkpoint-light`、`/ol-checkpoint-heavy` 与
  `/ol-checkpoint-resume-latest`。

### Changed / 变更

- Subagent delegation now favors stable shared-prefix snapshots for cache-friendly
  parallel child sessions and can optionally coordinate through visible
  shared-context MCP tools such as `create_session`, `add_message`,
  `get_messages`, and `search_context`.
- 子代理委派现在会优先使用稳定的 shared-prefix snapshot，以提升并行子会话的
  缓存命中率；当运行时可见 shared-context MCP 工具（如 `create_session`、
  `add_message`、`get_messages`、`search_context`）时，也会引导使用共享
  session 协同。

- Context-pressure guidance now slows down lossy compression and explicitly
  preserves key decisions, constraints, file paths, open todos, validation status,
  and user preferences before handoff/checkpoint work.
- 上下文压力提示现在会放慢有损压缩节奏，并在 handoff / checkpoint 前明确保留
  关键决策、约束、文件路径、未完成 todo、验证状态与用户偏好。

- L2/L3 pressure checkpoint recording is deduplicated by pressure bucket and made
  best-effort so durable memory writes do not repeatedly pollute storage or block
  the pressure prompt when persistence fails.
- L2/L3 压力 checkpoint 写入现在按 pressure bucket 去重，并改为 best-effort，
  避免重复污染持久化存储，也避免持久化失败阻断压力提示。

- Documentation now recommends complete command forms while retaining legacy
  parameterized commands for compatibility, and clarifies that actual subagent
  registration changes require config reload/restart.
- 文档现在推荐使用完整命令形式，同时保留旧参数命令兼容；并明确实际子代理注册
  变化需要更新配置并 reload/restart 插件。

## v1.0.17 - 2026-05-07

### Added / 新增

- Added safer manual memory preference handling with explicit write/list/delete
  commands and focused tests for workspace/repository persistence.
- 新增更安全的手动记忆偏好处理，提供明确的写入 / 列出 / 删除命令，并补充 workspace / repository 持久化测试。

- Added a minimal allowlisted auto-preference capture path for approved batch
  summaries, limited to low-risk workflow/tooling patterns.
- 新增一条最小自动偏好沉淀链路：仅从已批准批次 summary 中提取低风险的流程 / 工具偏好白名单模式。

### Changed / 变更

- Manual and automatic preference capture now reject emotional or personality
  judgments instead of storing them as memory.
- 手动与自动偏好沉淀现在都会拒绝情绪化或人格判断类内容，而不会把它们写入记忆。

- Repository preference deletion now preserves shared knowledge/pattern entries
  until the last duplicate preference is removed.
- repository 级偏好删除现在会在最后一个重复偏好被删除前保留共享 knowledge / pattern，避免过早清除共用记忆痕迹。

## v1.0.16 - 2026-05-07

### Breaking / 破坏性变更

- Removed all legacy `openagent-labforge` fallback paths, config basenames,
  state directories, bin alias, schema file, and example file. The planned
  compatibility window has closed.
- 移除所有 `openagent-labforge` 旧名 fallback 路径、配置名、状态目录、
  bin 别名、schema 文件和示例文件。兼容窗口按计划关闭。

### Added / 新增

- Added manual memory commands for safe preference capture and deletion:
  `/ol-memory-write`, `/ol-memory-list`, and `/ol-memory-delete`.
- 新增手动记忆命令：`/ol-memory-write`、`/ol-memory-list`、`/ol-memory-delete`，用于安全写入、查看和删除偏好记忆。

- Added manual preference persistence across workspace/repository memory, with
  explicit rejection of emotional or personality judgments.
- 新增手动偏好记忆在 workspace / repository 层的持久化，并明确拒绝情绪化或人格判断类内容。

## v1.0.15 - 2026-05-07

### Added / 新增

- Added a non-pressure batch-summary memory write path so approved work batches now
  persist concise completion summaries into session, workspace, repository,
  conversation, and global memory layers.
- 新增一条非 pressure 的 batch-summary 记忆写入路径：已批准的工作批次现在会把简洁完成总结持久化到 session、workspace、repository、conversation 与 global memory 层。

### Changed / 变更

- High-pressure auto-review now requires a restart-safe handoff when approving a
  batch, so L2/L3 sessions cannot end with a shallow summary only.
- 高压 auto-review 在批准批次时现在会强制要求 restart-safe handoff，因此 L2/L3 会话不能只用浅层总结就结束。

- Pressure-aware continuation, auto-pause persistence, review outcome memory,
  and approved batch summaries are now connected into the same todo/review/
  checkpoint chain instead of being separate partial flows.
- pressure-aware continuation、auto-pause 持久化、review outcome memory 与批准批次 summary 现在被接进同一条 todo/review/checkpoint 主链路，而不再是彼此割裂的局部流程。

## v1.0.14 - 2026-05-07

### Added / 新增

- Context-pressure monitoring now uses the real provider/model context limit
  reported by OpenCode, supports configurable engineering/bio L1/L2/L3 ratios,
  and records pressure-triggered checkpoints into session, workspace,
  repository, conversation, and global repository memory.
- 上下文压力监控现在基于 OpenCode 实际报告的 provider/model context limit，支持可配置的 engineering/bio L1/L2/L3 比例，并将压力触发的 checkpoint 写入 session、workspace、repository、conversation 与 global repository memory。

- Added focused tests for threshold overrides, pressure-driven forcing, and the
  new memory-writing paths.
- 为阈值覆盖、压力驱动 forcing、以及新的记忆写入链路补充了聚焦测试。

### Changed / 变更

- L2/L3 pressure now triggers checkpoint-first continuation in auto mode instead
  of only passive prompt hints. When no compression plugin is active, the agent
  is guided toward concise summary/handoff/restart-safe behavior rather than
  pretending compression happened.
- L2/L3 压力现在会在自动模式中触发 checkpoint-first continuation，而不再只是被动提示。若当前没有压缩插件，系统会引导 agent 转向简洁 summary / handoff / restart-safe 行为，而不是假装已经完成压缩。

- Review outcomes and auto-pause reasons are now persisted into cross-session
  memory layers, and auto mode no longer silently reports “no incomplete todos”
  when todo verification itself fails.
- review 结果与 auto-pause 原因现在会写入跨会话记忆层；当 todo 校验本身失败时，自动模式也不再误报 “no incomplete todos”。

- High-pressure review now requires a restart-safe handoff on approve, and
  approved batch summaries are persisted into session/workspace/repository/
  conversation/global memory as a non-pressure write path.
- 高压 review 现在会在 approve 时强制要求 restart-safe handoff；而且已批准批次的 summary 也会作为一条非 pressure 写入路径，被持久化到 session/workspace/repository/conversation/global memory。

- Restored `engineer` as the default agent. Added `defaultAgentName` for the
  actual default-agent fallback, kept `defaultVisibleAgent` as a compatibility
  alias during migration, and introduced `preferredVisibleAgent` to control UI
  prominence/order without changing `default_agent`.
- 恢复 `engineer` 为默认 agent。新增 `defaultAgentName` 作为真正的默认 agent 回退配置，保留 `defaultVisibleAgent` 作为迁移期兼容别名，并新增 `preferredVisibleAgent` 用来控制 UI 中谁更突出/更靠前，而不改变 `default_agent`。

## v1.0.13 - 2026-05-07

### Added / 新增

- Added a minimal DeepSeek-TUI install/uninstall workflow in the CLI. The
  adapter can now write and remove a small managed command pack and bundled
  skill pack under `~/.deepseek/`, tracked by a manifest with ownership markers
  and hashes.
- 新增 DeepSeek-TUI 最小安装/卸载流程。CLI 现在可以在 `~/.deepseek/` 下写入并移除一组受管 command 与小型 skill pack，并通过 manifest、ownership marker 与 hash 进行跟踪。

- Added a standardized diagnostics strategy module to the engineering module
  docs, formalizing: use LSP when available, otherwise use the language's own
  diagnostics/checkers, then layer tests/build/runtime verification on top.
- 新增标准化 diagnostics strategy 模块文档，明确诊断策略：有 LSP 时优先用 LSP；没有时使用语言自身的诊断/检查链；再叠加 tests/build/runtime 验证。

### Changed / 变更

- Switched the default visible expert from `engineer` to `bio-analyst`. The
  engineering path remains available, but the product now opens with the
  biological-science expert visible by default.
- 将默认可见专家从 `engineer` 调整为 `bio-analyst`。工程主线仍然可用，但产品现在默认先显示生物科学主专家。

- Clarified DeepSeek-TUI adapter scope in README/install docs: current support is
  limited to basic command/skill file installation and safe uninstall, while
  MCP/hooks/runtime integration remain future work.
- 在 README/安装文档中进一步明确 DeepSeek-TUI adapter 的当前范围：本版只支持基础 command/skill 文件安装与安全卸载，MCP/hooks/runtime 集成仍留待后续版本。

## v1.0.12 - 2026-05-06

### Added / 新增

- Added a machine-readable bio skills catalog pipeline. The build now generates
  `resources/bioSkills/catalog.json`, so the bio skill system has a lightweight
  registry/catalog layer instead of relying only on recursive category scans.
- 新增 machine-readable 的 bio skills catalog 流程。构建阶段现在会生成
  `resources/bioSkills/catalog.json`，让 bio skill 系统具备轻量 registry/catalog
  层，而不再只依赖递归扫描分类目录。

### Changed / 变更

- Enriched bio skill metadata extraction with `toolType` and `primaryTool`, and
  expanded category catalog summaries to include representative skills and tool
  families.
- 扩展 bio skill 元数据提取：新增 `toolType` 与 `primaryTool`，并让分类 catalog
  摘要包含代表性 skill 和工具族信息。

- `scanBioSkillsCatalog()` now prefers a generated `catalog.json` and only falls
  back to on-disk scanning when the generated catalog is unavailable.
- `scanBioSkillsCatalog()` 现在优先读取生成好的 `catalog.json`，只有在 catalog
  不存在时才回退到磁盘扫描。

- Added focused tests for the new bio catalog metadata and generated catalog
  read/build flow.
- 为新的 bio catalog 元数据与生成 catalog 读写流程补充了聚焦测试。

## v1.0.11 - 2026-05-06

### Added / 新增

- Added a small new research-design skill layer under the existing
  `experimental-design` category:
  `research-question-framing`, `hypothesis-structuring`, and
  `validation-strategy`.
- 在现有 `experimental-design` 分类下新增一小组研究设计 skills：
  `research-question-framing`、`hypothesis-structuring`、
  `validation-strategy`。

### Changed / 变更

- Upgraded `bio-analyst` from a narrower bioinformatics operator framing toward a
  broader biological-science expert role with stronger support for experimental
  design, hypothesis formation, study strategy, and validation planning.
- 将 `bio-analyst` 从较窄的生信执行者定位，补强为更广义的生物科学主专家，增强对实验设计、假设形成、研究策略与验证规划的支持。

- Calibrated expert prompts so they keep disciplinary bias without becoming a
  rigid identity lock, reducing the risk of over-biasing large models.
- 调整专家提示词：保留学科偏向，但避免刚性身份锁死，降低对大模型造成过度偏置的风险。

- Kept the experimental computational chemistry agent code in-repo but disabled
  it from registration and public docs for this release; chemistry overlap is
  currently handled through the existing `chemoinformatics` skills.
- 本版保留了实验性的计算化学 agent 代码，但不注册、不对外显示；当前 chemistry overlap 仍通过现有 `chemoinformatics` skills 处理。

## v1.0.9 - 2026-05-06

### Added / 新增

- Added DeepSeek-TUI adapter groundwork with TypeScript manifest/file-naming
  helpers and tests. The adapter is documented as a file/MCP/skill projection,
  not a first-class runtime plugin.
- 新增 DeepSeek-TUI adapter 基础结构，包括 TypeScript manifest/file-naming helper 与测试。文档明确说明该 adapter 是 file/MCP/skill 投影，不是一等 runtime plugin。

- Added bilingual host-specific documentation for OpenCode and DeepSeek-TUI, plus
  architecture notes for host adapters, discipline packs, and repository rename
  planning.
- 新增 OpenCode 与 DeepSeek-TUI 的中英文宿主文档，并补充 host adapter、discipline pack、仓库改名计划等架构说明。

- Added GitHub issue templates and bilingual contributing guides.
- 新增 GitHub issue templates 与中英文贡献指南。

### Changed / 变更

- Documented `openagent-labforge-bio` as a historical repository name. The
  product/package remains `openagent-labforge`; bio is now framed as the first
  optional discipline pack rather than the product boundary.
- 将 `openagent-labforge-bio` 明确记录为历史仓库名。产品/package 仍为 `openagent-labforge`；bio 被定位为第一个可选 discipline pack，而不是产品边界。

- Clarified generated DeepSeek-TUI file naming: command files should use
  `ol-*.md` to preserve slash command names, while non-command managed Markdown
  assets may use the `.ol.md` suffix for human-readable ownership.
- 明确 DeepSeek-TUI 生成文件命名：command 文件使用 `ol-*.md` 以保留 slash command 名；非 command 的受管 Markdown 资产可使用 `.ol.md` 后缀作为人类可读的 ownership 标记。

## v1.0.8 - 2026-05-05

- Fixed the default agent regression introduced by display-name migration: the
  plugin now defaults OpenCode to visible `engineer` instead of hidden internal
  `orchestrator`, preventing fallback to the bio-specific agent.
- 修复 display-name 迁移引入的默认代理回归：插件现在将 OpenCode 默认代理设置为可见的 `engineer`，而不是隐藏的内部 `orchestrator`，避免回退到生物信息学专用代理。

- Made `semantic_scholar_fastmcp` opt-in instead of starting by default. Logs
  showed `uvx`/FastMCP could continue initializing after OpenCode's 60s MCP SDK
  initialize request timeout and fail with `MCP error -32001` on restarts; users
  can still enable it explicitly after preparing a stable local uv/Python cache.
- 将 `semantic_scholar_fastmcp` 改为显式启用，而不是默认启动。日志显示 `uvx`/FastMCP 在 OpenCode 的 60 秒 MCP SDK 初始化请求超时后仍继续启动，并可能在重启后报 `MCP error -32001`；用户仍可在本地 uv/Python 缓存稳定后手动启用。

## v1.0.7 - 2026-05-05

### Changed / 变更

- Standardized LabForge slash commands around the `ol-` prefix to reduce
  collisions with other OpenCode plugins. Primary commands now include
  `/ol-preset`, `/ol-auto-continue`, `/ol-interview`, `/ol-ralph-loop`,
  `/ol-cancel-ralph`, and `/ol-stop-continuation`; selected legacy hook command
  names remain accepted for compatibility.
- 统一 LabForge 斜杠指令使用 `ol-` 前缀，降低与其他 OpenCode 插件发生指令冲突的概率。主要指令包括 `/ol-preset`、`/ol-auto-continue`、`/ol-interview`、`/ol-ralph-loop`、`/ol-cancel-ralph`、`/ol-stop-continuation`；部分旧的 hook 型无前缀指令仍保留兼容入口。

- Added plain-English agent display names for mythological/internal roles while
  keeping internal IDs stable: `engineer` (`orchestrator`), `planner`
  (`prometheus`), `executor` (`atlas`), `bio-analyst` (`bio-orchestrator`),
  `requirements-analyst` (`metis`), and `plan-reviewer` (`momus`).
- 为神话名/内部名 agent 增加更易懂的英文显示名，同时保持内部 ID 兼容：`engineer` (`orchestrator`)、`planner` (`prometheus`)、`executor` (`atlas`)、`bio-analyst` (`bio-orchestrator`)、`requirements-analyst` (`metis`)、`plan-reviewer` (`momus`)。

## v1.0.6 - 2026-05-04

### Added / 新增

- Added runtime-path hygiene for image attachments: saved user image attachments
  now live under `.opencode/openagent-labforge/images/`, alongside other
  plugin-owned project state.
- 新增图片附件运行时路径治理：用户图片附件现在保存到 `.opencode/openagent-labforge/images/`，与其他插件自有项目状态保持一致。

- Added `CHANGELOG.md` with bilingual release history and historical notes for
  earlier internal versions.
- 新增中英文 `CHANGELOG.md`，补全发布历史，并对早期内部版本进行历史补记。

- Added YABBY figure QA notes as representative visual QA cases for future
  figure-polishing work.
- 新增 YABBY 图组 QA 记录，作为后续图像优化工作的典型视觉 QA 案例。

### Changed / 变更

- Tightened external-path media discovery permissions: `media_inventory` still
  asks OpenCode for the exact target path, but no longer offers sticky `always`
  permission for paths outside the current session directory.
- 收紧外部路径媒体扫描权限：`media_inventory` 仍会向 OpenCode 申请精确目标路径读取权限，但对于当前 session 目录之外的路径，不再提供持久化 `always` 授权选项。

- Added `getProjectImagesDir()` so plugin-owned image runtime files share the
  same `.opencode/openagent-labforge/` namespace as checkpoints, memory, and
  session state.
- 新增 `getProjectImagesDir()`，使插件自有图片运行时文件与 checkpoint、memory、session state 一样统一放在 `.opencode/openagent-labforge/` 命名空间下。

### Planned / 计划

- SVG-aware media QA and visual polishing workflows for bioinformatics figures,
  with Chrome/Chromium browser rendering as the primary verification path.
- 面向生物信息学图表的 SVG-aware 媒体 QA 与视觉美化流程，以 Chrome/Chromium 浏览器渲染作为主要验证路径。

- Preserve original SVG files as source artifacts. Any polished SVG should be
  derived from the original SVG code, written as a separate output, and must not
  change the scientific meaning of the figure.
- 原始 SVG 作为源码产物保留。所有美化版 SVG 都应基于原始 SVG 代码调整，输出为独立文件，并且不能改变图表的科学含义。

- Extend the existing image/PDF QA workflow for PNG/JPG figures generated by R,
  Python, or bioinformatics packages: inspect the rendered image first, then fix
  the upstream R/Python plotting code when visual quality is poor.
- 加强现有图片/PDF QA：对于 R、Python 或生物信息学包直接生成的 PNG/JPG，先读图检查视觉质量，再回改对应的 R/Python 绘图代码。

- Add figure readability principles for matrices, heatmaps, sequence annotation
  blocks, and any colored or grayscale cell-like figure with text overlays. Text
  overlays should adapt to the local fill color: use light text on dark
  blue/red/purple/black/gray backgrounds, dark text on pale yellow/light
  blue/white backgrounds, and switch text color according to luminance, grayscale
  level, or palette position when gradients mix light and dark cells.
- 增加矩阵图、热图、序列标注色块图，以及所有带文字叠加的彩色/灰阶色块图可读性原则：色块上的文字应根据局部背景颜色自动调整；深蓝、深红、深紫、黑色、深灰等深色背景使用浅色/白色字体，浅黄、浅蓝、白色等浅色背景使用深色字体；对于同时包含浅色和深色的渐变色或灰阶色块，应根据亮度、灰阶深浅或色板位置切换文字颜色。

- Require visual QA to inspect annotation contrast, not only chart existence:
  numeric labels, p-values, cluster IDs, counts, correlation values, amino-acid
  letters, protein sequence markers, and other in-cell text must stay readable
  across the full color or grayscale range.
- 视觉 QA 不只检查图是否存在，还要检查标注对比度：数字、p-value、cluster ID、计数、相关系数、氨基酸字母、蛋白质序列标记，以及其他色块内文字，都必须在整个彩色或灰阶范围内保持可读。

- Add stronger script hygiene rules for generated analysis scripts: avoid
  accumulating one-off files such as `script_v1`, `script_improved`,
  `script_improved_2`, and require consolidation, clear naming, or cleanup after
  exploratory iterations.
- 增加脚本卫生治理：避免不断堆积 `script_v1`、`script_improved`、`script_improved_2` 这类一次性脚本；探索迭代后应合并、清晰命名或清理。

- Keep plugin-owned runtime artifacts under `.opencode/openagent-labforge/`,
  including saved image attachments, checkpoints, memory, and session runtime
  state. Continue auditing legacy root-level plugin logs and host-created
  `.opencode` dependency caches separately from plugin-owned files.
- 将插件自有运行时产物统一放到 `.opencode/openagent-labforge/` 下，包括保存的图片附件、checkpoint、memory 与 session runtime state；继续区分并审计历史根目录插件日志，以及宿主产生的 `.opencode` 依赖缓存。

- Tighten external-path media discovery permissions: `media_inventory` should
  ask OpenCode for the exact target path, but should not offer sticky “always”
  permission for paths outside the current session directory.
- 收紧外部路径媒体扫描权限：`media_inventory` 应向 OpenCode 申请精确目标路径读取权限，但对于当前 session 目录之外的路径，不应主动提供持久化的 “always” 授权选项。

- Record YABBY figure QA findings as representative visual QA cases: dense
  grayscale alignments need adaptive text contrast; crowded phylogenetic trees
  need less whitespace and fewer overlaps; circular tree tracks must avoid
  clipping; motif/domain architecture figures should balance density, legends,
  and readability.
- 将 YABBY 图组 QA 结果作为典型视觉 QA 案例记录：密集灰阶比对图需要自适应文字对比度；拥挤系统树需要减少空白和标签重叠；环形 tree tracks 必须避免裁切；motif/domain architecture 图需要平衡信息密度、图例和可读性。

## v1.0.5 - 2026-05-04

First public GitHub release for `openagent-labforge-bio`.

`openagent-labforge-bio` 的第一个 GitHub 正式发布版本。

### Added / 新增

- Added `media_inventory`, a read-only tool that discovers image and PDF files
  in a file or directory and returns absolute paths for native `read` or visual
  agent analysis.
- 新增 `media_inventory` 只读工具：可在文件或目录中发现图片/PDF，并返回绝对路径，供原生 `read` 或视觉代理分析。

- Added generic visual QA workflows for web UI screenshots, generated plots,
  scientific figures, diagrams, PDFs, reports, and error screenshots.
- 新增通用视觉 QA 工作流：覆盖 Web/UI 截图、生成图表、科研图片、流程图、PDF、报告和错误截图。

- Added the migrated `karpathy-guidelines` skill, including the original
  behavioral guidance and examples for avoiding common LLM coding mistakes.
- 完整迁移 `karpathy-guidelines` skill：包含原始行为准则和示例，用于减少常见 LLM 编码错误。

- Added `/ol-karpathy [task-or-review-target]`, a prompt command that applies
  the Karpathy guidelines to the current task or a supplied review target.
- 新增 `/ol-karpathy [task-or-review-target]` 提示词型命令：可将 Karpathy 准则应用到当前任务或指定 review 目标。

- Added release artifact verification for bundled custom skills.
- 新增发布产物校验，确保内置 custom skills 不会在打包时遗漏。

### Changed / 变更

- Improved continuation command controls:
  - `/auto-continue` now accepts explicit on/off-style arguments and rejects
    unknown arguments instead of accidentally toggling state.
  - `/stop-continuation` now hard-disables todo auto-continuation while keeping
    the broader prompt-template cleanup behavior intact.
- 改进 continuation 命令控制：
  - `/auto-continue` 支持明确的开/关参数，并拒绝未知参数，避免误触发 toggle。
  - `/stop-continuation` 会硬停止 todo auto-continuation，同时保留原提示词模板中的更广泛清理语义。

- Improved checkpoint command UX by supporting `l`/`h` shorthand alongside
  `light`/`heavy`.
- 改进 checkpoint 命令体验：除 `light`/`heavy` 外，也支持 `l`/`h` 简写。

- Updated orchestrator, planner, observer, multimodal, and bio prompts so agents
  understand when visual artifacts must be inspected rather than merely checked
  for file existence.
- 更新 orchestrator、planner、observer、multimodal、bio 等提示词，使 agent 明确：视觉产物需要真正查看内容，而不是只检查文件是否存在。

### Fixed / 修复

- Hardened auto-continuation lifecycle around review completion, explicit stop
  commands, and config auto-enable reactivation.
- 强化 auto-continuation 生命周期：覆盖 review 完成、显式停止命令、以及配置型 auto-enable 重新激活等场景。

- Prevented generated npm package tarballs from being accidentally committed by
  ignoring `*.tgz` files.
- 通过忽略 `*.tgz`，避免误提交本地生成的 npm package tarball。

### Release Notes / 发布说明

- GitHub release `v1.0.5` is source-only. No compiled package, npm tarball, or
  other generated artifact is attached; use GitHub's automatically generated
  source archives.
- GitHub Release `v1.0.5` 仅发布源码；不附带编译产物、npm tarball 或其他生成文件。请使用 GitHub 自动生成的源码压缩包。

## v1.0.4 - Historical / 历史补记

### Added / 新增

- Added BioMCP-related integration work and expanded plugin MCP registration for
  bioinformatics-oriented workflows.
- 新增 BioMCP 相关集成，并扩展插件 MCP 注册能力，以支持偏生物信息学的工作流。

### Changed / 变更

- Improved file cleanup strategies and runtime hygiene for generated logs,
  checkpoints, and plugin-owned runtime data.
- 改进文件清理策略和运行时卫生管理，包括日志、checkpoint 与插件自有运行数据。

## v1.0.3 - Historical / 历史补记

### Added / 新增

- Added checkpoint persistence and resume-oriented workflows for long-running
  coding sessions.
- 新增 checkpoint 持久化与恢复工作流，用于支持长会话和跨会话继续工作。

### Changed / 变更

- Improved global checkpoint indexing, retention, and cleanup behavior.
- 改进 checkpoint 全局索引、保留与清理行为。

## v1.0.2 - Historical / 历史补记

### Added / 新增

- Added council-style multi-agent review and synthesis workflows.
- 新增 council 风格的多 agent 评审与综合输出工作流。

- Added multiplexer/tmux-style child session visibility and lifecycle handling.
- 新增 multiplexer/tmux 风格的子会话可视化与生命周期管理。

### Changed / 变更

- Improved subagent depth tracking and resumable task-session behavior.
- 改进子 agent 深度追踪与可恢复 task session 行为。

## v1.0.1 - Historical / 历史补记

### Added / 新增

- Added core agent presets, orchestration prompts, and specialist agent roles.
- 新增核心 agent preset、编排提示词与专家 agent 角色。

- Added workflow commands such as checkpoint, handoff, start-work, and
  continuation helpers.
- 新增 checkpoint、handoff、start-work 与 continuation helper 等工作流命令。

## v1.0.0 - Historical / 历史补记

### Added / 新增

- Initial `openagent-labforge` / `oh-my-opencode-slim` plugin foundation.
- 初始 `openagent-labforge` / `oh-my-opencode-slim` 插件基础版本。

- Added TypeScript/Bun build pipeline, OpenCode plugin entrypoint, CLI entrypoint,
  and baseline repository structure.
- 新增 TypeScript/Bun 构建流程、OpenCode 插件入口、CLI 入口与基础仓库结构。

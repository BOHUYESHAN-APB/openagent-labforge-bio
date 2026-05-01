# OpenAgent LabForge Bio Complete Product Architecture

日期：2026-04-30  
状态：完整功能设计稿 / 实现前总蓝图  
目标许可证：Apache-2.0

## 1. 产品定义

`openagent-labforge-bio` 是一个面向 OpenCode 的插件体系，目标不是成为最重、最强流程约束的 agent methodology 产品，而是成为一个：

- **主代理优先**
- **token 友好**
- **成本敏感**
- **适合国内用户模型生态**
- **支持工程任务与生物信息学任务混合协作**
- **具有结构化上下文继承、可控压缩和扩展 MCP 能力**

的高性价比插件。

这不是 `Omo` 的简单换皮，也不是 `superpowers` 那类 methodology-first 产品。它的核心目标是：

> 在尽量低的模型成本和上下文成本下，把复杂任务稳定完成，并且对 bioinformatics 这类非纯代码专业场景同样友好。

## 2. 非目标

本项目明确**不追求**以下目标：

1. 不做 Codex-first 产品
2. 不做重型企业开发流程产品
3. 不做必须依赖多 provider、多独立 agent model 才能工作的插件
4. 不做把系统控制 prompt 混入 user message 的插件
5. 不做过度依赖大量强制 skills 和强制 workflow 的高 token 开销系统
6. 不做直接复制非 Apache-2.0 / MIT 兼容代码的拼装式工程

## 3. 许可证与参考边界

## 3.1 最终许可证

本项目最终开源目标协议为：

- `Apache-2.0`

这是项目级硬约束。

## 3.2 参考源的可吸收边界

### 可吸收代码 / 结构 / 思路的来源

- 当前仓库中的 `OMOS` 基底代码
- `OLD`
- `OLD-2`
- MIT 协议项目
  - 例如 `opencode-magic-context`
  - 例如 `superpowers` 的部分 skills / methodology 表达

### 只能吸收思路、不能碰代码的来源

- `opencode-dynamic-context-pruning`（DCP）

原因：

- 该线不是我们最终许可证策略可安全直接吸收的代码来源
- 后续只保留：
  - 压缩概念
  - prompt 设计约束
  - range/message compression 设计启发

明确规则：

- **DCP 只保留思路，绝不复制代码**

## 4. 平台策略

## 4.1 主平台

本项目只主打：

- **OpenCode**

原因：

1. OpenCode 插件与 hook 体系更适合复杂运行时改造
2. 更适合我们做：
   - bioinformatics
   - 多专业协作
   - MCP 编排
   - context / memory / compression
3. 比单纯代码导向产品更适合“工程 + 文档 + 生物 + 搜索 + PDF + 多模态”混合场景

## 4.2 与 Codex 的关系

我们不做：

- Codex-first 插件
- 单独 Codex 版本主架构

但我们会在 README 中明确说明：

- 如果用户希望在 OpenCode 里继续使用 Codex，可搭配 OpenCode 的 Codex provider 插件，例如：
  - `withakay/opencode-codex-provider`

也就是说：

- 我们服务 OpenCode
- Codex 用户通过 OpenCode provider 适配层使用我们

## 5. 产品哲学

## 5.1 主代理优先

主代理必须能够直接做真实工作，而不是只负责发任务。

具体含义：

- 主代理先理解任务
- 主代理先读关键上下文
- 主代理保有主线执行权
- 子代理只在明确有收益时才启用

## 5.2 成本友好优先于炫技

本产品的关键差异不在于“最多功能”，而在于“单位 token 成本下更高的完成度”。

因此：

- 少做无效 delegation
- 少做重型 workflow 注入
- 少复制上下文
- 少反复读取大文件和长文档
- 少让模型背负不必要的 methodology 成本

## 5.3 用户消息纯净原则

用户消息必须只代表用户本意。

禁止：

- 把 runtime prompt prepend/append 到 user text
- 把 continuation 伪装成用户消息
- 把系统控制信息挂在用户输入通道中等待 undo 回流

## 5.4 结构化工作记忆优先

上下文继承与压缩都应优先传递“结构化工作记忆”，而不是冗长聊天原文。

## 5.5 Bio 是一等能力

生物信息学不是附属插件包，而是产品级工作路径。

## 6. 面向国内用户的模型策略

## 6.1 目标用户模型现实

本产品主要面向国内用户，因此模型策略必须考虑：

- 成本敏感
- provider 混搭常见
- 开源模型部署普遍
- DeepSeek 路线非常重要
- 用户不愿维护复杂 agent×model 矩阵

## 6.2 主推三套模型路线

### 方案 A：纯 OpenAI

定位：

- 最稳定
- 最省心
- 默认保底方案

适合：

- 已有 OpenAI / Codex 使用习惯的用户
- 想要最少配置成本的用户

### 方案 B：OpenAI + DeepSeek

定位：

- 主推高性价比方案
- 兼顾质量与成本

适合：

- 大多数国内用户

建议职责：

- 高判断任务：OpenAI
- 大量执行 / 辅助工作：DeepSeek

### 方案 C：纯 DeepSeek

定位：

- 最低成本完整方案
- 必须认真支持的一等路线

原因：

- DeepSeek 具备强推理模型
- 具备快速模型
- 正在具备更完整的视觉能力
- 有潜力单 provider 覆盖：
  - 高级推理
  - 快速执行
  - 视觉理解

## 6.3 模型策略约束

系统必须满足：

1. 单主模型即可完整运行
2. 子代理默认继承主模型
3. 独立 agent model 是增强项，不是默认前提
4. 混合 provider 不可用时必须优雅回落
5. 不能因为某个子代理模型不可用而导致整条任务失败

## 7. 分发与安装策略

## 7.1 分发形式

推荐策略：

- **OpenCode-only**
- **npm 包发布**
- **bunx/npx 作为主要安装入口**

## 7.2 用户入口

推荐用户入口应是：

- `bunx ... install`
- `bunx ... setup`
- `bunx ... doctor`

也就是说：

- 底层是 npm 包
- 用户体验是 npx/bunx 风格安装

## 7.3 不做的分发方式

- 不做平台专属二进制主分发
- 不做单独 Codex 插件分发主线
- 不做多架构复杂产物矩阵作为第一优先级

## 8. 系统总架构

## 8.1 六层架构

### Layer 1: OpenCode Runtime Base

来源：当前 `OMOS` 基底

内容：

- agent 注册
- hook 管线
- tool 管线
- multiplexer
- council
- session manager
- CLI / schema / skills 打包

### Layer 2: Runtime Governance

新设计内容：

- message channel policy
- main-agent-first model resolver
- delegation guard
- agent availability preflight

### Layer 3: Context And Memory

新设计内容：

- context pressure monitor
- local capsule
- checkpoint
- context handoff packet
- session facts / memory layering

### Layer 4: Bio Capability Layer

新设计内容：

- bio route detection
- bio prompt augmentation
- bio artifact workflow
- bio context discipline

### Layer 5: MCP And Knowledge Layer

新设计内容：

- 原生 MCP
- 扩展 academic/browser/search MCP
- provider-aware MCP policy

### Layer 6: Product Surface

内容：

- README
- preset docs
- install/setup/doctor
- license / schema / branding

## 9. 核心模块设计

## 9.1 `message-channel-policy`

职责：定义系统中所有 prompt/control 信息应该走什么通道。

### 通道定义

#### User Message

只允许承载：

- 用户原始输入
- 用户上传附件的语义载体
- 用户真实表达的任务目标与限制

禁止承载：

- continuation directive
- keyword mode prompt
- phase reminder
- compression directive
- system hygiene prompt

#### System Message

允许承载：

- orchestrator prompt
- runtime mode prompt
- compression / context pressure directive
- reminder 类系统级提示
- bio route augmentation

#### Internal Hidden Prompt

允许承载：

- auto-continue inject
- slash command direct response
- noReply notification
- internal operational hint

### 第一批需要整改的现有模块

1. `phase-reminder`
2. `todo-hygiene`
3. keyword mode injection
4. 未来的 compression directive

## 9.2 `main-agent-first resolver`

职责：统一模型选择策略。

### 目标行为

1. 主代理模型是默认真实执行模型
2. 子代理如无显式独立配置，继承主代理模型
3. 子代理若配置独立模型，必须先 availability preflight
4. 不可用时直接回退到主模型执行

### 内部能力

- `resolvePrimaryExecutionModel()`
- `resolveDelegatedExecutionModel(agentName)`
- `isModelUsable(modelId)`
- `fallbackToPrimaryModel()`

## 9.3 `delegation-guard`

职责：在 task/delegation 发生前做收益与安全性判断。

### 判断维度

- 是否真的值得委托
- 是否已有复用 session
- 目标 agent 独立模型是否可用
- 是否需要 handoff packet
- 是否会造成无意义 token 消耗

### 原则

- delegation 是增益机制，不是默认动作

## 9.4 `runtime-keyword-modes`

职责：承载 `ultrawork` / `search` / `analyze` 等模式词。

### 设计原则

- 检测发生在用户输入层
- 注入发生在 system/internal 通道
- 不改写原始用户文本
- undo 不回流系统提示

### 参考来源

- Omo / OLD / OLD-2 的 detection 思路
- 但实现必须重写

## 9.5 `todo-continuation runtime`

职责：在 todo 未完成时进行低扰动自动续做。

### 目标行为

- 只对主代理 session 生效
- 可显式开关
- 有 cooldown
- 尊重用户停止意图
- 最后一条 assistant 为问题时停止
- 不污染 user message

### 实现策略

- 以 OMOS 当前 `todo-continuation` 为主骨架
- 吸收 OLD / OLD-2 的：
  - stop intent detection
  - repeated cancellation handling
  - userStopped state

### 必须移除的旧做法

- 把 hygiene instruction 追加到 user text

## 9.6 `context-handoff-packet`

职责：把主代理工作记忆结构化交给子代理。

### 推荐字段

- `task_summary`
- `user_intent`
- `constraints`
- `prior_findings`
- `read_artifacts`
- `relevant_paths`
- `open_questions`
- `do_not_repeat`

### 设计原则

- 摘要优先
- 原文按需回读
- 用最小信息支撑 delegation
- 避免复制整段父会话

## 9.7 `context-pressure-checkpoint`

职责：提供低成本上下文治理。

### 核心目标

- 使用 OpenCode 原生 context stats
- 不猜 token
- 在上下文压力升高时主动收敛上下文成本

### 组成部分

1. Context Pressure Monitor
2. Local Capsule
3. Pressure State
4. Session Checkpoint
5. Compression Levels

### 分级建议

- `L0`：实时清理 / 去重 / stale output trim
- `L1`：轻量微修剪
- `L2`：checkpoint + capsule 强化
- `L3`：更强结构化压缩与跨会话恢复准备

### 参考来源

- `OLD/src/hooks/context-window-monitor.ts`
- `opencode-magic-context` 的：
  - compartment/fact/memory 分层
  - cache-aware deferred 操作
  - 独立 compressor pass
- `DCP` 的压缩 prompt 约束思路

### 硬限制

- 不复制 DCP 代码

## 9.8 `bio-capability-layer`

职责：让 bio 成为一级工作路径。

### 组成部分

1. Bio Task Detection
2. Bio Prompt Augmentation
3. Bio Artifact Workflow
4. Bio MCP Policy
5. Bio Skill Loading Strategy

### 设计原则

- 不默认塞满全部 bio 技能内容
- 不让 bio 能力变成高上下文负担
- 优先按需加载
- 优先结构化摘要和 artifact 索引

## 10. Agent 体系设计

## 10.1 主代理角色

当前产品不应该回到 Omo 那种神话命名体系作为主表述，而应保持功能导向。

建议继续基于 OMOS 功能型 agent 体系演化。

### 主代理

- `orchestrator`

职责：

- 理解任务
- 建 todo
- 直接执行主线
- 决定是否 delegation
- 负责验证与收口

### 子代理

- `explorer`
- `librarian`
- `oracle`
- `designer`
- `fixer`
- `observer`
- `council`

### 额外建议

未来 bio 能力不一定要先做成单独可见 agent，也可以先作为：

- bio route augmentation
- bio skills / MCP policy
- bio task mode

后续再评估是否需要独立 `bio-worker`

## 11. MCP 体系设计

## 11.1 原生 MCP

保留 OpenCode/OMOS 当前基础：

- `websearch`
- `context7`
- `grep_app`

## 11.2 扩展 MCP

优先从 `OLD-2/src/mcp/index.ts` 迁移：

- `arxiv_mcp`
- `browser_puppeteer`
- `chrome_devtools_mcp`
- `fetch_browser`
- `deepwiki_mcp`
- `open_websearch_mcp`
- `paper_search_mcp`
- `semantic_scholar_fastmcp`

### 默认策略建议

- 默认开启：
  - 原生 3 MCP
  - `semantic_scholar_fastmcp`
- 默认关闭：其余扩展 MCP

## 11.3 MCP 权限策略

需要围绕 agent lane 做权限控制：

- 工程 lane
- 文档 lane
- 学术检索 lane
- 浏览器 lane
- bio lane

## 12. 技能体系设计

## 12.1 技能定位

技能不是主产品骨架，而是增强层。

### 技能来源策略

- 保留 OMOS 当前技能体系
- 少量借鉴 `superpowers` 的基准 skills 表达方式
- bio 技能按需分层加载

## 12.2 技能优先级

建议保留：

- project > user > bundled

## 12.3 不做的事

- 不把整个产品做成 skills-first methodology 系统

## 13. 用户工作流设计

## 13.1 正常工程工作流

1. 用户提出任务
2. 主代理理解任务并读关键上下文
3. 需要时写 todo
4. 仅在收益明确时启用子代理
5. 如 todo 未完成且允许 auto-continue，则低扰动续做
6. 收口验证

## 13.2 Bio 工作流

1. 用户提出 bio / 论文 / 流程 / 数据分析需求
2. 系统检测 bio scope
3. 主代理加载 bio route augmentation
4. 优先使用 bio 相关 MCP / artifacts / skill strategy
5. 把结果以结构化证据和可追踪路径返回

## 13.3 长会话工作流

1. 正常工作
2. context pressure 升高
3. 系统进行轻量治理
4. 必要时 checkpoint / capsule
5. delegation 时使用 handoff packet
6. 会话长期保持而不严重失控

## 14. README 需要表达的关键信息

README 未来必须讲清楚：

1. 这是 OpenCode-only 插件
2. 主打低成本 / token 友好 / 国内用户模型路线
3. 推荐三套模型预设：
   - OpenAI
   - OpenAI + DeepSeek
   - 纯 DeepSeek
4. Codex 用户推荐通过 OpenCode provider 适配层接入
5. continuation / mode prompt 不污染用户消息
6. 支持结构化 context handoff 与压缩治理
7. bio 是一级能力

## 15. 实施阶段

## Phase 1: 产品外壳与运行时通道治理

1. 去身份化
2. README 重写
3. LICENSE 改为 Apache-2.0
4. 建立 message-channel-policy
5. 修 `phase-reminder`
6. 修 `todo-hygiene`

## Phase 2: 主代理优先与模型策略落地

7. 实现 main-agent-first resolver
8. 实现 delegation-guard
9. 实现 availability preflight
10. 配置三套主推模型预设

## Phase 3: 上下文治理能力回归

11. 引入 context pressure/capsule/checkpoint
12. 设计并接入 context handoff packet
13. 吸收 magic-context 的 cache-aware 思路
14. 只借 DCP 思路，不碰代码

## Phase 4: Bio 与 MCP 完整化

15. 迁移扩展 MCP registry
16. 定义 bio route / bio mode
17. 规划 bio skill bundle 渐进加载

## Phase 5: 安装与文档完善

18. npm 包元数据改造
19. bunx/npx install/setup/doctor
20. Codex 用户兼容说明
21. 国内用户模型路线文档

## 16. 最终一句话架构定义

> `openagent-labforge-bio` 是一个面向 OpenCode、主代理优先、token 友好、成本敏感、面向国内模型生态优化，并支持 bioinformatics、结构化上下文继承、可控压缩与扩展 MCP 的 Apache-2.0 插件体系。

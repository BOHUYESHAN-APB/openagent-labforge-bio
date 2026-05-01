# OpenAgent LabForge Bio Designer

日期：2026-04-30  
状态：设计稿 / 当前工作基线  
基底：`oh-my-opencode-slim`（本仓库当前根目录代码）

## 1. 目标

本项目不是继续修旧半成品，也不是回到 `opencode-workspace` 那条旧线重做。

当前明确路线是：

- 以当前仓库里的 `OMOS`（`oh-my-opencode-slim`）作为运行时基底
- 重新设计并实现 `openagent-labforge-bio`
- 把我们自己的独创能力重新加到这个基底上
- 重点加回：
  - 上下文压缩 / 检查点 / 工作记忆机制
  - 生物信息学专用能力
  - 扩展 MCP 体系
  - 更合理的 continuation 与 runtime prompt 注入机制

这份文档的目的不是直接给出最终实现细节，而是先把最基础的功能逻辑、模块边界、现存问题、目标能力和实施顺序理清楚，作为后续实现的总设计文档。

## 2. 当前基线结论

### 2.1 我们现在实际基于什么

当前仓库根目录已经是一份接近完整的 `oh-my-opencode-slim` 基底，不是空工程，也不是旧 KDCO 骨架。

当前主干模块已经具备：

- agent 注册与 orchestrator prompt 体系
- config schema / preset / fallback 链
- todo continuation
- task session manager
- multiplexer
- council
- interview / preset manager
- 内建 MCP 注册
- skills 打包与 CLI 安装

因此后续工作不是“从零搭插件”，而是在现有 OMOS 基底上做重新定向。

### 2.2 我们要加回来的内容来自哪里

本项目需要吸收三类既有资产：

1. `OMOS` 当前基底
   - 作为主要运行时框架
   - 保留其轻量化后的插件结构、session orchestration、multiplexer、task-session、council、tool 管线

2. `OLD`
   - 提供我们之前对 Omo 的重改造经验
   - 重点参考：
     - `context-window-monitor`
     - `todo-continuation-enforcer`
     - `magic-context` 工具
     - skill / skill-mcp / recall 相关能力

3. `OLD-2`
   - 提供一条基于 workspace/KDCO 的改造思路
   - 重点参考：
     - keyword-detector 的“不要污染用户消息”的设计意图
     - start-work / context-window-monitor / MCP registry 的简化实现

4. `Future/clone`
   - 提供最新参考源码与外部项目对照
   - 特别是：
     - `Future/clone/oh-my-openagent`
     - `Future/clone/oh-my-opencode-slim`
     - `Future/clone/opencode-magic-context`
     - 以及将来需要时用 `gh` 同步的上游仓库

## 3. Omo 与 OMOS 的关键差异

这一节是当前最重要的认知基线，因为后续所有设计都建立在“我们不是直接基于 Omo，而是基于 OMOS 改造”这一点上。

### 3.1 Omo 的特点

`Future/clone/oh-my-openagent` 代表的是更重、更复杂、更完整的一整套插件体系。

其特点包括：

- hook 数量更多，体系更重
  - 文档中为 `52 hooks`
- agent 命名与运行时语义更强烈地围绕 Omo/Sisyphus/Hephaestus/Prometheus/Atlas 等体系展开
- keyword detector 等机制会把模式提示直接 prepend 到用户消息文本
- continuation / runtime behavior 相关逻辑更广泛地分散在多个 hooks、managers、plugin-interface 里
- 支持更复杂的多层技能、openclaw、更多运行时兼容层

从代码层面看，Omo 的主入口是模块化分层的：

- `src/index.ts` 负责初始化 managers / tools / hooks / plugin interface
- 真正 OpenCode 对接逻辑大量下沉到 `createPluginInterface()` 等层

### 3.2 OMOS 的特点

当前仓库和 `Future/clone/oh-my-opencode-slim` 代表的是 Omo 的“轻量化收敛版”。

其特点包括：

- 结构明显更直接
- hook 数量更少，重点保留高价值机制
- 直接在 `src/index.ts` 汇总大部分注册逻辑
- agent 体系更偏功能化：
  - `orchestrator`
  - `explorer`
  - `librarian`
  - `oracle`
  - `designer`
  - `fixer`
  - `observer`
  - `council`
- continuation 已经从“强制 boulder”收敛成“orchestrator-only auto-continue”
- 已经具备 system transform 聚合能力：
  - `experimental.chat.system.transform`
  - `collapseSystemInPlace(output.system)`

### 3.3 对我们最重要的差异总结

从我们要做的设计角度，最关键的差异不是“功能多少”，而是“哪些机制已经更适合做二次设计”。

#### Omo 更重，OMOS 更适合作为新底座

原因：

- OMOS 已经把大量 Omo 的重型结构收敛掉了
- 我们更容易在 OMOS 上重新定义产品逻辑
- 不会被 Omo 那种大而全的历史包袱拖住

#### 但 OMOS 仍然保留了若干不理想机制

尤其是消息注入层面，OMOS 还没有完全达到我们要的设计标准：

1. `phase-reminder` 仍然直接改写最后一条用户消息文本
2. `todo-hygiene` 也是把提醒附着到 user message text part 上
3. continuation 虽然注入时使用 internal marker，但整体状态判断仍强依赖“最后一条外部用户消息”的追踪
4. 运行时提示与工作提示并没有完全统一成“system/hidden runtime channel”

因此：

- Omo 不是我们要直接继承的产品逻辑
- OMOS 也不是现成最终形态
- 我们要基于 OMOS 做第三次重新设计

## 4. 当前代码中已经确认的问题

### 4.1 关键词模式提示污染用户消息

在 Omo 中，`keyword-detector` 会把模式提示 prepend 到用户文本：

- 位置：`Future/clone/oh-my-openagent/src/hooks/keyword-detector/hook.ts`
- 关键行为：
  - `output.parts[textPartIndex].text = `${allMessages}\n\n---\n\n${originalText}``

这意味着：

- 用户输入被 runtime prompt 改写
- undo 时会把这些附加提示带回输入框
- 用户会看到并手动删除无关系统提示
- 即便缓存命中，也仍然有交互层污染问题

这正是我们明确要避免的行为。

### 4.2 旧 continuation 机制污染用户输入语义

在旧线和旧设计里，continuation 的核心目标是“todo 没做完就逼它继续”，但实现上容易出现：

- continuation 被当作“像用户又不像用户”的提示注入
- undo / replay / input stack 混乱
- 自动机制和真实用户消息争抢优先级

这会带来以下问题：

- 用户暂停时系统还想继续
- 用户切题时系统仍按旧 todo 推进
- 会话里“谁在说话”变得不清晰

### 4.3 OMOS 里仍有一部分“直接改用户消息”的机制

当前基底代码中已经确认：

1. `src/hooks/phase-reminder/index.ts`
   - 直接把 `PHASE_REMINDER` append 到最后一条 user text part

2. `src/hooks/todo-continuation/index.ts`
   - `todo hygiene` 会把 instruction 附加到 user message 的 text part

这些虽然发生在 `experimental.chat.messages.transform`，理论上“不显示在 UI”，但设计上仍属于“借用户消息通道承载系统控制信息”。

这不符合我们的目标模型。

### 4.4 当前 model fallback 仍然偏“agent 各自有链”

OMOS 当前已有：

- `_modelArray`
- `fallback.chains`
- `ForegroundFallbackManager`
- runtime preset override

但它的思路仍然是：

- 各 agent 可以有自己的 model chain
- 启动期和运行期分别处理 fallback

这不完全等于我们要的“默认主代理优先 + 子代理默认继承主模型”。

我们后续要做的是进一步收束：

- 主代理模型是默认真实执行模型
- 子代理如无明确独立配置且未通过 availability preflight，则复用主代理模型
- delegation 失败不能拖垮主流程

## 5. 我们要坚持的设计原则

## 5.1 主代理优先

这是新插件最重要的运行原则。

含义：

- 主代理不是只负责分发，它本身也必须能做真实工作
- 即使没有任何可用子代理独立模型，系统仍能完整完成主要任务
- 子代理是增益机制，不是硬依赖机制

这回答了一个关键问题：

### 在 ultrawork / 主编排模式下，主代理会不会自己干活？

答案应该是：会，而且默认就应该会。

主代理应具备：

- 自己理解任务
- 自己读关键代码
- 自己推进主线实现
- 在确定“交给子代理更划算”时才委托

而不是变成一个只会拆单、不会实干的壳。

## 5.2 自动 continuation 是可选推进机制，不是用户消息替身

todo 没做完时，系统可以自动续做，但必须满足：

- 不以用户消息形式注入
- 不污染用户输入框
- 不进入 undo 可恢复栈
- 不覆盖用户新意图
- 一旦主代理最后一句在问用户问题，则停止自动续做
- 一旦用户明确停止、切题、评估机制本身，则停止自动续做

## 5.3 所有 runtime control prompt 都走 system / hidden channel

需要统一搬迁的内容包括：

- continuation prompt
- phase reminder
- todo hygiene reminder
- keyword mode prompt
- 未来的 context pressure / checkpoint / handoff reminder

原则是：

- 用户消息只代表用户自己
- system 通道只承载系统控制信息
- hidden/internal message 承载运行时注入信息

## 5.4 继承的是“工作记忆”，不是聊天原文

子代理上下文继承不能粗暴复制主代理全部对话。

应该传的是结构化 packet：

- 当前任务目标
- 用户当前真实意图
- 已有结论
- 已读文档摘要
- 已知限制
- 不要重复做的事情

这既能减少 token，也能避免把噪音传给子代理。

## 5.5 Bio 是一级能力，不是附属彩蛋

`openagent-labforge-bio` 的定位决定了：

- 生物信息学不应只是几个技能包和额外 MCP
- 它应该是第一层产品能力

意味着要有：

- bio 专门 prompt / routing / context discipline
- bio 专门 MCP 组合
- bio 文档 / PDF / paper / evidence workflow
- 生物任务与工程任务的混合协作路径

## 6. 目标产品形态

## 6.1 产品定位

`openagent-labforge-bio` 是一个基于 OMOS 重新设计的 OpenCode 插件，目标是：

- 以主代理优先为核心工作模式
- 把多代理视为可选增强，而不是必经路径
- 提供结构化上下文继承
- 提供原生的 context pressure / compression / checkpoint 工作流
- 提供 bioinformatics first-class support
- 提供原生 MCP + 扩展 MCP 的统一编排

## 6.2 第一阶段产品目标

第一阶段不是“大而全重建”，而是先形成一个逻辑闭环。

第一阶段必须成立的能力：

1. 单主模型可完整运行
2. 主代理能自己完成主要任务
3. 子代理默认继承主模型
4. continuation 不污染用户消息通道
5. keyword mode / phase reminder 不污染用户消息通道
6. MCP 体系为“原生 3 个 + 扩展 MCP”
7. 设计出 context handoff packet 的类型与注入点

## 7. 目标架构

## 7.1 总体分层

建议将新插件逻辑拆为六层：

1. 基底层
   - OMOS 现有 agent / tool / hook / multiplexer / session 体系

2. 运行时治理层
   - message channel policy
   - continuation policy
   - model resolver / fallback / availability preflight

3. 上下文与记忆层
   - context pressure monitor
   - local capsule
   - checkpoint
   - context handoff packet

4. Bio 能力层
   - bio route detection
   - bio prompt augmentation
   - bio artifact handling
   - bio MCP presets / skill bundles

5. MCP 与外部知识层
   - 原生 MCP
   - 扩展 academic / browser / search MCP
   - provider-aware availability rules

6. 产品外观层
   - package naming
   - docs
   - CLI/install/config guidance

## 7.2 核心运行流

### 用户请求进入时

1. 识别当前 agent 与 session
2. 判断是否存在 mode keyword / special workflow trigger
3. 不改写用户文本本身
4. 把 runtime control prompt 注入 system / hidden channel
5. 由主代理判断：
   - 自己做
   - 委托子代理
   - 并行委托

### 主代理执行时

1. 主代理先直接理解任务与读关键上下文
2. 复杂任务写 todo
3. 如需委托：
   - 构造 context handoff packet
   - 先做 agent availability preflight
   - 目标模型不可用则降级主代理执行

### 空闲续做时

1. 触发 session.idle
2. 检查：
   - 是主代理 session
   - auto-continue 已启用
   - todo 未完成
   - 主代理最后一句不是在问用户
   - 当前没有 user abort / suppress 状态
3. 满足后通过 hidden/system prompt 续做
4. 不修改用户消息，不回流到 undo 栈

### 上下文压力升高时

1. 读取 OpenCode 原生上下文统计
2. 根据阈值触发 L1/L2/L3 策略
3. 写入本地 capsule / pressure state / checkpoint
4. 把压缩提示通过 system/internal directive 提供给模型
5. 必要时生成 handoff packet 供后续 delegation 使用

## 8. 核心模块设计

## 8.1 `message-channel-policy`

职责：统一规定哪些信息可以进入哪个通道。

规则建议：

- `user message`
  - 只保留用户原始意图和用户自己上传的内容

- `system message`
  - agent prompt
  - mode keyword prompt
  - phase reminder
  - context pressure directive
  - continuation directive

- `internal hidden message / synthetic marker`
  - 不需要在 UI 中以用户可编辑形式出现的 runtime 注入内容

它会成为后续重写这些模块的上层原则：

- `phase-reminder`
- `todo-continuation`
- keyword detector
- 未来的 compression directive

## 8.2 `main-agent-first resolver`

职责：统一主代理与子代理的模型选择策略。

目标行为：

- 默认主代理模型是唯一必要模型
- 子代理若未单独启用 model route，则默认继承主代理模型
- 若子代理配置了独立模型，需要先做 availability check
- 不可用时直接回落主代理执行，不让 delegation 整体失败

建议内部拆分：

- `resolvePrimaryExecutionModel()`
- `resolveDelegatedExecutionModel(agentName)`
- `isModelUsable(modelId)`
- `resolveFallbackToPrimary()`

## 8.3 `delegation-guard`

职责：在真正 task/delegation 之前做防护。

要做的检查：

- 子代理是否真的有必要
- 独立模型是否可用
- 当前任务是否值得拆分
- 是否已经存在可复用 session
- 是否需要 handoff packet

如果不满足条件：

- 主代理直接执行

## 8.4 `context-handoff-packet`

职责：把主代理的工作记忆结构化打包给子代理。

建议字段：

- `task_summary`
- `user_intent`
- `constraints`
- `prior_findings`
- `read_artifacts`
- `relevant_paths`
- `open_questions`
- `do_not_repeat`

建议特性：

- 摘要优先
- 原文按需回读
- 可拼接到 delegation prompt 中
- 后续可持久化到 project runtime 目录

## 8.5 `continuation-runtime`

职责：接管 todo 未完成时的自动续做逻辑。

目标行为：

- 仅主代理 session 生效
- 只在明确安全时触发
- 只使用 system / internal 注入
- 对用户 abort 和用户新意图敏感

需要替换/调整的现有点：

- 继续保留 OMOS 当前较成熟的 idle gate、cooldown、question-check、abort suppress
- 但去掉对 user text append 的依赖
- 让 reminder / hygiene 走 system 通道

## 8.6 `runtime-keyword-modes`

职责：处理 `ultrawork` / `search` / `analyze` 等模式词。

目标行为：

- 检测在用户输入层进行
- 注入在 system/hidden channel 进行
- 原始用户输入保持不变
- undo/replay 时不把系统提示词带回输入框

## 8.7 `context-pressure-and-checkpoint`

职责：把 OLD 里的上下文管理经验重新整合到新基底。

参考来源：

- `OLD/src/hooks/context-window-monitor.ts`
- `Future/clone/opencode-magic-context`

建议保留的核心能力：

- 使用 OpenCode 原生统计
- L1/L2/L3 压缩等级
- local capsule
- pressure state json
- checkpoint 文件
- 对 bio / engineering 两类任务使用不同 profile

需要调整的点：

- 旧逻辑里也有把 compression directive 插到 user message 的做法
- 新架构里应改成 system/internal channel

## 8.8 `bio-capability-layer`

职责：把 Bio 作为一级工作路径加回插件。

包括：

- bio task detection
- bio-specific prompt augmentation
- paper / PDF / supplementary material workflow
- bio skill bundle strategy
- bio evidence ledger / read artifacts summary

建议先不一开始就把所有 bio skills 全量搬进主提示，而是：

- 建立 bio 能力入口
- 先做好加载策略和命名空间
- 再逐步迁移技能包和工具链

## 9. MCP 设计

## 9.1 基线组合

当前建议采用：

- 原生 3 MCP：
  - `websearch`
  - `context7`
  - `grep_app`
- 再加上我们扩展 MCP

参考 `OLD-2/src/mcp/index.ts`，扩展项包括：

- `arxiv_mcp`
- `browser_puppeteer`
- `chrome_devtools_mcp`
- `fetch_browser`
- `deepwiki_mcp`
- `open_websearch_mcp`
- `paper_search_mcp`
- `semantic_scholar_fastmcp`

其中默认建议：

- 保留原生 3 个开启
- `semantic_scholar_fastmcp` 默认开启
- 其余扩展 MCP 默认关闭，按需启用

## 9.2 MCP 的产品定位

MCP 在新设计里不只是“工具列表扩容”，而是三类工作流基础设施：

1. 工程研发
   - context7 / grep_app / websearch

2. 学术与生物检索
   - semantic scholar / paper search / arxiv

3. 浏览器与网页抓取
   - browser / fetch / devtools / deepwiki

后续 agent 权限策略也要围绕这个分层来设计，而不是简单地一刀切。

## 10. 主代理、todo、ultrawork 的行为定义

## 10.1 主代理在 ultrawork 模式下是否自己干活

答案：必须自己干活。

新的 `ultrawork` 语义应理解为：

- 主代理进入更主动、更持续、更系统的工作状态
- 但不是“只会发 task 的总包工头模式”

它应该意味着：

- 更积极地建 todo
- 更积极地做检查和验证
- 更积极地并行调度
- 更积极地使用 context handoff packet
- 但主代理仍然保留主线执行权

## 10.2 todo 没做完能不能自动注入继续提示

答案：可以，而且应该保留这个能力。

但必须满足两个条件：

1. 只作为 runtime continuation 机制
2. 不得走用户消息通道

### 允许的做法

- system transform 注入 continuation directive
- internal text part 注入 continuation directive
- hidden synthetic prompt 注入 continuation directive

### 不允许的做法

- append 到用户消息文本
- prepend 到用户消息文本
- 伪装成新的用户消息
- 进入 undo 可恢复输入栈

## 10.3 自动续做要有哪些停止条件

建议保留或加强这些 gate：

- 未开启 auto-continue 时不触发
- 没有未完成 todo 时不触发
- 上一条 assistant 明显是在向用户提问时不触发
- 最近发生 abort/error 抑制窗口时不触发
- 用户刚发送了新的真实消息时重置或停止
- 连续续做超过阈值时暂停并等待用户确认

## 11. 实施建议

## 11.1 第一批必须梳理与调整的模块

建议优先读透并修改：

1. `src/index.ts`
   - 现在所有 runtime hook 注册的汇总点都在这里

2. `src/agents/orchestrator.ts`
   - 需要把“主代理优先、子代理为增强”的原则写进去

3. `src/hooks/todo-continuation/`
   - 保留其 gating 优势
   - 调整其消息注入通道

4. `src/hooks/phase-reminder/`
   - 从 user text append 改为 system/internal 注入

5. `src/config/schema.ts`
   - 增加主代理优先 / delegation guard / context handoff / bio / MCP 扩展的配置位

6. `src/mcp/`
   - 统一扩展 MCP 注册策略

## 11.2 第一阶段 plan

### Phase 1: 产品重新定向

1. 去身份化与产品命名统一
   - `package.json`
   - `README.md`
   - `LICENSE`
   - repository / homepage / bugs / bin / description

2. 根目录设计文档落地
   - 本文档

### Phase 2: 运行时消息通道整改

3. 梳理所有会污染 user message 的机制
   - `phase-reminder`
   - `todo-hygiene`
   - keyword mode prompt
   - 未来 compression directive

4. 引入统一 `message-channel-policy`
   - system / internal / user 三类通道约束

5. 改造 continuation 与 reminder 注入点

### Phase 3: 主代理优先执行模型

6. 设计并实现 `main-agent-first resolver`
7. 设计并实现 `delegation-guard`
8. 做 agent availability preflight

### Phase 4: 上下文继承与压缩回归

9. 设计 `context-handoff-packet`
10. 迁移/重构 context pressure + capsule + checkpoint 机制
11. 明确 bio / engineering 两类 profile

### Phase 5: Bio 与 MCP 能力回归

12. 定义 bio route / bio prompt augmentation
13. 合并扩展 MCP registry
14. 规划 bio skill bundle 迁移策略

## 12. 当前阶段的明确结论

### 12.1 我们不是在做什么

- 不是继续修旧半成品 build
- 不是回到 `OLD-2` 的 workspace 路线重新起盘
- 不是直接复刻 Omo
- 不是保留“把系统提示塞进用户消息”的历史机制

### 12.2 我们现在是在做什么

- 以 OMOS 为运行时基底
- 做一个重新设计过的 `openagent-labforge-bio`
- 把我们自己的压缩机制、生物信息学能力、扩展 MCP、上下文继承机制重新整合进去
- 先建立正确的消息通道、模型路由和主代理逻辑

### 12.3 第一性原则

后续实现时，所有模块都要接受这三条约束：

1. 主代理优先，子代理是增强而不是刚需
2. 真实用户消息优先级最高
3. runtime prompt 绝不伪装成用户消息

## 13. 下一步建议

基于这份设计稿，下一步最合理的工作顺序是：

1. 先对 `src/index.ts`、`src/hooks/todo-continuation/`、`src/hooks/phase-reminder/`、`src/config/schema.ts` 做一次精读梳理
2. 再出第二份更技术化的模块设计文档，专门定义：
   - message channel policy
   - main-agent-first model resolver
   - context handoff packet schema
3. 然后才开始第一轮代码调整

如果要严格控制风险，建议第一轮代码改造只做两件事：

1. 去身份化与基础文档改名
2. 停止一切对用户消息文本的 runtime 注入

这样可以先把最明显的交互问题切掉，再进入更深的功能改造。

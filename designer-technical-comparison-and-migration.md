# Technical Comparison And Migration Notes

日期：2026-04-30  
状态：技术设计细化 / 迁移分析稿

## 1. 目的

这份文档专门回答四个问题：

1. 上游 `Omo` 到底有哪些机制不适合我们直接继承
2. 当前 `OMOS` 基底比 `Omo` 改进了什么，还残留什么问题
3. `OLD` 里我们之前对 `Omo` 的改造，哪些是正确方向，哪些还要继续调整
4. `OLD-2` 里哪些源码可以直接搬，哪些只能借思路不能直接复制

这份文档比 `designer-openagent-labforge-bio.md` 更偏实现层判断，用于后续决定：

- 哪些模块直接迁移
- 哪些模块重构迁移
- 哪些模块只参考不复用

## 2. 对比对象

本次对比实际基于四条代码线：

### 2.1 上游 Omo

- 路径：`Future/clone/oh-my-openagent`
- 角色：问题样本 + 上游完整机制参考

### 2.2 当前 OMOS 基底

- 路径：当前仓库根目录 `src/`
- 角色：我们当前真正要继续开发的运行时基底

### 2.3 OLD

- 路径：`OLD/src/`
- 角色：我们之前对 Omo 的重改造线，含压缩、continuation、magic-context、bio 相关经验

### 2.4 OLD-2

- 路径：`OLD-2/src/`
- 角色：我们基于 workspace/KDCO 的轻量改造线，适合作为“可搬运结构样本”

## 3. 核心结论

先给最终结论，后面再给证据。

### 3.1 Omo 不能直接作为基底

原因不是“它差”，而是它太重、太复杂、太历史化。

从当前任务角度看，它的主要价值是：

- 作为问题来源
- 作为某些高级机制的参考实现
- 作为我们判断“哪些东西不要再这样做”的反例

### 3.2 OMOS 是合适的主基底

原因：

- 它已经把 Omo 大量重型结构收敛掉了
- agent / hook / session / MCP / multiplexer / council 这些基建都在
- 主入口和 hook 注册更集中，更适合我们重新定义产品逻辑

### 3.3 但 OMOS 还没有完成我们要的消息通道治理

这一点非常关键。

OMOS 当前已经支持：

- `experimental.chat.system.transform`
- internal marker (`createInternalAgentTextPart()`)
- system collapse

但仍有部分 runtime 控制逻辑在使用 `experimental.chat.messages.transform` 直接改 user message text。这是我们第一批必须整改的地方。

### 3.4 OLD 是“能力仓库”，不是完整基底

OLD 里真正有价值的是能力模块：

- context-window-monitor
- checkpoint / capsule / pressure state
- 用户意图感知 continuation
- magic-context / recall / skill-mcp 等思路

但它本身仍然继承了很多 Omo 的重型历史包袱，不能整体搬。

### 3.5 OLD-2 适合拿来搬“轻量结构件”

OLD-2 里有几类东西非常适合直接复用或轻改复用：

- 扩展 MCP registry
- 轻量 hook 外壳结构
- start-work 这类功能模块骨架
- 一部分 keyword / continuation / context monitor 的简化接口设计

但 `OLD-2` 里真正注入 prompt 的方式还不够成熟，不应无脑照搬。

## 4. Omo 和 OMOS 的技术差异

## 4.1 插件结构差异

### Omo

`Future/clone/oh-my-openagent/src/index.ts` 体现的是“大插件 + 多层 manager + 多层 interface”模式。

特点：

- `loadPluginConfig()`
- `createManagers()`
- `createTools()`
- `createHooks()`
- `createPluginInterface()`
- hook 分层巨大，文档中为 `52 hooks`

这是一个完整平台型插件结构。

### OMOS

当前 `src/index.ts` 明显更直接：

- 初始化几个关键 manager/hook
- 在单个文件里汇总注册大部分 OpenCode hook
- agent、tool、mcp、command 注册逻辑更集中

这对我们是好事，因为：

- 要改运行时策略时，入口更集中
- 更容易统一替换某些注入路径
- 更方便逐步重构而不是整体重搭

## 4.2 主代理工作模式差异

### Omo

Omo 的主代理体系更偏强 orchestrator / 多代理生态，历史上也更容易衍生出“主代理偏派工”的使用方式。

### OMOS

`src/agents/orchestrator.ts` 已经明确表达：

- 先理解
- 再判断是否需要 delegation
- overhead 大于收益时就自己做

这意味着当前 OMOS 已经比较接近我们要的“主代理优先”思想。

结论：

- 主代理自己干活这一点，不需要从头发明
- 需要的是把 OMOS 当前 prompt 与 model resolver 再进一步收敛

## 4.3 continuation 差异

### Omo

continuation 相关逻辑分散而且重：

- `todo-continuation-enforcer`
- `atlas`
- `ralph-loop`
- `stop-continuation-guard`
- compaction preserve / inject

它的 continuation 生态很强，但复杂度很高。

### OMOS

OMOS 把 continuation 收敛为一个较明确的 `orchestrator-only auto-continue`：

- 位置：`src/hooks/todo-continuation/index.ts`
- 已有优点：
  - orchestrator-only
  - cooldown
  - question detection
  - abort suppress
  - consecutive continuation limit
  - command toggle `/auto-continue`

结论：

- continuation 核心框架应以 OMOS 当前实现为主
- 再吸收 OLD 的用户意图判断和更细的停止条件
- 不需要回到 Omo 那个重 continuation 生态

## 4.4 消息注入差异

这是最关键的对比点。

### Omo 的问题

`Future/clone/oh-my-openagent/src/hooks/keyword-detector/hook.ts`：

- 直接改写 `output.parts[textPartIndex].text`
- 把 keyword mode prompt prepend 到用户文本前面

这类做法的问题：

- undo 会把系统 prompt 带回输入框
- user message 不再只代表用户意图
- runtime control 和用户输入混在一起

### OMOS 的进步

OMOS 具备：

- `createInternalAgentTextPart()`
- `SLIM_INTERNAL_INITIATOR_MARKER`
- `experimental.chat.system.transform`
- `collapseSystemInPlace()`

这些都说明 OMOS 已经有能力正确承载 hidden/system 注入。

### OMOS 的残留问题

当前仍有模块直接改 user text：

1. `src/hooks/phase-reminder/index.ts`
   - `lastUserMessage.parts[textPartIndex].text = ...PHASE_REMINDER`

2. `src/hooks/todo-continuation/index.ts`
   - `appendTodoHygieneInstruction()` 把 hygiene instruction 附在 user text part 上

结论：

- Omo 的问题是“明显地污染 user message”
- OMOS 的问题是“在运行时 transform 阶段继续借用 user message 承载系统提醒”
- 两者都不满足我们的最终设计

## 5. OLD 里哪些改造方向是对的

## 5.1 continuation 要尊重用户意图

OLD 里 `todo-continuation-enforcer` 明确引入了：

- `user-intent-detector`
- stop continuation 判断
- 满意/停止时跳过 continuation

这点是对的，而且应该保留。

我们在新架构里必须吸收这一点：

- continuation 不只是看 todo 是否完成
- 还要看用户是不是已经明确想停

## 5.2 context-window-monitor 的能力设计是有价值的

`OLD/src/hooks/context-window-monitor.ts` 里有几类很有价值的能力：

- 使用 OpenCode 原生 token/context stats
- 按 level 做 context guard
- local capsule
- pressure state json
- checkpoint 落盘
- profile 区分（engineering / bio）
- stale message / tool output 微修剪

这是我们自己的独创性能力里最该加回来的一个核心部分。

## 5.3 synthetic part / hidden injection 的思路是对的

`OLD/src/features/context-injector/injector.ts` 有一个很重要的正确方向：

- 不必把所有注入内容拼进 user text
- 可以作为 synthetic text part 插到 message parts 中
- 并且在 replay/undo 时清理 stale synthetic part

这个思路比“直接改用户文本”明显更正确。

### 但 OLD 的问题也很明确

它并没有始终坚持这个策略。

比如：

- `OLD/src/hooks/keyword-detector/hook.ts` 最终还是把内容 prepend 到 user text
- `OLD/src/hooks/context-window-monitor.ts` 也会向 last user message 注入 synthetic part

这比直接改 text 好一些，但仍然是“挂在 user message 上的系统注入”。

所以我们要吸收的是：

- synthetic / hidden / replay cleanup 这种机制

而不是：

- 继续让 user message 成为系统控制信息的容器

## 6. OLD-2 里哪些东西可以直接搬

这一节是最直接影响开发效率的判断。

## 6.1 可以直接搬或接近直接搬

### A. 扩展 MCP 注册表

文件：`OLD-2/src/mcp/index.ts`

这个模块质量很高，而且与当前目标高度一致：

- 原生 3 个 MCP
- 扩展 8 个 MCP
- `semantic_scholar_fastmcp` 默认开启
- 其余多数默认关闭

它基本上就是我们需要的 MCP registry 草案。

结论：

- 可直接作为迁移起点
- 只需对接 OMOS 当前 `src/mcp/` 结构和命名方式

### B. start-work 的功能骨架

文件：`OLD-2/src/hooks/start-work.ts`

这个模块的价值在于：

- 功能边界清晰
- 适合做独立 feature/hook
- 和我们规划中的 plan / worktree / domain routing 非常一致

结论：

- 结构可直接参考甚至复制
- 具体 prompt 与 routing 逻辑仍需重新适配 OMOS agent 体系

### C. 轻量 hook 注册骨架

文件：`OLD-2/src/index.ts`、`OLD-2/src/hooks/index.ts`

价值：

- 轻量、直白、易读
- 适合做“概念验证型模块”的快速接入

结论：

- 可作为局部结构参考
- 但不能替代 OMOS 当前主入口

## 6.2 可以搬思路，但必须重写通道实现

### A. keyword-detector

`OLD-2/src/hooks/keyword-detector.ts` 的优点：

- 已明确意识到 undo 问题
- 有 processed fingerprint 去重
- 试图用 separate system message 的设计表达意图

但它的具体实现仍然比较粗糙：

- `output.parts.unshift({ ..., role: "system" } as any)` 这种写法并不稳
- 不一定符合 OMOS 当前的 runtime 通道设计

结论：

- 设计意图可搬
- 源码不能无脑复制
- 新实现应基于 OMOS 的 `experimental.chat.system.transform` + internal marker

### B. todo continuation enforcer

`OLD-2/src/hooks/todo-continuation-enforcer.ts` 的优点：

- 用户意图检测清晰
- failure count / userStopped / abort detection 逻辑清晰
- 模块粒度适合读懂和裁剪

问题：

- continuation prompt 仍是直接 text 注入
- 没有利用 OMOS 当前更成熟的 internal marker / noReply countdown / orchestrator tracking

结论：

- 用户意图与停止规则可以直接借
- 注入实现必须改成 OMOS 风格

### C. context-window-monitor

`OLD-2/src/hooks/context-window-monitor.ts` 的优点：

- 接口轻
- 阈值模型清晰
- 适合做最小版本骨架

问题：

- 只是简版监控，没有完整 checkpoint / capsule / profile / prune 逻辑
- 不足以直接成为最终实现

结论：

- 只能作为轻量原型骨架参考
- 真正实现应基于 `OLD/src/hooks/context-window-monitor.ts` 的能力设计重建

## 6.3 不建议直接搬的部分

### A. Omo / OLD / OLD 中所有“直接改用户文本”的注入逻辑

包括但不限于：

- keyword prelude 注入
- user text prepend / append
- last user message synthetic payload 注入

这些都不应直接进入新架构。

### B. Omo 的重 continuation 生态

包括：

- atlas / boulder 整套重 continuation 流
- ralph-loop 相关复杂机制
- 一整套重型 continuation control 面板

这些会让新架构重新变复杂。

### C. OLD 整体 plugin 结构

OLD 是能力仓库，不应整体迁移。

我们只取能力点，不取整体骨架。

## 7. 按模块给出的迁移判断

## 7.1 `keyword mode`

来源分析：

- Omo：功能成熟，但注入方式错误
- OLD：增加了 replay cleanup 和更多状态判断，但最终仍污染 user text
- OLD-2：设计意图正确，具体通道实现不稳
- OMOS：目前没有对应实现，需要我们自己做

结论：

- 新建模块
- 算法参考 `OLD/OLD-2`
- 注入通道使用 `experimental.chat.system.transform`

迁移类别：`重构迁移`

## 7.2 `todo continuation`

来源分析：

- OMOS 当前实现已经是最佳主骨架
- OLD 补充了更强的 user intent / stop conditions
- OLD-2 提供更轻的 stop/failure state 设计

结论：

- 以 OMOS 当前 `src/hooks/todo-continuation/` 为主
- 吸收 OLD/OLD-2 的 user-stop intent 逻辑
- 把 todo hygiene 从 user message append 改走 system/internal 通道

迁移类别：`局部增强`

## 7.3 `phase reminder`

来源分析：

- 当前 OMOS 直接 append 到 user text

结论：

- 不需要从别处搬结构
- 直接在 OMOS 基底上重写注入通道

迁移类别：`原地重写`

## 7.4 `context pressure / compression / checkpoint`

来源分析：

- OLD 有成熟能力设计
- OLD-2 只有轻量壳
- OMOS 当前没有完整回归这个能力

结论：

- 以 OLD 的能力模型为蓝本
- 用 OMOS 的 current plugin architecture 重建
- 不继续沿用向 user message 注入 synthetic part 的实现方式

迁移类别：`能力重建`

## 7.5 `MCP registry`

来源分析：

- OLD-2 的 `src/mcp/index.ts` 很适合直接拿来用

结论：

- 优先从 OLD-2 搬
- 再对接 OMOS 的权限与 config 体系

迁移类别：`近似直接迁移`

## 7.6 `start-work`

来源分析：

- OLD-2 的骨架清晰
- Omo/OLD 有更复杂 boulder-state 支撑

结论：

- 先保留为二阶段功能
- 如果做，优先从 OLD-2 起步，再接入 OLD 的状态存储能力

迁移类别：`二阶段迁移`

## 8. 技术原则修订

基于这次源码对比，需要把设计原则进一步收紧。

## 8.1 user message 只保留用户本意

新架构里禁止以下做法：

- prepend 模式提示到用户文本
- append phase reminder 到用户文本
- append todo hygiene 到用户文本
- 把压缩提示作为 synthetic part 挂在 last user message 下

允许的做法：

- `experimental.chat.system.transform` 注入系统提示
- `createInternalAgentTextPart()` 注入 internal prompt
- 独立 runtime state 文件承载工作记忆和上下文摘要

## 8.2 优先复用 OMOS 已有的 internal marker 体系

当前 `src/utils/internal-initiator.ts` 已有：

- `SLIM_INTERNAL_INITIATOR_MARKER`
- `createInternalAgentTextPart(text)`

这说明新设计不应另起一套“半模拟 system role”的黑科技，而应优先复用这套机制。

## 8.3 任何从 OLD/OLD-2 搬来的模块，都先经过通道审查

迁移前要先问三个问题：

1. 它有没有改写 user text
2. 它是不是把系统控制信息挂在 user message parts 上
3. 它是否能改成 system/internal 注入后仍保留主要逻辑价值

只有通过这三个问题，才值得迁移。

## 9. 可执行的迁移清单

## 9.1 第一批直接处理

1. `src/hooks/phase-reminder/`
   - 原地重写注入通道

2. `src/hooks/todo-continuation/`
   - 保留主体逻辑
   - 引入 OLD/OLD-2 的 user stop intent
   - 去掉 user text hygiene append

3. `src/mcp/`
   - 把 `OLD-2/src/mcp/index.ts` 的扩展 MCP 并入当前基底

## 9.2 第二批构建

4. 新建 `runtime-keyword-modes`
   - 算法参考 OLD/OLD-2
   - 通道走 system/internal

5. 新建 `context-handoff-packet`
   - 结合 OMOS task session manager + OLD context memory 经验

6. 新建 `context-pressure/checkpoint`
   - 能力设计参考 OLD
   - 存储路径与产品语义按 LabForge 重命名

## 9.3 暂缓

7. `start-work`
8. 更大的 bio skill bundle 迁移
9. 更复杂的 review / autopilot / heavy checkpoint 工作流

## 10. 最终判断

### 10.1 我们真正的最佳路线

最佳路线不是：

- 复刻 Omo
- 复活 OLD 整体结构
- 回到 OLD-2 的 workspace 基底

而是：

- 以 OMOS 为运行时主基底
- 从 OLD 提取能力设计
- 从 OLD-2 提取轻量结构件与可直接迁移源码
- 把所有 prompt/control 注入统一迁到 system/internal channel

### 10.2 哪些能直接省开发量

能明显减少开发量的直接迁移点有：

- 扩展 MCP registry
- start-work 骨架
- 一部分轻量 hook 外壳
- OLD-2 continuation 的 stop state / abort state 逻辑

### 10.3 哪些不能为了省事硬搬

不能为了省事直接复制的主要是：

- Omo/OLD 的 keyword prelude 注入
- 任何直接改 user text 的 runtime prompt 注入
- 把系统控制信息挂在 last user message parts 下的旧设计

这类东西一旦直接搬进来，就会把我们现在最想解决的问题重新带回来。

## 11. 新增外部参考：Superpowers 与两类压缩插件

这部分是后续新增的设计输入，单独记录，避免后面误用。

## 11.1 `superpowers` 的吸收边界

参考源：

- `https://github.com/obra/superpowers`
- 本地克隆：`Future/clone/superpowers`

### 结论

`superpowers` 不适合作为运行时代码基底，也不适合大规模迁入本项目。

原因：

- 它本质上是一个“agentic software development methodology + skills framework”
- 更偏流程方法学与开发行为规范
- 工作流很重：
  - brainstorming
  - writing-plans
  - subagent-driven-development
  - test-driven-development
  - requesting-code-review
  - using-git-worktrees
- 它强调的是“开发方法强约束”，不是“轻量运行时治理”

从我们当前目标看，它的问题在于：

- 比 Omo/OMOS 更偏开发流程驱动
- 对真正的日常实际开发可能更耗 token
- 很容易把系统变成一个过重的 methodology shell
- 会和我们想做的“主代理优先、运行时轻治理、bio 优先能力”发生重叠甚至冲突

### 可借鉴的部分

只建议吸收很少量内容：

1. 少量基础技能的结构化写法
   - brainstorming
   - writing-plans
   - requesting-code-review
   - verification-before-completion

2. methodology 层面的原则
   - 先澄清需求，再计划，再执行
   - 用小 task 拆分复杂工作
   - review 作为独立阶段
   - evidence over claims

3. 可作为“基准 skills”参考，而不是运行时代码参考

### 不建议吸收的部分

- 整套 subagent-driven-development 流程
- 以 skills 为中心的大规模自动 workflow 编排
- 大量强约束开发方法在每轮对话中都强行激活
- 把本项目做成 methodology-first 插件

### 迁移判断

- `skills 内容`: `可少量借鉴`
- `运行时代码`: `不迁移`
- `插件结构`: `不迁移`

## 11.2 `opencode-dynamic-context-pruning` 的吸收边界

参考源：

- `Future/clone/opencode-dynamic-context-pruning`

### 重要提醒

该项目 README 显示 License 为：`AGPL-3.0-or-later`

因此：

- 不能直接把其代码抄进我们当前项目
- 可以研究思路，但不应复制实现代码

### 有价值的设计点

1. `compress` 作为显式工具的设计
   - 支持 `range` / `message` 两种压缩粒度

2. “高保真摘要替换原始上下文”的理念
   - 不是简单裁剪
   - 是让模型主动维护上下文密度

3. 对保护对象的明确建模
   - protected tools
   - protected user messages
   - protected file patterns

4. `compress-range` / `compress-message` prompt 设计非常有参考价值
   - 特别是：
     - 用户意图保真
     - placeholder / boundary discipline
     - 批量压缩思路

### 不适合照搬的部分

- 代码实现本身
- DCP 的完整 autonomous context management 产品形态
- 作为我们主压缩机制的直接实现来源

### 我们应该怎么用它

- 只吸收“同步压缩工具设计”和“压缩 prompt 约束”思路
- 不抄代码
- 让它服务于我们自己的 `context handoff / checkpoint / pressure` 系统

### 迁移判断

- `prompt 设计思路`: `可参考`
- `压缩工具产品概念`: `可吸收`
- `实现代码`: `禁止直接迁移`

## 11.3 `opencode-magic-context` 的吸收边界

参考源：

- `Future/clone/opencode-magic-context`

License：README 显示为 `MIT`

### 结论

这是我们最值得重点吸收的外部压缩/上下文插件参考之一。

它和 DCP 不同，重点不是“手术式压缩工具”，而是：

- cache-aware context management
- background historian
- compartments / facts / memory
- nudge / queue / deferred reduction
- cross-session memory
- context search / expand / reduce / note / memory 工具族

### 对我们最有价值的部分

1. 背景 historian + 主会话不阻塞
   - 压缩工作可以异步完成
   - 主代理不需要停下来专门处理上下文

2. compartments/facts/memory 分层
   - 这和我们未来的：
     - handoff packet
     - checkpoint
     - session facts
     - cross-session memory
     非常契合

3. cache-aware deferred operations
   - 它明确考虑 cache bust 成本
   - `apply-context-nudge.ts` 也在强调“保持 anchored nudge 稳定以避免 cache bust”

4. 单独的 compressor pass
   - `compartment-runner-compressor.ts`
   - 体现了：
     - 预算控制
     - 分层压缩深度
     - 历史区块的二次压缩
     - 背景 child session 执行压缩

5. 丰富的数据层
   - tags
   - pending ops
   - compartments
   - session facts
   - memories
   - compression depth

### 对我们不一定要照搬的部分

- 完整 SQLite 数据模型
- TUI sidebar / desktop dashboard
- dreamer 整套夜间维护生态
- 全量工具族 `ctx_reduce/ctx_expand/ctx_note/ctx_memory/ctx_search`

这些很强，但会显著增加系统重量。

### 我们建议吸收的策略

1. 吸收思想层：
   - queue/defer
   - cache-aware
   - compartment/fact/memory 分层
   - 独立 compressor pass

2. 选择性吸收实现层：
   - 压缩深度与 budget 控制思路
   - 背景 child session 运行压缩器
   - nudge 稳定化策略

3. 暂时不吸收产品外延层：
   - dashboard
   - dreamer 全生态
   - 过于完整的工具族

### 迁移判断

- `压缩/上下文管理思想`: `强烈建议吸收`
- `部分实现模式`: `可选择性迁移`
- `完整产品形态`: `不整体迁移`

## 11.4 新的外部参考优先级

综合本项目目标、重量控制、许可边界、实际收益，当前外部参考优先级建议如下：

1. `OMOS 当前基底`
   - 主运行时基础

2. `OLD`
   - LabForge 独创能力来源
   - 特别是 context pressure / checkpoint / bio 方向

3. `opencode-magic-context`
   - MIT
   - 非常适合吸收上下文管理与同步/异步压缩思路

4. `OLD-2`
   - 轻量结构件、MCP、部分 hook 骨架

5. `opencode-dynamic-context-pruning`
   - 只参考概念与 prompt 设计，不碰代码

6. `superpowers`
   - 只参考少量 skills 与方法学，不碰运行时代码

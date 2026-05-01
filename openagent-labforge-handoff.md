# OpenAgent LabForge Handoff

日期：2026-04-30

## 当前状态

- 当前本地仓库：`D:\-Users-\Documents\GitHub\chat-model\openagent-labforge`
- 当前分支：`master`
- 当前旧远端：`origin = https://github.com/BOHUYESHAN-APB/openagent-labforge.git`
- 当前新远端：`origin-bio = git@github.com:BOHUYESHAN-APB/openagent-labforge-bio.git`
- 当前上游远端：`upstream = https://github.com/code-yeongyu/oh-my-openagent.git`
- 当前新主仓库：`https://github.com/BOHUYESHAN-APB/openagent-labforge-bio`
- 旧仓库 `openagent-labforge` 仅保留，不再作为后续主开发仓库
- 当前工作树已经把 `Future/clone/oh-my-opencode-slim` 的一份接近完整代码底座复制到了仓库根目录
- 复制时明确排除了 `.git`、`.github`、`node_modules`、`.turbo`、`LICENSE`
- 当前仓库还没有完成“去 OMOS 身份化”改造，也还没有提交 OMOS 底座复制后的新状态

## 这一轮已经确定的方向

这不是继续修之前那套半成品实现，而是直接以 `oh-my-opencode-slim` 的现有内容为底座，改造成新的插件 `openagent-labforge-bio`。

已经明确的路线切换：

- 不再继续 KDCO / opencode-workspace 为主的旧路线
- 不再以修旧半成品 TypeScript build 为主任务
- 不再沿用旧的 Omo continuation 注入方式
- 直接以当前仓库里已经复制进来的 OMOS 内容为新的主基底

## 当前仓库的真实内容状态

当前根目录已经存在一份接近完整的 OMOS 副本，关键文件包括：

- `package.json`
- `README.md`
- `AGENTS.md`
- `biome.json`
- `bun.lock`
- `bunfig.toml`
- `codemap.md`
- `oh-my-opencode-slim.schema.json`
- `scripts/`
- `docs/`
- `img/`
- `src/`
- `.slim/`
- `.all-contributorsrc`

当前 `src/` 中已经包含完整的主要子系统，而不是旧半成品结构，尤其包括：

- `src/agents/`
- `src/cli/`
- `src/config/`
- `src/council/`
- `src/hooks/`
- `src/interview/`
- `src/mcp/`
- `src/multiplexer/`
- `src/skills/`
- `src/tools/`
- `src/utils/`
- `src/index.ts`
- `src/tui.ts`

其中需要重点关注的现成模块：

- `src/hooks/todo-continuation/`
- `src/hooks/foreground-fallback/`
- `src/hooks/task-session-manager/`
- `src/hooks/phase-reminder/`
- `src/agents/orchestrator.ts`
- `src/config/schema.ts`
- `src/index.ts`

## 当前仓库里仍然残留的旧内容

当前工作树仍混有旧仓库历史痕迹，主要体现为：

- git 状态里记录了很多旧实现文件的删除项
- 根目录仍保留研究或历史目录，不应混入新插件逻辑：
  - `Future/`
  - `OLD/`
  - `OLD-2/`
  - `.opencode/`
  - `.sisyphus/`

这些目录当前先不要误删，也不要纳入新实现核心逻辑。后续可按需要清理，但现阶段的主要任务是先把新底座改名、定向和跑通。

## 新设计总原则

### 1. 默认主代理优先

默认模式下：

- 主代理负责绝大多数工作
- 子代理默认不强制切换模型
- 子代理默认继承主代理模型
- 子代理主要在角色 prompt、权限、工具上区分

目标：

- 用户只配置一个主模型时，系统仍然完整可用
- 避免因为某个子代理模型不可用而导致整体任务失败

### 2. 自动切模型必须是显式可选项

只有当用户明确开启自动模型路由或全自动模式时：

- 子代理才允许绑定独立模型
- delegation 前必须做模型可用性检测
- 若目标模型不可用，必须降级到主代理模型或共享 fallback
- 不能因为 delegation 失败而让整个任务失败

### 3. 真实用户消息优先级永远最高

必须满足：

- 当前真实用户消息优先级最高
- continuation / reminder / todo enforcement 不能覆盖真实用户意图
- 一旦用户切题、暂停、评估、质疑机制本身，旧 todo 自动推进必须停止

## 已确认需要修复的 OMOS/Omo 问题

### A. Todo continuation 注入通道错误

现有风险：

- continuation 可能以用户消息形式注入
- 会和真实用户消息争抢优先级
- 会污染 user message stream
- 甚至可能回流到 undo 或输入栈

后续硬规则：

- continuation / reminder / auto-resume 必须走 system、hidden runtime 或 metadata 通道
- 绝不能伪装成用户消息
- 绝不能进入可被 undo 恢复的用户输入栈

### B. 子代理模型不可用导致整体失败

现有风险：

- 主代理能工作，不代表所有子代理模型都能工作
- delegation 可能落到未配置或不可用模型
- fallback 可能只是静态字符串，不是真正可用模型

后续要求：

- delegation 前先检查目标 agent 是否存在已验证可用模型
- 若无可用模型，则直接由主代理执行
- fallback 必须返回真实可用模型，而不是配置里写着但实际上不可用的模型名

## 新增关键能力：子代理动态继承主代理部分上下文

这是后续最关键的新能力之一。

### 目标

子代理要能动态继承主代理的一部分上下文，以减少重复读长文、重复读网页、重复读 PDF、重复读代码带来的 token 和 I/O 消耗。

目标收益：

- 提高缓存命中率
- 降低重复 token 消耗
- 减少重复读取长文档
- 提升主代理和子代理协作效率

### 继承原则

不是继承整个原始会话全文，而是继承“裁剪过、结构化、可控”的部分上下文。

应该继承：

- 当前任务目标摘要
- 用户当前意图摘要
- 主代理已有分析结论
- 已读文档、网页、PDF 的摘要或结构化摘录
- 关键约束条件
- 当前代码修改意图
- 已知风险与禁止项

不应该直接继承：

- 整段原始聊天全文
- 冗长历史消息
- 无关探索噪音
- 大段重复原文

### 推荐实现

建议新增 `context handoff packet` 机制。

推荐字段：

- `task_summary`
- `user_intent`
- `constraints`
- `prior_findings`
- `read_artifacts`
- `relevant_paths`
- `open_questions`
- `do_not_repeat`

关键原则：

- 继承的是“工作记忆”，不是整段聊天原文
- 默认先继承摘要，原文按需回读
- 优先传递高复用信息
- 避免重复 I/O 与重复 token 消耗

## 推荐产品配置方向

当前推荐的三套主推模型配置方向：

### 方案 1：OpenAI + DeepSeek

适用大多数普通用户。

建议思路：

- 强判断与主代理：OpenAI
- 低成本执行与补充：DeepSeek

### 方案 2：纯 OpenAI

适用：

- 已有 OpenAI / Codex 订阅用户
- 希望配置最简单的用户

### 方案 3：纯 DeepSeek

适用：

- 更强调成本控制
- 接受单 provider 路线

`GLM`、`Kimi` 等其他模型路线，可作为用户自定义扩展，不作为当前默认主推方案。

## 接下来最该做的仓库编辑

当前仓库已经可以直接开始编辑，不需要再去对齐旧仓库状态。下一步应优先做“最小去身份化改造”：

1. 修改 `package.json`
2. 修改 `README.md`
3. 新增 Apache-2.0 `LICENSE`
4. 评估是否保留 `img/`、`.all-contributorsrc`、`oh-my-opencode-slim.schema.json`、`.slim/`、部分 `docs/`
5. 再进入真正的功能级改造

### `package.json` 需要改的方向

- 包名从 `oh-my-opencode-slim` 改成 `openagent-labforge-bio`
- CLI bin 名同步改掉
- `license` 改为 `Apache-2.0`
- `repository` / `bugs` / `homepage` 指向新仓库 `BOHUYESHAN-APB/openagent-labforge-bio`
- `description` 改成围绕主代理优先、可选多代理协作的新描述
- 后续再评估 schema 文件名是否继续沿用 `oh-my-opencode-slim.schema.json`

### `README.md` 需要改的方向

- 去掉 OMOS / Pantheon / Boring Dystopia 的品牌与叙事
- 改成 `openagent-labforge-bio` 的产品定位
- 重点讲清：
  - 主代理优先
  - 子代理默认继承主模型
  - 自动切模型是可选能力
  - continuation 不进入 user message 通道
  - 子代理可继承部分主代理上下文

### 功能级改造优先模块

建议按以下模块顺序推进：

1. `model-resolver`
2. `delegation-guard`
3. `agent-availability preflight`
4. `continuation suppression`
5. `context inheritance packet`

## 第一阶段目标

先做一个“默认主代理优先”的可运行版本：

- 单主模型即可完整运行
- 子代理默认复用主模型
- continuation 不走用户消息通道
- delegation 自带模型可用性检查

## 第二阶段目标

然后再做增强能力：

- 自动模型路由
- 高级预设切换
- 子代理独立模型
- 更细的上下文继承策略

## 重启 OpenCode 后的建议接手方式

重启后，下一次会话应该直接把这个文件当作当前权威 handoff，并优先按这个顺序接手：

1. 先读本文件
2. 确认当前 git 工作树状态
3. 直接编辑当前仓库中的 `package.json`、`README.md`、`LICENSE`
4. 再梳理 `src/config/schema.ts`、`src/agents/orchestrator.ts`、`src/hooks/todo-continuation/`、`src/index.ts`
5. 从“主代理优先 + continuation 改通道 + context handoff packet”三个方向同时收敛

## 关于 OpenCode 窗口上下文一直卡在 60%

这个现象更像是 OpenCode 的 UI 指示条没有精细反映真实上下文占用，而不是说明实际可用上下文真的固定卡死在 60%。可能原因包括：

- UI 只显示粗粒度区间，而不是实时精确 token 数
- 上下文压缩后，内部状态已变化，但前端指示条没有同步细化
- 系统把一部分保留上下文、工具状态、压缩摘要和会话元数据分开计算，UI 只显示其中一种近似值

如果后续要真正确认，需要去看 OpenCode 本体是否有：

- 实际 token 统计来源
- 压缩前后计量方式
- UI 进度条刷新逻辑

这件事本身不是当前插件改造主线，但如果后续你想查，可以把它当成一个单独的 OpenCode 宿主问题来排。

## 一句话总结

后续不是继续修旧半成品，而是：

> 直接基于当前仓库里已经复制进来的 OMOS 底座，把它改造成一个以主代理优先、自动切模型可选、continuation 不污染用户通道、子代理可继承部分主代理上下文的新插件 `openagent-labforge-bio`。

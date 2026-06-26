# Loop Engineering 升级设计方案

## 一、现状分析

### 1.1 两套循环架构

本插件包含两套独立的自主循环系统：

**系统 A：Harness 循环（Auto-Continue + Auto-Review）**
- 触发条件：orchestrator session 中存在未完成 todo
- 驱动方式：session.idle 事件
- 循环体：执行 todo → session.idle → 注入继续消息 → AI 继续 → 全部完成 → review
- 审查机制：overlay 切换到 reviewer，文本 verdict 解析
- 终止条件：APPROVE / NEEDS_USER / BLOCKED / max_continuations(100)

**系统 B：Loop 循环（LoopStateMachine）**
- 触发条件：用户执行 /ol-loop-start
- 驱动方式：FSM 状态机 + session.idle 事件
- 循环体：interview → execute → review → approve/fix/redesign
- 审查机制：同系统 A（overlay + 文本 verdict）
- 终止条件：APPROVE / max_iterations(3)

### 1.2 以「实现登录功能」为例的完整流转

#### 系统 A 流转

```
用户输入任务
  → orchestrator 创建 5 个 todo
  → session.idle（5 个未完成）
  → 检测到未完成 todo + auto-enable 阈值达标
  → 注入内部消息（用户不可见）：继续工作
  → AI 执行第 1 个 todo → idle → 注入继续 → 执行第 2 个
  → ...循环直到 5 个全部完成...
  → session.idle（0 个未完成）
  → 激活 review overlay，UI 显示 reviewer
  → 注入审查提示
  → reviewer 输出 verdict
  → APPROVE：清除 overlay，恢复 engineer，循环结束
  → REJECT：注入修复提示，重置计数器，继续循环
  → NEEDS_USER：停止，等待用户介入
```

#### 系统 B 流转

```
用户执行 /ol-loop-start "实现登录功能"
  → classifyTaskExecutor → 默认选 engineer
  → 创建 FSM（idle → interview）
  → 激活 plan overlay，UI 显示 prometheus
  → 注入阶段切换信号
  → prometheus 收集需求，向用户提问
  → 用户回答 → prometheus 调用 save_plan
  → save_plan 触发 autoExitPlanMode
  → FSM 进入 execute，overlay 切换到 engineer
  → session.idle → 注入 kickstart 提示（读取计划，创建 todo，执行）
  → AI 执行 → auto-continue 维持循环
  → task_complete 触发 review overlay
  → reviewer 审查
  → APPROVE：删除 FSM，恢复原始 agent
  → REJECT executor：FSM 进入 execute，注入修复指令
  → REJECT planner：FSM 进入 redesign，prometheus 重新规划
  → 最大迭代 3 次后强制结束
```

### 1.3 Agent 切换机制

所有 agent 切换通过三层协作完成：

**第一层：EffectiveAgentOverlayManager**
- 维护每个 session 的 overlay 栈
- 记录当前 phase、agent、source、returnAgent
- 提供 activate / getCurrent / clear 方法

**第二层：chat.message hook**
- 每条消息到达时检查 overlay 状态
- 如果 overlay 存在，强制设置 output.message.agent
- UI 据此显示正确的 agent 徽章

**第三层：experimental.chat.system.transform**
- 每次 LLM 调用时检查 overlay agent
- 根据 agent 名称替换 system prompt
- reviewer 获得审查 prompt，prometheus 获得规划 prompt

**阶段切换信号（Phase Switch）**
- 通过 injectPhaseSwitch 排队待发消息
- 下一条 user message 到达时，将 [phase:execute|agent:engineer|think:inherit] 前置
- AI 读取此信号调整行为

**内部消息注入**
- 所有系统注入的消息通过 ctx.client.session.prompt() 发送
- 附加 <!-- OMO_INTERNAL_INITIATOR --> 标记
- isExternalUserMessage() 识别标记后归类为内部注入
- 用户在 UI 上看不到这些消息，但 AI 会响应

### 1.4 与 MiMo Code 的关键差异

| 能力 | 我们 | MiMo Code | 差距 |
|------|------|-----------|------|
| agent 类型分类 | primary/subagent 二分 | primary/subagent + hidden + SYSTEM_SPAWNED 三维 | 缺少 system-spawned 分类 |
| 权限处理 | 无特殊处理 | system-spawned 获得 interactive:false | reviewer 可能挂起 |
| 完成判断 | 文本 verdict 解析 | 独立 judge 模型 + 结构化 Verdict | 我们的判断不够可靠 |
| 未完成任务检查 | 无 | task stop-gate：停止前检查未完成 task | agent 可能在任务未完成时停止 |
| 记忆巩固 | 无 | dream：自动扫描 session 历史，写入 MEMORY.md | 缺少跨 session 记忆 |
| 工作流发现 | 无 | distill：发现重复操作，打包为 skill | 缺少自动化能力 |
| 目标系统 | 无 | /goal + judge：持续运行直到条件满足 | 缺少目标驱动的自主循环 |
| 上下文重建 | checkpoint 基础版 | checkpoint + rebuild context 完整版 | 我们的 checkpoint 缺少重建 |
| re-entry 限制 | max_continuations=100 | goal:12, task:3/2 | 我们的限制偏宽松 |
| fail-open 机制 | 无 | judge 出错视为通过 | 我们的 reviewer 出错会卡住 |

---

## 二、改进方案

### 改进 1：添加 SYSTEM_SPAWNED 分类

**目标**：让 reviewer、internal-planner 等系统生成的 agent 获得正确的运行时行为。

**修改文件**：`src/config/constants.ts`

```typescript
// 新增
export const SYSTEM_SPAWNED_AGENTS = new Set([
  'reviewer',
  'internal-planner',
])
```

**修改文件**：`src/agents/index.ts`

在 applyClassification 函数中，对 SYSTEM_SPAWNED_AGENTS 中的 agent 设置额外标记。

**修改文件**：`src/hooks/todo-continuation/index.ts`

在 reviewer 被调用时，设置 interactive:false 类似的语义（在我们的插件层面拦截权限请求）。

**预期效果**：reviewer 运行时不会因为需要权限而挂起。

### 改进 2：Task Stop-Gate

**目标**：agent 尝试停止时，检查是否有未完成的 task，防止过早退出。

**新增文件**：`src/hooks/task-gate/index.ts`

逻辑：
1. 监听 session 即将停止的时机（在 auto-continue 注入前检查）
2. 查询 task registry 中非终态的 task（open / in_progress）
3. 如果存在未完成 task，注入 nudge 消息强制继续
4. 设置 re-entry 上限：主 session 3 次，子 agent 2 次

**集成点**：在 todo-continuation 的 handleEvent 中，在 auto-continue 注入前增加 stop-gate 检查。

**预期效果**：防止 agent 在任务未完成时自行停止。

### 改进 3：Goal/Judge 系统

**目标**：引入独立 LLM 判断任务完成条件，替代纯文本 verdict 解析。

**新增文件**：`src/hooks/goal/index.ts`

**新增文件**：`src/tools/goal.ts`

**新增文件**：`src/hooks/goal/judge-prompt.ts`

流程：
1. 用户通过 /goal 命令设置停止条件
2. agent 尝试停止时，触发 judge 调用
3. judge 使用独立 LLM（可配置模型），接收完整对话历史
4. 返回结构化结果：{ ok: boolean, impossible: boolean, reason: string }
5. ok=true：允许停止
6. ok=false + impossible=false：注入 re-entry，引用 reason，继续工作
7. ok=false + impossible=true：允许停止（条件不可达）
8. judge 出错：fail-open，允许停止
9. re-entry 上限：12 次

**judge prompt 要点**：
- 只读评估，不接触文件/工具
- 必须引用对话中的具体证据
- 区分「尚未完成」和「不可能完成」

**预期效果**：比文本 verdict 更可靠的完成判断。

### 改进 4：Dream 记忆巩固

**目标**：自动扫描 session 历史，将跨 session 的持久知识写入 MEMORY.md。

**新增文件**：`src/hooks/dream/index.ts`

**新增文件**：`src/agents/dream.ts`

**新增文件**：`src/tools/memory.ts`（增强版）

实现方式：
- dream 作为 hidden primary agent 注册
- 扫描 .opencode/extendai-lab/ 下的历史 session 文件
- 提取重复出现的模式、规则、决策
- 写入项目级 MEMORY.md（.opencode/extendai-lab/memory/MEMORY.md）
- 自动触发：每 7 天一次，首次运行需项目存在超过 7 天
- 手动触发：/dream 命令

**MEMORY.md 结构**：
```
# Project Memory
## Project context
## Rules
## Architecture decisions
## Discovered durable knowledge
```

**预期效果**：agent 跨 session 保留持久知识。

### 改进 5：Checkpoint 重建

**目标**：context 接近上限时，从 checkpoint 重建上下文，而非简单截断。

**修改文件**：`src/hooks/todo-continuation/index.ts`（context-pressure 部分）

**修改文件**：`src/council/council-manager.ts`（checkpoint 相关）

增强点：
1. checkpoint 写入时，除摘要外保留最近 10K-20K token 的原始消息
2. 重建时注入：checkpoint + project memory + 最近消息
3. 添加 active recall 提示：已加载的 memory 内容不要再重复读取
4. 微压缩：重建时对可重新生成的工具结果（read, bash, grep）替换为占位符

**预期效果**：长 session 不再丢失上下文。

### 改进 6：MiMo Code 兼容检测

**目标**：检测当前运行环境是否为 MiMo Code，自动禁用重复功能。

**新增文件**：`src/utils/environment-detect.ts`

检测方法：
- 检查 OpenCode 版本信息中是否包含 "mimo" 标识
- 检查 config 中是否存在 dream/distill/voice 等 MiMo 特有字段
- 检查 SQLite 数据库是否存在（MiMo Code 独有）

**集成点**：在 src/index.ts 的 config hook 中，根据检测结果条件性注册重复功能。

**禁用逻辑**：
- MiMo Code 环境 + MiMo 已有 dream → 不注册我们的 dream
- MiMo Code 环境 + MiMo 已有 goal → 不注册我们的 goal
- MiMo Code 环境 + MiMo 已有 memory → 不注册我们的 memory
- 原版 OpenCode → 全部功能开启

---

## 三、实现优先级

| 优先级 | 改进 | 理由 | 预估工作量 |
|--------|------|------|-----------|
| P0 | SYSTEM_SPAWNED 分类 | 修复 reviewer 挂起 bug | 小（~50 行） |
| P0 | Task Stop-Gate | 防止过早停止 | 中（~150 行） |
| P1 | Goal/Judge 系统 | 核心 Loop Engineering 能力 | 大（~400 行） |
| P1 | Dream 记忆巩固 | 跨 session 知识保留 | 大（~500 行） |
| P2 | Checkpoint 重建 | 长 session 上下文保持 | 中（~200 行） |
| P2 | MiMo Code 兼容检测 | 一插件多环境 | 小（~100 行） |

---

## 四、需要确认的问题

1. Dream 的记忆存储位置：用 .opencode/extendai-lab/memory/ 还是项目根目录？
2. Checkpoint 重建是否需要与 MiMo Code 的格式兼容？

---

## 五、已完成的改进

### ✅ 改进 0：max_iterations 3→12 + 命令参数支持

- `src/hooks/loop/index.ts`: `LoopStateMachine.create()` 默认 max_iterations 从 3 改为 12
- `src/index.ts`: `/ol-loop-start` 支持 `--iterations N` 参数（1-100）
- `src/config/schema.ts`: 新增 `LoopConfigSchema`（defaultMaxIterations, taskGateReentryCap）
- 测试：31 loop + 6 iterations = 37 个测试通过

### ✅ 改进 1：SYSTEM_SPAWNED 分类

- `src/config/constants.ts`: 新增 `SYSTEM_SPAWNED_AGENTS`（reviewer, internal-planner）
- `src/agents/index.ts`: 系统生成 agent 获得 `question: deny`，防止权限挂起
- 测试：83 个 agent 测试通过

### ✅ 改进 2：Task Stop-Gate 模块

- `src/hooks/task-gate/index.ts`: 纯决策层，检查未完成 task 并生成 nudge
- 排除 blocked 状态的任务（agent 无法继续的工作）
- main session 3 次 re-entry 上限，subagent 2 次
- 测试：19 个测试通过

### ✅ 改进 3：Goal/Judge 系统

- `src/hooks/goal/index.ts`: Goal 状态管理、Verdict 解析、judge prompt 构建
- `src/hooks/goal/command.ts`: `/goal` 命令处理器
- `src/hooks/goal/gate.ts`: Goal gate 事件处理器（session.idle 时触发）
- 12 次 re-entry 上限，fail-open 错误处理
- 测试：23 goal + 8 command = 31 个测试通过

### ⏳ 待做：Dream/Distill + Checkpoint 重建

- Dream: 自动扫描 session 历史，写入 MEMORY.md
- Distill: 发现重复工作流，打包为 skill
- Checkpoint 重建: 从 checkpoint 恢复上下文

---

## 六、测试覆盖

| 模块 | 测试文件 | 测试数 | 状态 |
|------|---------|--------|------|
| Task Stop-Gate | task-gate/index.test.ts | 19 | ✅ |
| Goal/Judge | goal/index.test.ts | 23 | ✅ |
| Goal Command | goal/command.test.ts | 8 | ✅ |
| Loop FSM | loop/index.test.ts | 31 | ✅ |
| Loop Iterations | loop/iterations.test.ts | 6 | ✅ |
| Agent Config | agents/index.test.ts | 83 | ✅ |
| **总计** | | **170** | **✅** |

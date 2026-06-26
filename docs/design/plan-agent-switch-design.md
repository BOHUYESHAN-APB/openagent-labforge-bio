# Plan/Review Agent Hook 切换设计方案

> 基于对 opencode-dev、oh-my-openagent、oh-my-opencode-slim 三个上游的研究，
> 以及 OpenSpec、openclaude、claudecode-main 的模式参考。

═══════════════════════════════════════════════════════════════════
## 一、设计背景与核心问题
═══════════════════════════════════════════════════════════════════

### 核心矛盾

AI 的天然倾向与我们的设计需求冲突：

| AI 倾向 | 我们需要 |
|---------|---------|
| 做完一部分停下来问"可以吗？" | 一直工作到 plan 完成 |
| 用自己的 prompt 做 plan | 用 prometheus 的专业 plan 提示词 |
| 自己审查自己缺乏批判性 | 用 reviewer 的审计视角 |
| 永远不主动切换 agent | Hook 层强制切换 |

### 原因：AI 不可信 + Lane 分离

- Plan、Execute、Review 是三个独立 lane，每个 lane 有专用 agent
- 不能依赖 AI 自己决定"该切换到谁"——必须 hook 层强制
- 六个主代理（engineer、deep-worker、bio-orchestrator、chem-orchestrator、prometheus、atlas）共享同一套 lane 生命周期
- Hook 是插件层唯一的强制手段（无法控制模型 provider 行为）

═══════════════════════════════════════════════════════════════════
## 二、我们的 Agent 架构
═══════════════════════════════════════════════════════════════════

### 当前主代理（6个）

| Agent Name | Display Name | 职责 | 适用场景 |
|-----------|-------------|------|---------|
| orchestrator | engineer | 通用编码编排 | 日常开发、多文件修改 |
| deep-worker | deep-worker | 手术刀式精确修复 | 针对性修复关键小问题，提示词轻量 |
| prometheus | planner | 战略规划 | 做 plan、调研、设计方案 |
| atlas | executor | Plan 执行编排 | 读 plan、逐项执行 |
| bio-orchestrator | bio-orchestrator | 生物信息分析 | RNA-seq、单细胞等 |
| chem-orchestrator | chem-orchestrator | 化学信息分析 | 分子对接、ADMET 等 |

### 子代理（11个）

explorer, librarian, oracle, designer, fixer, observer, council, councillor, metis, momus, multimodal-looker, reviewer

### Plan/Review 相关的关键 agent

| Agent | Lane | 关键能力 |
|-------|------|---------|
| **prometheus** | Plan | 只读模式、5 阶段工作流、用 Question 工具提问 |
| **reviewer** | Review | 审计模式、APPROVE/REJECT/NEEDS_USER |
| **engineer/orchestrator** | Execute | 实现、编码、测试 |
| **atlas** | Execute | Plan 编排、任务分解 |
| **bio-orchestrator** | Execute | 生物信息分析实现 |
| **chem-orchestrator** | Execute | 化学分析实现 |

═══════════════════════════════════════════════════════════════════
## 三、上游设计对比
═══════════════════════════════════════════════════════════════════

### oh-my-openagent（旁系上游）

```
@plan "任务名" → Prometheus 规划 → save_plan
                                        ↓
       /start-work <plan-name> → Hook 拦截
                                        ↓
       切换 session agent 为 Atlas → 逐项执行
                                        ↓
       todoContinuationEnforcer → 强制继续（30s cooldown）
                                        ↓
       全部完成 → 结束
```

关键机制：
- **`@plan`** 是 Prometheus 的便利入口（用户输入即可触发）
- **`/start-work` hook** 切换 session agent 至 Atlas（不是 engineer）
- **boulder.json** 追踪跨 session 的执行状态
- **todoContinuationEnforcer** 在 session.idle 时检查 todos → 超时后注入强制继续
- **Momus** 是 plan 的审查 agent（Prometheus 可以调用它做 plan review）
- 3 种操作模式：简单（直接干）、复杂+lazy（ulw 全自动）、复杂+精确（plan→execute）

### oh-my-opencode-slim（直系上游）

```
用户输入 → orchestrator 编排
              ↓
     delegator → 背景子代理并行执行
              ↓
     hook 检测完成 → 汇总结果
              ↓
     验证 → 响应
```

关键特点：
- 无独立的 plan→execute 切换
- 无专门的 planner/executor agent
- 使用 `/deepwork` 命令做 plan+review+execute 循环
- Background Job Board 追踪运行中的任务
- 子代理深度限制（max 3）

### opencode-dev（宿主）

```
plan_enter 工具 → session.agent = "plan"
                    ↓
SessionReminders.apply():
  - agent="plan" → 注入 plan.txt（只读模式）
  - agent="plan" → 注入 plan-mode.txt（5阶段工作流）
                    ↓
Plan Agent 使用 Question 工具提问 → 用户回答 → 继续
                    ↓
plan_exit 工具 → 创建新用户消息 { agent: "build" }
                    ↓
SessionReminders 检测 plan→build → 注入 build-switch.txt
                    ↓
Build Agent 开始执行
```

关键机制：
- **`plan_enter` / `plan_exit` 工具** — 进入/退出 plan 模式的唯一通道
- **`SessionReminders.apply()`** — 每次循环迭代检查 agent 状态，注入对应提示
- **Agent 切换通过 session.agent 字段** — loop 自动适配
- Plan agent 只读（所有 edit 操作被 deny，plan_exit 是唯一允许的退出工具）
- **会话循环是 while(true)** — agent 无法自然退出

═══════════════════════════════════════════════════════════════════
## 四、关键设计原则
═══════════════════════════════════════════════════════════════════

### 4.1 工具触发 Hook 切换（不是指令触发）

主代理（engineer/bio-orchestrator/chem-orchestrator/deep-worker）通过**调用工具**
来触发 plan mode 切换，不是靠用户输入 `/ol-plan` 指令。

```
主代理调用 plan_enter 工具
          ↓
   tool.execute.before hook 拦截
          ↓
   overlayManager.activate({ phase:'plan', agent:'prometheus' })
          ↓
   system.transform 检测 plan overlay → 注入 prometheus 提示词
          ↓
   下一次 LLM 调用：prometheus 开始规划
```

**关键约束：**
- `enter_plan_mode` 工具只在 engineer/bio-orchestrator/chem-orchestrator/deep-worker 的权限中注册
- prometheus（planner）**没有**此工具的权限 — 它不能主动再嵌套进入 plan mode
- prometheus 只有 `plan_exit` 工具（或 `/ol-plan-finish` 指令）用于退出 plan mode
- 退出后自动切回 returnAgent（调用 plan 的那个主代理）

### 4.2 两种退出路径

```
Plan 完成 → prometheus 调用 plan_exit 工具 或 /ol-plan-finish
                  ↓
           hook 检测到 plan_exit
                  ↓
           读取 returnAgent（engineer/bio/chem/deep-worker）
                  ↓
           overlayManager.clear(sessionID, 'plan')
                  ↓
           system.transform 恢复主代理提示词
                  ↓
           主代理读到 plan 文件，开始执行
```

### 4.3 总体架构

```
                ┌─────────────────────┐
                │   用户输入/命令       │
                │  (UI 显示 engineer)  │
                └────────┬────────────┘
                         │
                    command.execute.before
                         │
              ┌──────────┴──────────┐
              │    Hook 路由层        │
              │   EffectiveAgentOverlayManager │
              └──────────┬──────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │ Plan Lane │   │Execute Ln│   │Review Ln │
   │prometheus │   │engineer  │   │ reviewer │
   │          │   │bio-chem  │   │          │
   │          │   │ atlas    │   │          │
   └──────────┘   └──────────┘   └──────────┘
         │               │               │
         └───────────────┼───────────────┘
                         ▼
                  system.transform
                  (注入对应 agent 提示词)
```

### 4.4 新增工具

| 工具名 | 谁有权限 | 作用 | 触发 Hook |
|--------|---------|------|----------|
| `plan_enter` | engineer / bio / chem / deep-worker | 进入 Plan 模式，切换到 prometheus | tool.execute.before |
| `plan_exit` | prometheus ONLY | Plan 完成，退出 Plan 模式 | tool.execute.before |
| `/ol-start-work <name>` | engineer / bio / chem / deep-worker | 已有，激活 execute overlay + atlas | command.execute.before |

**注意：**
- `plan_enter` 是工具（tool），不是指令（command）——AI 可以直接在对话中调用
- `/ol-plan` 指令也可以保留，供用户手动输入
- `plan_exit` 是 prometheus 唯一拥有的"退出"方式
- prometheus **不能**调用 `plan_enter`（权限 deny）

### 4.5 Plan Mode Hook 流程

#### `plan_enter` 工具调用处理：

```
tool.execute.before 检测到 plan_enter 工具被调用:
  1. 获取当前 session 的 agent（engineer/bio/chem/deep-worker）
  2. overlayManager.activate(sessionID, {
       phase: 'plan',
       agent: 'prometheus',
       returnAgent: sessionAgentMap.get(sessionID)
     })
  3. 返回："已切换到 Planner（prometheus）。开始规划。"
  4. system.transform 在下一次 LLM 调用时检测到 plan overlay

experimental.chat.system.transform 检测 plan overlay:
  if (overlayAgentName === 'prometheus') {
    // 注入 prometheus 的 system prompt（只读模式）
    // - 5 阶段工作流（理解→设计→review→save→finish）
    // - 使用 Question 工具提问，不要停下来
    // - save_plan 保存计划
    // - plan_exit 标记完成
    return; // 跳过 bio/template skills 注入
  }
```

#### Plan Agent (planner) 工作说明：

```
prometheus 进入只读模式：
  可以：read / glob / grep / webfetch / ast_grep_search
  可以：lsp_diagnostics（只读）
  可以：Question 工具（向用户提问，不会停下来等）
  可以：save_plan（保存 plan）
  可以：plan_exit（标记完成，切回主代理）
  禁止：edit / write / bash（写操作）
  禁止：subtask / task（子代理）
  禁止：plan_enter（不能嵌套进入 plan mode）
  禁止：自动停止对话 / 问"可以吗"

5 阶段工作流（参考 opencode-dev 的 plan.txt）：
  Phase 1: 理解需求（explore 代码库）
  Phase 2: 设计方案（consult oracle/metis）
  Phase 3: 审查方案（self-review）
  Phase 4: 保存 plan（save_plan 工具）
  Phase 5: 调用 plan_exit
```

#### `plan_exit` 工具调用处理：

```
tool.execute.before 检测到 plan_exit:
  1. 检查是否有 active plan overlay
  2. 读取 returnAgent（engineer/bio/chem/deep-worker）
  3. overlayManager.clear(sessionID, 'plan')
  4. 恢复 returnAgent
  5. 输出消息："Plan 已完成。returnAgent（engineer/bio/chem/deep-worker）接管。"
  6. 可选：如果 plan 文件存在，提示 /ol-start-work <name>
```

### 4.6 Execute Mode（已有，参考上游强化）

`/ol-start-work <name>` 已实现（切换到 atlas/executor）：
```
1. 找到 plan 文件
2. 创建/更新 boulder.json
3. overlayManager.activate({ phase: 'execute', agent: 'atlas' })
4. executor 开始工作（读 plan → 拆任务 → 执行）
```

**需要从上游增强的内容：**

参照 oh-my-openagent 的 todoContinuationEnforcer：
- 在 `handleCommandExecuteBefore` 中增加 plan 完成度检查
- 当 plan 未完成时，强制保持 todos 不完整（已实现）
- 检测 AI 的"停止意图"并注入强制继续（已实现，continuation-intent.ts）

参照 opencode-dev 的 SessionReminders：
- 在 `system.transform` 中检查是否有 active plan
- 如果是，注入 plan 进度提醒（"已完成 3/5 项，继续执行"）

### 4.7 Review Mode（已有，已验证正确）

auto-continue 结束时自动触发：
```
1. todoContinuationHook 检测 todos 全部完成
2. overlayManager.activate({ phase: 'review', agent: 'reviewer', returnAgent })
3. system.transform 注入 reviewer 提示词
4. Reviewer 输出 APPROVE / REJECT / NEEDS_USER
5. APPROVE → close auto-continue
6. REJECT → create rework todos，切回 returnAgent
7. NEEDS_USER → stop and ask
```

### 4.6 "Never Stop Mid-Plan" 三层保障

参考 openclaude/claudecode 的多层架构：

```
Layer 1: Hook 层 — command.execute.before
  - 检测 plan 未完成 → 强制 todos 不完整 → 计划重同步
  - 已实现（src/hooks/todo-continuation/index.ts:1487-1504）

Layer 2: 提示词层 — orchestrator prompt
  - "CRITICAL: Never Stop Mid-Plan" 硬约束
  - 已实现（src/agents/orchestrator.ts）

Layer 3: 意图检测层 — continuation-intent.ts
  - 检测 stop signals → 注入强制继续消息
  - 检测 truncation → 注入恢复消息
  - 已实现（src/hooks/todo-continuation/continuation-intent.ts）
```

### 4.8 六个主代理的交互

| 场景 | 流程 |
|------|------|
| **engineer 需要 plan** | engineer 调用 `plan_enter` → planner 规划 → `plan_exit` → returnAgent(engineer) 执行 |
| **bio-orchestrator 需要 plan** | bio 调用 `plan_enter` → planner 规划 → `plan_exit` → returnAgent(bio) 执行 |
| **chem-orchestrator 需要 plan** | chem 调用 `plan_enter` → planner 规划 → `plan_exit` → returnAgent(chem) 执行 |
| **deep-worker 需要 plan** | deep-worker 调用 `plan_enter` → planner 规划 → `plan_exit` → returnAgent(deep-worker) 执行 |
| **上游风格（分离 executor）** | planner 规划 → `/ol-start-work` → executor(atlas) 执行 |
| **普通开发（无需 plan）** | 直接干活，不进入 plan mode |

returnAgent 机制：
- `plan_enter` 时保存 returnAgent = 调用者（engineer/bio/chem/deep-worker）
- `plan_exit` 时恢复 returnAgent
- 六个主代理各自不同，但共享同一套 hook 逻辑
- prometheus 没有 returnAgent — 它不能调用 plan_enter

═══════════════════════════════════════════════════════════════════
## 五、实现计划
═══════════════════════════════════════════════════════════════════

### Phase 1: `plan_enter` / `plan_exit` 工具 + Plan overlay

新增文件：
- `src/tools/plan-enter.ts` — `plan_enter` 工具定义
- `src/tools/plan-exit.ts` — `plan_exit` 工具定义
- `src/hooks/plan-mode/index.ts` — Plan mode hook（处理 tool.execute.before）
- `src/agents/prompts/prometheus/plan-mode.txt` — Plan mode 提示词

改动：
1. 注册 `plan_enter` 工具（仅 engineer/bio/chem/deep-worker 可用）
2. 注册 `plan_exit` 工具（仅 prometheus 可用）
3. `tool.execute.before` 中拦截 `plan_enter` → 激活 plan overlay
4. `tool.execute.before` 中拦截 `plan_exit` → 清除 plan overlay，恢复 returnAgent
5. `experimental.chat.system.transform` 中检测 plan overlay
6. 注入 prometheus 只读提示词（5 阶段工作流）
7. 测试覆盖

### Phase 2: Plan Agent 权限隔离

文件：
- `src/tools/plan-enter.ts` — 权限配置
- `src/tools/plan-exit.ts` — 权限配置
- `src/agents/prometheus.ts` — 修改 createPrometheusAgent

改动：
1. prometheus agent 权限：read / glob / grep / webfetch / Question / save_plan / plan_exit
2. prometheus 禁止：edit / write / bash / task / subtask / plan_enter
3. engineer/bio/chem/deep-worker 添加：plan_enter 权限

### Phase 3: "Never Stop" 增强（已完成）

- continuation-intent.ts ✅
- orchestrator 提示词强化 ✅
- Review prompt plan 检查 ✅

### Phase 4: review agent 切换完善

当前已验证正确，未来可增强：
- 两阶段审查（Spec 合规性 → 代码质量）— 参考 Superpowers
- 审查结果持久化
- 多轮审查支持

═══════════════════════════════════════════════════════════════════
## 六、与上游的关键差异
═══════════════════════════════════════════════════════════════════

| 特性 | upstream (oh-my-opencode-slim) | 我们 (extendai-lab) |
|------|------|------|
| 主代理数量 | 1 (orchestrator) | 6 (engineer, deep-worker, prometheus, atlas, bio, chem) |
| Plan mode | 无（/deepwork 模拟） | `/ol-plan` → prometheus overlay |
| Execute 切换 | 无 | `/ol-start-work` → atlas overlay |
| Review 切换 | 无 | auto-review → reviewer overlay |
| Agent overlay | 无 | EffectiveAgentOverlayManager |
| 强制继续 | 无 | continuation-intent.ts + hook |
| 上游同步 | — | 应保持 agent 注册、hooks 注册方式一致 |

═══════════════════════════════════════════════════════════════════
## 七、附录：关键参考文件
═══════════════════════════════════════════════════════════════════

oh-my-openagent:
- docs/guide/orchestration.md — 三层编排架构
- packages/omo-opencode/src/hooks/start-work/start-work-hook.ts — /start-work hook
- packages/omo-opencode/src/hooks/todo-continuation-enforcer/ — 强制继续机制

oh-my-opencode-slim:
- src/agents/orchestrator.ts — orchestrator 提示词
- src/index.ts — hook 注册

opencode-dev:
- packages/opencode/src/tool/plan.ts — plan_exit 工具
- packages/opencode/src/session/reminders.ts — SessionReminders.apply()
- packages/opencode/src/session/prompt/plan.txt — plan 模式提示词
- packages/opencode/src/session/prompt/build-switch.txt — build 切换提示词

OpenSpec:
- src/core/artifact-graph/ — 产物 DAG 引擎
- src/commands/workflow/instructions.ts — 指令生成

openclaude:
- src/utils/continuation.ts — 延续意图检测
- src/query/tokenBudget.ts — token 预算自动继续

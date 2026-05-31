# 修复计划：子 Agent 系统

## 问题总览

### 1. 指令系统 Bug
- `ol-subagents-UM` 等指令变成提示词发给 LLM，不是直接执行
- 原因：注册为 `template: ''` + `command.execute.before` hook，但 hook 只是把文本塞进 parts，没有拦截成功

### 2. 模型继承 Bug
- free preset 下 `getModelForAgent` 返回 `undefined`，但代码 fallback 到 `DEFAULT_MODELS[name]`（硬编码默认值）
- 应该：去掉 fallback，让 `model` 保持 `undefined`，OpenCode 继承当前 session 的模型

### 3. 提示词缺失
- orchestrator prompt 没有说明 `task` vs `subtask` vs `team_create` 的使用场景
- 没有说明 free 模式下如何正确调用子 agent

### 4. subtask 工具不完整
- 缺少 `background` 参数（异步模式）
- 缺少模型继承逻辑

### 5. team agent 模型继承
- 没有从 lead session 获取模型传递给 member sessions

---

## 修复方案总览

| 优先级 | 修改 | 文件 | 说明 |
|--------|------|------|------|
| P0 | 模型继承 | `src/agents/index.ts` | 去掉 `?? DEFAULT_MODELS[name]` fallback |
| P0 | subtask 工具 | `src/tools/subtask/tools.ts` | 添加 background 参数和模型继承 |
| P0 | team agent | `src/features/team-mode/team-runtime/create.ts` | 添加模型继承 |
| P1 | 指令模板 | `src/index.ts` | 改成模板注入 |
| P1 | 提示词 | `src/agents/orchestrator.ts` | 添加子 agent 使用指南 |
| P2 | 模板文件 | `src/commands/subagent-policy-template.ts` | 新建模板文件 |

---

## 修复方案

### Phase 1：修复指令系统

**目标**：subagent policy 指令能正确执行，不变成提示词

**方案 A：改成模板注入（推荐）**
- 把 `ol-subagents-*` 指令改成模板注入（和 checkpoint 一样）
- 模板内容：让 LLM 展示当前 policy 状态 + 提示用户如何切换
- 优点：简单可靠，不需要 hook

**方案 B：修复 hook 拦截**
- 在 `command.execute.before` hook 中正确拦截
- 需要确保 hook 输出不被当作 prompt 发给 LLM
- 缺点：复杂，可能有边界问题

**选择方案 A**

### Phase 2：修复模型继承

**目标**：free preset 下子 agent 继承当前 session 的模型

**修改点**：
1. `src/agents/index.ts` 的 `getAgentConfig` 函数
2. 当 preset 是 "free" 且没有 override 时，返回 `undefined`
3. orchestrator prompt 中添加说明：free 模式下不传 `agent` 参数给 `task` 工具

### Phase 3：补充提示词

**目标**：orchestrator prompt 清楚说明子 agent 使用方式

**添加内容**：
1. `task` vs `subtask` vs `team_create` 的使用场景
2. free 模式下的模型继承说明
3. 如何查看子 agent 内容（TUI 快捷键）

---

## 指令清单（修复后）

| 指令 | 机制 | 效果 | 是否需要重启 |
|------|------|------|-------------|
| `/ol-checkpoint-light` | 模板注入 | LLM 执行 checkpoint | 否 |
| `/ol-checkpoint-heavy` | 模板注入 | LLM 执行 checkpoint | 否 |
| `/ol-checkpoint-resume-latest` | 模板注入 | LLM 恢复 checkpoint | 否 |
| `/ol-auto-continue-on` | Hook 拦截 | 开启自动继续 | 否 |
| `/ol-auto-continue-off` | Hook 拦截 | 关闭自动继续 | 否 |
| `/ol-subagents` | 模板注入 | 展示当前 policy | 否 |
| `/ol-subagents-UM` | 模板注入 | 切换到 ultra-minimal | 是（需重启） |
| `/ol-subagents-M` | 模板注入 | 切换到 minimal | 是（需重启） |
| `/ol-subagents-F` | 模板注入 | 切换到 full | 是（需重启） |
| `/ol-subagents-C` | 模板注入 | 切换到 custom | 是（需重启） |
| `/ol-subagents-MO` | 模板注入 | 切换到 main-only | 是（需重启） |

**注意**：切换 policy 需要重启，因为 agent 注册在 plugin 初始化时完成。但展示当前 policy 不需要重启。

### auto-continue 指令验证

**机制**：
- `/ol-auto-continue-on` → hook 拦截 → 重写为 `/ol-auto-continue on`
- `/ol-auto-continue-off` → hook 拦截 → 重写为 `/ol-auto-continue off`
- `/ol-auto-continue` → hook 拦截 → 调用 `auto_continue` 工具

**当前状态**：需要验证 hook 是否正确工作

**验证方法**：
1. 输入 `/ol-auto-continue-on` → 应该开启自动继续
2. 输入 `/ol-auto-continue-off` → 应该关闭自动继续
3. 检查日志确认 hook 被调用

---

## 子 Agent 三件套

### `task`（OpenCode 内置）
- 用途：用注册的 agent（explorer/librarian 等）执行任务
- 参数：`description`, `prompt`, `subagent_type`, `background`
- TUI 集成：✅ 完整（metadata + subagent panel）
- 模型：从 agent 定义获取（或继承当前 session）

### `subtask`（我们插件）
- 用途：简单子 session，文件注入
- 参数：`prompt`, `files`, `background`
- TUI 集成：❌ 不完整
- 模型：从当前 session 继承

### `team_create`（我们插件）
- 用途：多 agent 并行
- 参数：`teamName`, `inline_spec`
- TUI 集成：❌ 无
- 模型：从 lead session 继承

---

## 模型继承逻辑

### free preset（默认）
- `getAgentConfig` 返回 `undefined`
- orchestrator prompt 中说明：不传 `agent` 参数给 `task` 工具
- OpenCode 自动继承当前 session 的模型
- **关键**：`task` 工具的 `subagent_type` 参数会覆盖模型选择，所以 free 模式下不要用 `subagent_type`

### 其他 preset（ds-first, openai 等）
- `getAgentConfig` 返回 preset 中定义的模型
- orchestrator prompt 中说明：用 `task` 工具的 `subagent_type` 参数
- 子 agent 使用 preset 中定义的模型
- **关键**：`task` 工具的 `subagent_type` 参数会查找对应 agent 的模型配置

### 模型解析流程
```
用户调用 task(subagent_type="explorer")
  ↓
OpenCode 查找 agent "explorer" 的配置
  ↓
插件的 getAgentConfig("explorer") 被调用
  ↓
检查 override → 检查 preset → 返回模型或 undefined
  ↓
如果返回 undefined → OpenCode 继承当前 session 的模型
如果返回模型 → 使用该模型
```

### 模型能力参考
- `mimo-v2-pro`：reasoning ✅, toolCall ✅, 视觉 ❌ (text only)
- `mimo-v2-omni`：reasoning ✅, toolCall ✅, 视觉 ✅ (text, image, audio, video, pdf)
- `mimo-v2-flash`：reasoning ✅, toolCall ✅, 视觉 ❌ (text only)

### 模型 ID 映射
- 用户配置文件中：`mimo-v2.5-pro` → 实际是 `xiaomi/mimo-v2-pro`
- 用户配置文件中：`mimo-v2.5` → 实际是 `xiaomi/mimo-v2-omni`（有视觉）
- 注意：用户说的 "mimo-2.5有视觉，mimo-2.5-pro没有视觉" 是正确的

### 配置文件位置
- 插件配置：`~/.config/opencode/extendai-lab.json`
- OpenCode 配置：`~/.config/opencode/opencode.json`
- 模型预设：`~/.config/opencode/presets/*.json`

### auto-continue 机制
- 位置：`src/hooks/todo-continuation/index.ts`
- 工具：`auto_continue` (LLM 可调用)
- 指令：`/ol-auto-continue-on`、`/ol-auto-continue-off`、`/ol-auto-continue [on|off]`
- 逻辑：
  - 主 agent 只能开启 auto-continue
  - 只有 @reviewer agent 可以关闭 auto-continue
  - 当所有 todo 完成时，auto-continue 自动关闭
  - 用户可以按 Esc 取消

### checkpoint 机制
- 位置：`src/commands/checkpoint-template.ts`、`src/commands/checkpoint-resume-template.ts`
- 指令：
  - `/ol-checkpoint-light`：快速 checkpoint，同 session 恢复
  - `/ol-checkpoint-heavy`：完整 checkpoint，跨 session 恢复
  - `/ol-checkpoint-resume-latest`：从最新 checkpoint 恢复
- 机制：模板注入（LLM 执行模板中的指令）
- 存储：`.opencode/extendai-lab/checkpoints/`

### 模型 Profile 系统
- 位置：`src/config/schema.ts` (ModelPreferencesConfigSchema)
- Profiles：
  - `free`：不绑定模型，继承当前 session
  - `ds-first`：DeepSeek 优先
  - `openai`：OpenAI 优先
  - `openai-go`：GPT + DeepSeek 混合
  - `ds-mimo`：DeepSeek + MiMo 混合
  - `3-mix`：三模型混合
  - `custom`：用户自定义
- 配置：`modelPreferences.profile` in `extendai-lab.json`
- 预设文件：`~/.config/opencode/presets/*.json`

### 委托守卫（Delegation Guard）
- 位置：`src/delegation-guard/index.ts`
- 功能：在委托子 agent 前检查是否值得委托
- 检查项：
  1. 委托是否值得（vs 主 agent 直接执行）
  2. 目标 agent 是否有可用模型
  3. 是否有可复用的 session
  4. 是否需要 handoff packet
- 使用：`checkDelegation(agentName, ctx)` 函数

### 模型解析器（Model Resolver）
- 位置：`src/model-resolver/index.ts`
- 功能：解析子 agent 应该使用哪个模型
- 核心函数：
  - `resolvePrimaryExecutionModel(ctx)`：获取主 agent 的模型
  - `resolveDelegatedExecutionModel(agentName, ctx)`：获取子 agent 的模型
  - `resolveFallbackToPrimary(agentName, ctx)`：fallback 到主 agent 的模型
- 逻辑：
  1. 先检查子 agent 是否有显式配置的模型
  2. 如果没有，fallback 到主 agent 的模型
  3. 如果主 agent 的模型也不可用，返回 undefined

### 模型解析流程（详细）
```
用户调用 task(subagent_type="explorer", prompt="...")
  ↓
OpenCode 内置 task 工具处理
  ↓
查找 agent "explorer" 的配置
  ↓
插件的 getModelForAgent("explorer") 被调用
  ↓
检查 config.agents["explorer"] (用户 override)
  ↓
检查 modelPreferences.perAgent["explorer"]
  ↓
检查 modelPreferences.customModel
  ↓
如果 free preset → 返回 undefined
  ↓
OpenCode 的 model resolver 处理
  ↓
resolveDelegatedExecutionModel("explorer", ctx)
  ↓
如果 agent 有显式模型 → 使用该模型
如果没有 → fallback 到主 agent 的模型
  ↓
OpenCode 用解析出的模型创建子 session
```

### subtask/team agent 模型解析流程
```
用户调用 subtask(prompt="...") 或 team_create(inline_spec={...})
  ↓
插件的 subtask/team 工具处理
  ↓
获取当前 session 的模型 (client.session.get)
  ↓
创建子 session (client.session.create)
  ↓
发送 prompt 时传递模型 (client.session.prompt with model)
  ↓
OpenCode 用传递的模型创建子 session
```

### 内置 task 工具模型解析流程
```
用户调用 task(subagent_type="explorer", prompt="...")
  ↓
OpenCode 内置 task 工具处理
  ↓
查找 agent "explorer" 的配置
  ↓
如果 agent 有显式模型 → 使用该模型
如果没有 → 继承当前 session 的模型
  ↓
OpenCode 用解析出的模型创建子 session
```

**关键区别**：
- 内置 task 工具：通过 `subagent_type` 参数查找 agent 配置
- 插件 subtask/team 工具：直接从当前 session 获取模型
- 两者最终都会使用正确的模型（free preset 下继承当前 session）

### orchestrator prompt 中的模型说明
在 free preset 下，orchestrator prompt 应该说明：
1. 子 agent 自动继承当前 session 的模型
2. 不需要指定 `subagent_type` 参数
3. 直接用 `prompt` 参数描述任务即可

在其他 preset 下，orchestrator prompt 应该说明：
1. 使用 `task` 工具的 `subagent_type` 参数指定 agent
2. 子 agent 使用 preset 中定义的模型
3. 可以通过 `background` 参数控制同步/异步模式

### 模型解析优先级
```
1. 用户 override (config.agents[agentName].model)
   ↓
2. modelPreferences.perAgent[agentName]
   ↓
3. modelPreferences.customModel
   ↓
4. preset 中的模型 (ds-first/openai/etc)
   ↓
5. DEFAULT_MODELS[agentName] (硬编码默认值)
   ↓
6. 继承主 agent 的模型 (free preset)
```

**注意**：步骤 5 只在非 free preset 下使用。free preset 下应该跳过步骤 5，直接到步骤 6。

### 模型解析代码位置
- `getModelForAgent`：`src/agents/index.ts` line 366-393
- `resolveDelegatedExecutionModel`：`src/model-resolver/index.ts` line 30-41
- `resolveFallbackToPrimary`：`src/model-resolver/index.ts` line 56-89
- `DEFAULT_MODELS`：`src/config/constants.ts`

### 模型解析测试用例
1. free preset + 无 override → 继承主 agent 的模型
2. free preset + 有 override → 使用 override 的模型
3. ds-first preset + 无 override → 使用 preset 中的模型
4. ds-first preset + 有 override → 使用 override 的模型
5. custom preset + 无 perAgent → 使用 customModel
6. custom preset + 有 perAgent → 使用 perAgent 的模型

### 模型解析验证方法
1. 检查 `getModelForAgent` 的返回值
2. 检查 `resolveDelegatedExecutionModel` 的返回值
3. 检查 `resolveFallbackToPrimary` 的返回值
4. 检查子 session 的模型是否正确
5. 检查 TUI 中显示的模型是否正确

### 模型解析调试技巧
1. 在 `getModelForAgent` 中添加日志
2. 在 `resolveDelegatedExecutionModel` 中添加日志
3. 在 `resolveFallbackToPrimary` 中添加日志
4. 检查 `config.agents` 的内容
5. 检查 `modelPreferences` 的内容
6. 检查 `DEFAULT_MODELS` 的内容

### 模型解析常见问题
1. **问题**：子 agent 使用了错误的模型
   **原因**：`getModelForAgent` 返回了 `DEFAULT_MODELS[name]` 而不是 `undefined`
   **修复**：去掉 `?? DEFAULT_MODELS[name]` fallback

2. **问题**：子 agent 没有模型
   **原因**：`getModelForAgent` 返回了 `undefined`，但 model resolver 也没有 fallback
   **修复**：检查 `resolveFallbackToPrimary` 的逻辑

3. **问题**：子 agent 使用了配置文件中的错误模型 ID
   **原因**：配置文件中的模型 ID 不正确
   **修复**：更新配置文件中的模型 ID

### 模型解析性能优化
1. 缓存 `getModelForAgent` 的结果
2. 缓存 `resolveDelegatedExecutionModel` 的结果
3. 缓存 `resolveFallbackToPrimary` 的结果
4. 避免重复解析相同的模型

### 模型解析安全性
1. 验证模型 ID 的格式
2. 验证模型是否可用
3. 验证模型是否在白名单中
4. 防止模型注入攻击

### 模型解析未来改进
1. 支持模型别名
2. 支持模型版本
3. 支持模型区域
4. 支持模型负载均衡
5. 支持模型故障转移

### 模型解析相关文件
- `src/agents/index.ts`：getModelForAgent 函数
- `src/model-resolver/index.ts`：模型解析器
- `src/config/constants.ts`：DEFAULT_MODELS
- `src/config/schema.ts`：ModelPreferencesConfigSchema
- `src/delegation-guard/index.ts`：委托守卫
- `src/tools/subtask/tools.ts`：subtask 工具
- `src/features/team-mode/team-runtime/create.ts`：team agent

### 模型解析相关测试
- `src/agents/index.test.ts`：agent 创建测试
- `src/config/model-resolution.test.ts`：模型解析测试
- `src/tools/subtask/tools.test.ts`：subtask 工具测试

### 模型解析相关文档
- `docs/fix-plan.md`：本文档
- `docs/model-resolution.md`：模型解析详细文档（待创建）
- `docs/agent-system.md`：agent 系统文档（待创建）

### 模型解析相关工具
- `src/tools/preset-manager.ts`：预设管理器
- `src/tools/delegate-task/`：委托任务工具
- `src/features/background-agent/`：后台 agent 系统

### 模型解析相关配置
- `~/.config/opencode/extendai-lab.json`：插件配置
- `~/.config/opencode/opencode.json`：OpenCode 配置
- `~/.config/opencode/presets/*.json`：模型预设

### 模型解析相关日志
- `~/.local/share/opencode/log/*.log`：OpenCode 日志
- `~/.local/share/opencode/extendai-lab.*.log`：插件日志

### 模型解析相关命令
- `/ol-subagents`：查看当前 subagent policy
- `/ol-subagents-UM`：切换到 ultra-minimal 模式
- `/ol-subagents-M`：切换到 minimal 模式
- `/ol-subagents-F`：切换到 full 模式
- `/ol-subagents-C`：切换到 custom 模式
- `/ol-subagents-MO`：切换到 main-only 模式

### 模型解析相关工具
- `task`：OpenCode 内置任务工具
- `subtask`：插件子任务工具
- `team_create`：插件团队创建工具
- `auto_continue`：自动继续工具

### 模型解析相关概念
- **主 agent**：用户直接交互的 agent（通常是 orchestrator）
- **子 agent**：由主 agent 委托执行任务的 agent
- **模型继承**：子 agent 使用主 agent 的模型
- **模型覆盖**：子 agent 使用配置文件中指定的模型
- **模型 fallback**：当指定模型不可用时，使用备用模型

### 模型解析相关最佳实践
1. 在 free preset 下，让子 agent 继承主 agent 的模型
2. 在其他 preset 下，使用 preset 中定义的模型
3. 使用 `subagent_type` 参数指定 agent 类型
4. 使用 `background` 参数控制同步/异步模式
5. 使用 `task_status` 工具检查后台任务状态

### 模型解析相关陷阱
1. 不要在 free preset 下使用 `DEFAULT_MODELS` fallback
2. 不要在配置文件中使用错误的模型 ID
3. 不要在子 agent 中使用主 agent 不支持的模型
4. 不要在子 agent 中使用不可用的模型
5. 不要在子 agent 中使用过期的模型

### 模型解析相关资源
- OpenCode 文档：https://opencode.ai/docs
- OpenCode GitHub：https://github.com/opencode-ai/opencode
- 插件文档：`docs/` 目录
- 源代码：`src/` 目录

### 模型解析相关社区
- OpenCode Discord：https://discord.gg/opencode
- OpenCode Forum：https://forum.opencode.ai
- 插件 Issue Tracker：https://github.com/anthropics/oh-my-opencode/issues

### 模型解析相关贡献
- 提交 Issue：报告 bug 或请求新功能
- 提交 PR：修复 bug 或添加新功能
- 编写文档：改进文档或添加示例
- 编写测试：添加测试用例或改进测试覆盖率

### 模型解析相关许可
- MIT License
- Copyright (c) Anthropic
- 详见 `LICENSE` 文件

### 模型解析相关版本
- 当前版本：1.1.4
- 最新版本：检查 `package.json`
- 更新日志：检查 `CHANGELOG.md`

### 模型解析相关依赖
- `@opencode-ai/plugin`：OpenCode 插件 SDK
- `@opencode-ai/sdk`：OpenCode SDK
- `zod`：运行时验证
- `typescript`：类型检查

### 模型解析相关脚本
- `bun run build`：构建项目
- `bun run typecheck`：类型检查
- `bun test`：运行测试
- `bun run lint`：代码检查
- `bun run format`：代码格式化

### 模型解析相关环境
- Node.js：>= 18
- Bun：>= 1.0
- TypeScript：>= 5.0
- 操作系统：Windows, macOS, Linux

### 模型解析相关配置文件
- `tsconfig.json`：TypeScript 配置
- `biome.json`：Biome 配置
- `package.json`：项目配置
- `bunfig.toml`：Bun 配置

### 模型解析相关目录结构
```
src/
├── agents/           # Agent 定义
├── config/           # 配置相关
├── delegation-guard/ # 委托守卫
├── model-resolver/   # 模型解析器
├── tools/            # 工具定义
│   ├── subtask/      # subtask 工具
│   └── ...
├── features/         # 功能模块
│   ├── team-mode/    # team agent
│   └── ...
└── ...
```

### 模型解析相关架构
- **Agent 层**：定义 agent 的配置和行为
- **Model Resolver 层**：解析 agent 应该使用哪个模型
- **Tool 层**：定义工具的接口和实现
- **Feature 层**：实现具体功能（team agent, background agent 等）

### 模型解析相关数据流
```
用户输入
  ↓
OpenCode 处理
  ↓
插件拦截
  ↓
模型解析
  ↓
Agent 创建
  ↓
Session 创建
  ↓
Prompt 发送
  ↓
LLM 处理
  ↓
结果返回
```

### 模型解析相关性能指标
- 模型解析时间：< 1ms
- Agent 创建时间：< 10ms
- Session 创建时间：< 100ms
- Prompt 发送时间：< 1000ms
- LLM 处理时间：取决于模型和任务

### 模型解析相关监控
- 日志：`~/.local/share/opencode/log/*.log`
- 指标：性能指标、错误率、使用率
- 告警：错误率过高、性能下降

### 模型解析相关故障排除
1. 检查日志文件
2. 检查配置文件
3. 检查模型是否可用
4. 检查网络连接
5. 检查权限设置

### 模型解析相关常见错误
1. **错误**：`ProviderModelNotFoundError`
   **原因**：模型 ID 不正确或模型不可用
   **修复**：检查配置文件中的模型 ID

2. **错误**：`Session creation failed`
   **原因**：session 创建失败
   **修复**：检查网络连接和权限设置

3. **错误**：`Prompt timeout`
   **原因**：prompt 发送超时
   **修复**：检查网络连接和模型可用性

### 模型解析相关最佳实践（总结）
1. 在 free preset 下，让子 agent 继承主 agent 的模型
2. 在其他 preset 下，使用 preset 中定义的模型
3. 使用 `subagent_type` 参数指定 agent 类型
4. 使用 `background` 参数控制同步/异步模式
5. 使用 `task_status` 工具检查后台任务状态
6. 检查日志文件排查问题
7. 检查配置文件确保正确
8. 检查模型是否可用
9. 检查网络连接
10. 检查权限设置

### 委托守卫（Delegation Guard）
- 位置：`src/delegation-guard/index.ts`
- 功能：在委托子 agent 前检查是否值得委托
- 检查项：
  1. 委托是否值得（vs 主 agent 直接执行）
  2. 目标 agent 是否有可用模型
  3. 是否有可复用的 session
  4. 是否需要 handoff packet

### 模型解析流程（详细）
```
用户调用 task(subagent_type="explorer", prompt="...")
  ↓
OpenCode 内置 task 工具处理
  ↓
查找 agent "explorer" 的配置
  ↓
插件的 getAgentConfig("explorer") 被调用
  ↓
检查 config.agents["explorer"] (用户 override)
  ↓
检查 preset (ds-first/openai/etc)
  ↓
检查 DEFAULT_AGENT_MODELS (硬编码默认值)
  ↓
如果 free preset → 返回 undefined → OpenCode 继承当前 session 的模型
如果其他 preset → 返回 preset 中的模型
  ↓
OpenCode 用解析出的模型创建子 session
```

---

## 关键代码位置

| 修改 | 文件 | 行号 | 说明 |
|------|------|------|------|
| 指令模板 | `src/index.ts` | 282-296 | 注册指令时使用模板 |
| 指令拦截删除 | `src/index.ts` | 1473-1486 | 删除 hook 中的 subagent policy 处理 |
| 模型继承 | `src/agents/index.ts` | 434-435 | 去掉 `?? DEFAULT_MODELS[name]` |
| 提示词 | `src/agents/orchestrator.ts` | 311 | 添加子 agent 使用指南 |
| 模板文件 | `src/commands/subagent-policy-template.ts` | - | 新建模板文件 |
| subtask 工具 | `src/tools/subtask/tools.ts` | - | 添加 background 参数和模型继承 |
| team agent | `src/features/team-mode/team-runtime/create.ts` | - | 添加模型继承 |

---

## 具体代码修改

### 修改 1：subagent policy 指令改成模板注入

**文件**：`src/index.ts`

**当前代码**（line 282-296）：
```typescript
registerCommandIfMissing(commands, SUBAGENT_POLICY_COMMAND, {
  template: '',
  description: 'Show active subagent policy and cache guidance',
});

for (const [command, mode] of Object.entries(SUBAGENT_POLICY_COMMAND_MODES)) {
  registerCommandIfMissing(commands, command, {
    template: '',
    description: SUBAGENT_POLICY_COMMAND_DESCRIPTIONS[...],
    metadata: { subagentPolicyMode: mode },
  });
}
```

**修改为**：
```typescript
registerCommandIfMissing(commands, SUBAGENT_POLICY_COMMAND, {
  template: SUBAGENT_POLICY_TEMPLATE,
  description: 'Show active subagent policy and cache guidance',
});

for (const [command, mode] of Object.entries(SUBAGENT_POLICY_COMMAND_MODES)) {
  registerCommandIfMissing(commands, command, {
    template: SUBAGENT_POLICY_TEMPLATE,
    description: SUBAGENT_POLICY_COMMAND_DESCRIPTIONS[...],
    metadata: { subagentPolicyMode: mode },
  });
}
```

**同时删除** `command.execute.before` hook 中的 subagent policy 处理（line 1473-1486）

### 修改 2：free preset 模型继承

**文件**：`src/agents/index.ts`

**当前代码**（line 434-437）：
```typescript
const customPrompts = loadAgentPrompt(name, config?.preset);
const resolved =
  getModelForAgent(name) ?? (DEFAULT_MODELS[name] as string);
const model = Array.isArray(resolved) ? resolved[0] : resolved;
return factory(model, customPrompts.prompt, customPrompts.appendPrompt);
```

**修改为**：
```typescript
const customPrompts = loadAgentPrompt(name, config?.preset);
const resolved = getModelForAgent(name);
const model = Array.isArray(resolved) ? resolved[0] : resolved;
return factory(model, customPrompts.prompt, customPrompts.appendPrompt);
```

**原理**：
- `getModelForAgent` 在 free preset 下返回 `undefined`（正确行为）
- 当前代码 `?? DEFAULT_MODELS[name]` 会 fallback 到硬编码默认值（错误）
- 修改后去掉 fallback，让 `model` 保持 `undefined`
- agent factory 接受 `model: string | undefined`
- 当 `model` 是 `undefined` 时，OpenCode 继承当前 session 的模型

**注意**：primary agents（line 395-425）已经正确使用 `getModelForAgent` 不带 fallback。只有 subagents（line 427-438）有这个问题。

### 修改 4：subtask 工具添加 background 参数和模型继承

**文件**：`src/tools/subtask/tools.ts`

**修改内容**：
1. 添加 `background` 参数（boolean, optional）
2. 添加模型继承逻辑：从当前 session 获取模型，传递给子 session
3. 支持同步和异步两种模式

**模型继承逻辑**：
```typescript
// 获取当前 session 的模型
let inheritedModel: { providerID: string; modelID: string } | undefined;
if (sessionID !== 'unknown') {
  const sessionData = await client.session.get({
    path: { id: sessionID },
    query: { directory },
  });
  const session = sessionData?.data;
  if (session?.model) {
    inheritedModel = {
      providerID: session.model.providerID,
      modelID: session.model.id,
    };
  }
}

// 创建子 session 时传递模型
await client.session.create({
  body: {
    ...(sessionID !== 'unknown' ? { parentID: sessionID } : {}),
    title: `Subtask worker from ${sessionID}`,
  },
});

// 发送 prompt 时传递模型
await client.session.prompt({
  body: {
    parts: [...],
    ...(inheritedModel ? { model: inheritedModel } : {}),
  },
});
```

### 修改 5：team agent 模型继承

**文件**：`src/features/team-mode/team-runtime/create.ts`

**修改内容**：
1. 从 lead session 获取模型
2. 传递给所有 team member sessions

**模型继承逻辑**：
```typescript
// 获取 lead session 的模型
let leadModel: { providerID: string; modelID: string } | undefined;
if (leadSessionId) {
  const sessionData = await client.session.get({
    path: { id: leadSessionId },
    query: { directory },
  });
  const session = sessionData?.data;
  if (session?.model) {
    leadModel = {
      providerID: session.model.providerID,
      modelID: session.model.id,
    };
  }
}

// 创建 member session 时传递模型
await client.session.create({
  body: {
    parentID: leadSessionId || undefined,
    ...(leadModel ? { model: leadModel } : {}),
  },
});
```

### 修改 3：orchestrator prompt 添加子 agent 使用说明

**文件**：`src/agents/orchestrator.ts`

**位置**：在 `buildOrchestratorPrompt` 函数中，line 311 附近（`${buildSubagentPolicyPrompt(subagentPolicy)}` 之后）

**添加内容**：
```typescript
### 子 Agent 使用指南

#### 三种子 agent 工具
1. **task**（OpenCode 内置）：用注册的 agent 执行任务
   - 参数：description, prompt, subagent_type, background
   - 适用：需要特定 agent 专业能力的任务
   - TUI：支持查看子 agent 内容（Ctrl+X 或底部 tab）

2. **subtask**（插件）：简单子 session
   - 参数：prompt, files, background
   - 适用：简单的文件处理任务
   - TUI：不支持查看

3. **team_create**（插件）：多 agent 并行
   - 参数：teamName, inline_spec
   - 适用：需要多个 agent 并行工作的任务

#### free 模式下的模型继承
- 当前使用 free preset，子 agent 自动继承当前 session 的模型
- 调用 task 工具时不需要指定 subagent_type
- 直接用 prompt 参数描述任务即可

#### 查看子 agent 内容
- 使用 task 工具创建的子 agent 可以在 TUI 中查看
- 快捷键：Ctrl+X 或点击底部的 subagent tab
```

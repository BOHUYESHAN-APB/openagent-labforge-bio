# 指令系统完整审查

> **v1.3.5 更新**: subagentPolicy 系统已完全移除。`subagentPolicy` 配置字段和
> `/ol-subagents-*` 指令均不再使用。Agent 注册仅使用 `disabled_agents`。
> 新增 `plan_enter`/`plan_exit` 工具用于 plan 模式切换。

## 当前机制

### 机制 1：Agent 模型配置（Model Presets）
- **作用**：控制每个 agent 使用哪个模型
- **配置位置**：`extendai-lab.json` 的 `modelPreferences` 字段
- **生效方式**：调用 `client.config.update()` → 运行时立即生效

---

## 指令清单（完整）

### 1. Model Preset 指令（Agent 模型配置）

| 指令 | 注册状态 | Hook 拦截 | 当前行为 | 正确行为 | 状态 |
|------|----------|-----------|----------|----------|------|
| `/ol-preset` | ✅ 已注册 | ✅ 已拦截 | 列出可用预设 | 列出可用预设 | ✅ 正确 |
| `/ol-preset-free` | ✅ 已注册 | ✅ 已拦截 | 切换到 free 预设 | 切换到 free 预设 | ✅ 正确 |
| `/ol-preset-ds-first` | ✅ 已注册 | ✅ 已拦截 | 切换到 ds-first 预设 | 切换到 ds-first 预设 | ✅ 正确 |
| `/ol-preset-openai` | ✅ 已注册 | ✅ 已拦截 | 切换到 openai 预设 | 切换到 openai 预设 | ✅ 正确 |
| `/ol-preset-openai-go` | ✅ 已注册 | ✅ 已拦截 | 切换到 openai-go 预设 | 切换到 openai-go 预设 | ✅ 正确 |
| `/ol-preset-ds-mimo` | ✅ 已注册 | ✅ 已拦截 | 切换到 ds-mimo 预设 | 切换到 ds-mimo 预设 | ✅ 正确 |
| `/ol-preset-3-mix` | ✅ 已注册 | ✅ 已拦截 | 切换到 3-mix 预设 | 切换到 3-mix 预设 | ✅ 正确 |
| `/ol-preset-custom` | ✅ 已注册 | ✅ 已拦截 | 切换到 custom 预设 | 切换到 custom 预设 | ✅ 正确 |

**正确实现**：通过 `client.config.update()` 运行时切换，无需重启

### 3. Auto-Continue 指令

| 指令 | 注册状态 | Hook 拦截 | 当前行为 | 正确行为 | 状态 |
|------|----------|-----------|----------|----------|------|
| `/ol-auto-continue-on` | ✅ 已注册 | ✅ 已拦截 | 重写为 `/ol-auto-continue on` | 重写为 `/ol-auto-continue on` | ✅ 正确 |
| `/ol-auto-continue-off` | ✅ 已注册 | ✅ 已拦截 | 重写为 `/ol-auto-continue off` | 重写为 `/ol-auto-continue off` | ✅ 正确 |
| `/ol-auto-continue` | ✅ 已注册 | ✅ 已拦截 | 调用 auto_continue 工具 | 调用 auto_continue 工具 | ✅ 正确 |

**正确实现**：hook 拦截 → 重写命令 → LLM 执行重写后的命令

### 4. Checkpoint 指令

| 指令 | 注册状态 | Hook 拦截 | 当前行为 | 正确行为 | 状态 |
|------|----------|-----------|----------|----------|------|
| `/ol-checkpoint-light` | ✅ 已注册 | ✅ 已拦截 | 重写为 `/ol-checkpoint light` | 重写为 `/ol-checkpoint light` | ✅ 正确 |
| `/ol-checkpoint-heavy` | ✅ 已注册 | ✅ 已拦截 | 重写为 `/ol-checkpoint heavy` | 重写为 `/ol-checkpoint heavy` | ✅ 正确 |
| `/ol-checkpoint-resume-latest` | ✅ 已注册 | ✅ 已拦截 | 重写为 `/ol-checkpoint-resume latest` | 重写为 `/ol-checkpoint-resume latest` | ✅ 正确 |

**正确实现**：hook 拦截 → 重写命令 → LLM 执行重写后的命令

### 5. 其他指令

| 指令 | 注册状态 | Hook 拦截 | 当前行为 | 正确行为 | 状态 |
|------|----------|-----------|----------|----------|------|
| `/ol-light` | ✅ 已注册 | ✅ 已拦截 | 切换到 light 模式 | 切换到 light 模式 | ✅ 正确 |
| `/ol-heavy` | ✅ 已注册 | ✅ 已拦截 | 切换到 heavy 模式 | 切换到 heavy 模式 | ✅ 正确 |
| `/ol-turbo` | ✅ 已注册 | ✅ 已拦截 | 切换到 turbo 模式 | 切换到 turbo 模式 | ✅ 正确 |
| `/ol-start-work` | ✅ 已注册 | ✅ 已拦截 | 开始工作流 | 开始工作流 | ✅ 正确 |
| `/ol-ralph-loop` | ✅ 已注册 | ✅ 已拦截 | 启动 Ralph 循环 | 启动 Ralph 循环 | ✅ 正确 |
| `/ol-cancel-ralph` | ✅ 已注册 | ✅ 已拦截 | 取消 Ralph 循环 | 取消 Ralph 循环 | ✅ 正确 |
| `/ol-stop-continuation` | ✅ 已注册 | ✅ 已拦截 | 停止自动继续 | 停止自动继续 | ✅ 正确 |
| `/ol-karpathy` | ✅ 已注册 | ✅ 已拦截 | 应用 Karpathy 规则 | 应用 Karpathy 规则 | ✅ 正确 |

---

## 当前状态

### 已正确实现的指令

1. **Model Preset 指令**：通过 `client.config.update()` 运行时切换，无需重启
2. **Auto-Continue 指令**：hook 拦截 → 重写命令 → LLM 执行
3. **Checkpoint 指令**：hook 拦截 → 重写命令 → LLM 执行
4. **其他指令**：hook 拦截 → 执行相应逻辑

### v1.3.5 变更

- **subagentPolicy 系统已移除**：`/ol-subagents-*` 指令已删除，`subagentPolicy` 配置不再生效
- **新增 plan_enter/plan_exit 工具**：用于 plan 模式切换，通过 tool 定义而非指令
- Agent 注册仅使用 `disabled_agents` 配置

---

## 验证方法

### 1. 验证 model preset 切换

```bash
# 1. 输入 /ol-preset-ds-first
# 2. 检查模型是否切换
# 应该看到: 模型切换成功，无需重启

# 3. 输入 /ol-preset
# 4. 检查是否显示当前预设
# 应该看到: ds-first ← active
```

### 3. 验证 auto-continue

```bash
# 1. 输入 /ol-auto-continue-on
# 2. 检查是否开启自动继续
# 应该看到: 自动继续已开启

# 3. 输入 /ol-auto-continue-off
# 4. 检查是否关闭自动继续
# 应该看到: 自动继续已关闭
```

---

## 总结

### 当前状态
- ✅ Model Preset 指令：已正确实现（运行时切换，无需重启）
- ✅ Auto-Continue 指令：已正确实现（hook 拦截 → 重写命令）
- ✅ Checkpoint 指令：已正确实现（hook 拦截 → 重写命令）
- ⏭️ Subagent Policy 指令：v1.3.5 已移除（系统已删除）

### 关键点
1. **Agent 模型配置（Model Presets）**：通过 `client.config.update()` 运行时切换
2. **动态切换**：预设切换无需重启，即时生效
3. **Agent 注册**：v1.3.5+ 仅使用 `disabled_agents` 配置

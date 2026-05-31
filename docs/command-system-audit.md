# 指令系统完整审查

## 两套机制

### 机制 1：Agent 数量控制（Subagent Policy）
- **作用**：控制主 agent 可以调用哪些子 agent
- **配置位置**：`extendai-lab.json` 的 `subagentPolicy` 字段
- **生效方式**：修改配置文件 → 下一轮对话读取配置 → 应用新的 agent 列表

### 机制 2：Agent 模型配置（Model Presets）
- **作用**：控制每个 agent 使用哪个模型
- **配置位置**：`extendai-lab.json` 的 `modelPreferences` 字段
- **生效方式**：调用 `client.config.update()` → 运行时立即生效

---

## 指令清单（完整）

### 1. Subagent Policy 指令（Agent 数量控制）

| 指令 | 注册状态 | Hook 拦截 | 当前行为 | 正确行为 | 状态 |
|------|----------|-----------|----------|----------|------|
| `/ol-subagents` | ✅ 已注册 | ✅ 已拦截 | 生成 policy 文本 → 发给 LLM | 生成 policy 文本 → 发给 LLM | ✅ 正确 |
| `/ol-subagents-UM` | ✅ 已注册 | ✅ 已拦截 | 生成 policy 文本 → 发给 LLM | 修改配置 → 生成确认信息 | ❌ 需要修改 |
| `/ol-subagents-M` | ✅ 已注册 | ✅ 已拦截 | 生成 policy 文本 → 发给 LLM | 修改配置 → 生成确认信息 | ❌ 需要修改 |
| `/ol-subagents-F` | ✅ 已注册 | ✅ 已拦截 | 生成 policy 文本 → 发给 LLM | 修改配置 → 生成确认信息 | ❌ 需要修改 |
| `/ol-subagents-C` | ✅ 已注册 | ✅ 已拦截 | 生成 policy 文本 → 发给 LLM | 修改配置 → 生成确认信息 | ❌ 需要修改 |
| `/ol-subagents-MO` | ✅ 已注册 | ✅ 已拦截 | 生成 policy 文本 → 发给 LLM | 修改配置 → 生成确认信息 | ❌ 需要修改 |

**问题**：当前只是生成文本发给 LLM，没有实际修改配置文件
**修复**：在 hook 中添加配置文件修改逻辑

### 2. Model Preset 指令（Agent 模型配置）

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

## 问题总结

### 需要修改的指令（1 个问题，影响 5 个指令）

**问题**：subagent policy 切换指令（`/ol-subagents-UM/M/F/C/MO`）只是生成文本发给 LLM，没有实际修改配置文件

**影响**：
- `/ol-subagents-UM`：切换到 ultra-minimal 模式
- `/ol-subagents-M`：切换到 minimal 模式
- `/ol-subagents-F`：切换到 full 模式
- `/ol-subagents-C`：切换到 custom 模式
- `/ol-subagents-MO`：切换到 main-only 模式

**修复方案**：
1. 在 hook 中添加配置文件修改逻辑
2. 调用 `writeExtendaiConfig()` 修改 `subagentPolicy.mode` 字段
3. 生成确认信息（不是 policy 文本）
4. 注入到 output.parts

### 已正确实现的指令

1. **Model Preset 指令**：通过 `client.config.update()` 运行时切换，无需重启
2. **Auto-Continue 指令**：hook 拦截 → 重写命令 → LLM 执行
3. **Checkpoint 指令**：hook 拦截 → 重写命令 → LLM 执行
4. **其他指令**：hook 拦截 → 执行相应逻辑

---

## 代码修改计划

### 修改 1：subagent policy 切换指令

**文件**：`src/index.ts`

**位置**：`command.execute.before` hook（line 1473-1486）

**当前代码**：
```typescript
if (
  typedInput.command === SUBAGENT_POLICY_COMMAND ||
  getSubagentPolicyModeForCommand(typedInput.command)
) {
  const requestedMode =
    getSubagentPolicyModeForCommand(typedInput.command) ??
    parseSubagentPolicyMode(typedInput.arguments);
  typedOutput.parts.length = 0;
  typedOutput.parts.push(
    createInternalAgentTextPart(
      formatSubagentPolicyStatus(config, requestedMode),
    ),
  );
}
```

**修改为**：
```typescript
if (
  typedInput.command === SUBAGENT_POLICY_COMMAND ||
  getSubagentPolicyModeForCommand(typedInput.command)
) {
  const requestedMode =
    getSubagentPolicyModeForCommand(typedInput.command) ??
    parseSubagentPolicyMode(typedInput.arguments);
  
  // 如果是切换模式的指令，修改配置文件
  if (requestedMode && typedInput.command !== SUBAGENT_POLICY_COMMAND) {
    // 读取当前配置
    const currentConfig = readExtendaiConfig();
    
    // 修改配置
    writeExtendaiConfig({
      ...currentConfig,
      subagentPolicy: {
        ...currentConfig.subagentPolicy,
        mode: requestedMode,
      },
    });
    
    // 生成确认信息
    const confirmation = `✅ 已切换到 ${requestedMode} 模式

可用子 agent: ${getAllowedAgentsForMode(requestedMode).join(', ')}
生效时间: 下一轮对话

注意: 当前对话仍使用旧的 policy，新 policy 将在下一轮对话中生效`;
    
    typedOutput.parts.length = 0;
    typedOutput.parts.push(
      createInternalAgentTextPart(confirmation),
    );
  } else {
    // 查看当前 policy
    typedOutput.parts.length = 0;
    typedOutput.parts.push(
      createInternalAgentTextPart(
        formatSubagentPolicyStatus(config, requestedMode),
      ),
    );
  }
}
```

**需要添加的函数**：
```typescript
function readExtendaiConfig(): Record<string, unknown> {
  const configPath = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.config',
    'opencode',
    'extendai-lab.json',
  );
  
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  }
  
  return {};
}

function writeExtendaiConfig(config: Record<string, unknown>): void {
  const configPath = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.config',
    'opencode',
    'extendai-lab.json',
  );
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function getAllowedAgentsForMode(mode: string): string[] {
  const modeAgents: Record<string, string[]> = {
    'ultra-minimal': ['explorer', 'librarian', 'oracle'],
    'minimal': ['explorer', 'librarian', 'oracle', 'fixer'],
    'full': ['explorer', 'librarian', 'oracle', 'fixer', 'designer', 'council', 'reviewer'],
    'custom': [], // 从配置文件读取
    'main-only': [], // 不允许子 agent
  };
  
  return modeAgents[mode] || [];
}
```

---

## 验证方法

### 1. 验证 subagent policy 切换

```bash
# 1. 输入 /ol-subagents-UM
# 2. 检查配置文件是否被修改
cat ~/.config/opencode/extendai-lab.json | grep subagentPolicy
# 应该看到: "mode": "ultra-minimal"

# 3. 输入 /ol-subagents
# 4. 检查是否显示当前 policy
# 应该看到: Active mode: ultra-minimal
```

### 2. 验证 model preset 切换

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
- ❌ Subagent Policy 指令：需要修改（添加配置文件修改逻辑）

### 修改计划
1. 修改 `src/index.ts` 的 `command.execute.before` hook
2. 添加配置文件读写函数
3. 添加模式对应的 agent 列表函数
4. 测试验证

### 关键点
1. **两套机制**：Agent 数量控制（subagent policy）和 Agent 模型配置（model presets）
2. **动态切换**：两者都应该支持运行时切换，无需重启
3. **配置文件**：subagent policy 存储在 `extendai-lab.json` 的 `subagentPolicy` 字段
4. **运行时更新**：model presets 通过 `client.config.update()` 运行时更新

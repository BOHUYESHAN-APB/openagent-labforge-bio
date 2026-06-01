# Checkpoint + Compaction 机制设计文档

> 最后更新: 2026-06-01
> 状态: 已实现，待集成测试

## 概述

Checkpoint 是上下文压缩（Compaction）的**补强板**。两者协同工作：

- **Compaction**：短距离处理，压缩对话历史为摘要，解决"上下文窗口不够用"
- **Checkpoint**：保存完整状态，解决"压缩丢了东西"

```
上下文压力 (Context Pressure)
    │
    ├── L1 (50%)  → 轻量微调，保持简洁
    ├── L2 (65%)  → 压缩 + 轻量 checkpoint
    └── L3 (90%)  → 强压缩 + 重量 checkpoint
          │
          ▼
    ┌─────────────┐
    │  Compaction  │ ← 短距离：压缩对话历史
    │  (压缩机制)  │    保留摘要，丢弃细节
    └─────────────┘
          │ 压缩前自动创建 checkpoint
          ▼
    ┌─────────────┐
    │  Checkpoint  │ ← 补强板：保存完整状态
    │  (检查点机制) │    压缩丢失的细节在这里
    └─────────────┘
```

---

## Checkpoint 级别

| 级别 | 用途 | 内容 | 触发方式 | 生命周期 |
|------|------|------|----------|----------|
| **Light** | 日常开发记录，同会话恢复 | 当前任务、关键文件、最近决策 | 手动 / L2 压力自动 | 同会话内有效 |
| **Heavy** | 跨会话交接，长时间工作 | 完整状态、所有决策、详细上下文 | 手动 / L3 压力自动 | 跨会话有效 |

## Checkpoint 状态

```
active      → 刚创建，可用
consumed    → 已被 resume 使用
superseded  → 被更新的 checkpoint 替代
archived    → 历史存档
```

## Checkpoint 触发源

| 触发源 | 说明 |
|--------|------|
| `manual` | 用户通过 `/ol-checkpoint` 手动创建 |
| `auto-compaction` | 压缩前自动创建（关键集成点） |
| `auto-pressure` | 上下文压力达到 L2/L3 时自动创建 |
| `auto-review` | Review 完成后自动创建 |

---

## 文件结构

```
.opencode/extendai-lab/checkpoints/
├── latest.md                    ← 全局最新（任何会话创建的）
├── latest.meta.json             ← 元数据（ID、级别、状态）
├── by-session/
│   ├── {session-a}.md           ← 会话 A 的最新 checkpoint
│   ├── {session-a}.meta.json
│   ├── {session-b}.md           ← 会话 B 的最新 checkpoint
│   └── {session-b}.meta.json
└── history/
    ├── {session-a}/
    │   ├── 20260601-120000-light.md
    │   ├── 20260601-130000-heavy.md
    │   └── ...
    └── {session-b}/
        └── ...
```

### latest.meta.json 格式

```json
{
  "checkpoint_id": "cp_1717234567890_abc1234",
  "checkpoint_level": "light",
  "checkpoint_status": "active",
  "checkpoint_trigger": "manual",
  "source_session_id": "session-xyz",
  "created_at": "2026-06-01T12:00:00Z",
  "goal": "实现 checkpoint 版本化",
  "session_switch_recommendation": "stay",
  "pre_compaction": false,
  "checkpoint_history": ["cp_xxx", "cp_yyy"]
}
```

---

## 核心 API

### CheckpointManager 新增方法

```typescript
// 创建版本化 checkpoint（主入口）
createVersionedCheckpoint(sessionID, content, options): ContextCheckpoint

// 标记 checkpoint 为已消费
consumeCheckpoint(checkpointID, consumedBySession): boolean

// 获取会话最新的活跃 checkpoint
getLatestCheckpoint(sessionID): ContextCheckpoint | undefined

// 获取工作区最新的活跃 checkpoint（跨会话）
getWorkspaceLatestCheckpoint(workspaceRoot): ContextCheckpoint | undefined

// 获取会话的 checkpoint 历史
getCheckpointHistory(sessionID): ContextCheckpoint[]

// 压缩前自动创建 checkpoint（关键集成点）
createPreCompactionCheckpoint(sessionID, currentContext): ContextCheckpoint | null

// 获取 checkpoint 统计
getCheckpointStats(sessionID): { total, active, consumed, superseded, light, heavy }
```

### Persistence 新增方法

```typescript
// 写入 checkpoint markdown 文件
writeCheckpointFile(workspaceRoot, checkpoint, content): string

// 写入/读取 latest.meta.json
writeCheckpointMeta(workspaceRoot, meta): void
readCheckpointMeta(workspaceRoot): CheckpointMeta | null

// 读取 checkpoint 文件
readCheckpointFile(workspaceRoot, sessionID): string | null
readLatestCheckpoint(workspaceRoot): string | null
```

---

## 压缩联动流程

```
1. 用户触发压缩 (/compact 或自动)
         │
         ▼
2. experimental.session.compacting hook 触发
         │
         ▼
3. createPreCompactionCheckpoint() 自动创建 checkpoint
   ├── 检查是否已有最近 60 秒内的 checkpoint
   ├── 如果有 → 跳过，返回已有 checkpoint
   └── 如果没有 → 创建新的 light checkpoint
         │
         ▼
4. 替换压缩提示词（语言感知 + 增量压缩）
         │
         ▼
5. 执行压缩
         │
         ▼
6. checkpoint 保留压缩前的完整状态
```

---

## 命令

| 命令 | 说明 |
|------|------|
| `/ol-checkpoint` | 创建 checkpoint（自动判断轻量/重量） |
| `/ol-checkpoint l` | 创建轻量 checkpoint |
| `/ol-checkpoint h` | 创建重量 checkpoint |
| `/ol-checkpoint-light` | 创建轻量 checkpoint（快捷方式） |
| `/ol-checkpoint-heavy` | 创建重量 checkpoint（快捷方式） |
| `/ol-checkpoint-resume` | 从最新 checkpoint 恢复 |
| `/ol-checkpoint-resume latest` | 从工作区最新 checkpoint 恢复 |
| `/ol-checkpoint-resume {session-id}` | 从指定会话的 checkpoint 恢复 |

---

## 与上游 Compaction 的关系

### 上游设计

上游 OpenCode 的 `experimental.session.compacting` hook 允许：

| 操作 | 代码 | 效果 |
|------|------|------|
| 追加指令 | `output.context.push(...)` | 保留上游模板 + previousSummary |
| 替换提示词 | `output.prompt = "..."` | 完全替换，`buildPrompt()` 不被调用 |

### 我们的实现

我们使用 `output.prompt` 替换提示词（上游允许的正确机制），并在自己的模板中处理：

1. **语言检测** — 检测对话语言，输出对应语言
2. **增量压缩** — 检测历史压缩摘要并更新（替代上游 previousSummary）
3. **自动 checkpoint** — 压缩前自动创建 checkpoint

---

## 回滚指南

如果需要回滚到改动前的状态：

```bash
# 查看所有改动的文件
git diff --stat HEAD

# 回滚特定文件
git checkout HEAD -- src/checkpoint/manager.ts
git checkout HEAD -- src/checkpoint/persistence.ts
git checkout HEAD -- src/checkpoint/types.ts
git checkout HEAD -- src/commands/checkpoint-template.ts
git checkout HEAD -- src/commands/checkpoint-resume-template.ts
git checkout HEAD -- src/hooks/context-pressure.ts
git checkout HEAD -- src/context-pressure/index.ts
git checkout HEAD -- src/hooks/index.ts
git checkout HEAD -- src/index.ts

# 删除新增的 compaction hook
rm -rf src/hooks/compaction/

# 回滚全部
git checkout HEAD -- .
git clean -fd src/hooks/compaction/
```

---

## 测试验证

```bash
# 类型检查（只看我们改的文件）
bun run typecheck 2>&1 | Select-String "src/checkpoint|src/hooks/compaction|src/commands/checkpoint"

# checkpoint 测试
bun test src/checkpoint

# 全量测试
bun test
```

---

## 已知限制

1. **checkpoint 内容由 AI 生成** — checkpoint 的具体内容（goal、pending tasks 等）由 LLM 根据模板生成，质量取决于模型能力
2. **文件覆盖** — `latest.md` 和 `by-session/{id}.md` 每次覆盖，`history/` 目录保留完整历史
3. **pre-compaction 检测** — resume 时通过 `pre_compaction` 标志判断是否是压缩前创建的 checkpoint
4. **无自动清理** — 需要手动或通过 `cleanup()` 清理旧 checkpoint

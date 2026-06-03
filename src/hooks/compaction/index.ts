/**
 * 上下文压缩 Hook
 *
 * 通过 experimental.session.compacting hook 替换 OpenCode 原生压缩提示词，
 * 使用我们改进的中文提示词，提供更高质量的上下文压缩。
 *
 * 设计要点：
 * - 保留 OpenCode 原生的 /compact 命令和自动压缩触发机制
 * - 仅替换压缩提示词，不改变触发逻辑
 * - 压缩前自动创建 checkpoint（补强板机制）
 * - 压缩后注入恢复指令（用户发消息时自动注入）
 * - 语言感知：检测对话语言，输出对应语言
 * - 增量压缩：检测历史压缩摘要并更新
 * - 9 章节结构化输出
 */

import type { CheckpointManager } from '../../checkpoint/manager'
import { log } from '../../utils/logger'
import { getCompactionPrompt } from './prompt'

const HOOK_NAME = 'compaction'

/** Post-compaction recovery message injected into user's next message */
const POST_COMPACTION_RECOVERY = `**Post-Compaction Recovery**: A context compaction just occurred. Before continuing work, read the checkpoint file to recover detailed context:

1. Read \`.opencode/extendai-lab/checkpoints/latest.md\`
2. Read \`.opencode/extendai-lab/checkpoints/latest.meta.json\`
3. If checkpoint has pending tasks, continue from where you left off
4. This checkpoint was automatically created before compaction and contains the full context you need

---`

export interface CompactionHookOptions {
  /** 是否启用压缩提示词替换（默认 true） */
  enabled?: boolean
  /** 自定义附加指令 */
  customInstructions?: string
  /** Checkpoint manager instance for auto-checkpoint creation */
  checkpointManager?: CheckpointManager
}

/**
 * 创建上下文压缩 Hook
 *
 * 通过 experimental.session.compacting hook 替换 OpenCode 原生压缩提示词，
 * 并在压缩前自动创建 checkpoint，压缩后注入恢复指令。
 */
export function createCompactionHook(
  options?: CompactionHookOptions,
): {
  'experimental.session.compacting': (
    input: { sessionID?: string },
    output: { context: string[]; prompt?: string },
  ) => void
  'chat.message': (
    input: { sessionID: string },
    output: {
      message: Record<string, unknown>
      parts: Array<{ type: string; text?: string; [key: string]: unknown }>
    },
  ) => void
} {
  const enabled = options?.enabled !== false
  const customInstructions = options?.customInstructions
  const checkpointManager = options?.checkpointManager

  // Track which sessions just had compaction
  const postCompactionSessions = new Set<string>()

  return {
    'experimental.session.compacting': (
      input: { sessionID?: string },
      output: { context: string[]; prompt?: string },
    ): void => {
      if (!enabled) return

      // Auto-create checkpoint before compaction
      // This is the key integration: checkpoint is the "reinforcement board" for compaction
      if (checkpointManager && input.sessionID) {
        try {
          const checkpoint =
            checkpointManager.createPreCompactionCheckpoint(input.sessionID, {
              goal: 'Pre-compaction checkpoint: preserving context before compression',
              pendingTasks: [],
              keyFiles: [],
              recentDecisions: [],
            })
          if (checkpoint) {
            log(
              `[${HOOK_NAME}] Auto-created pre-compaction checkpoint: ${checkpoint.id} (${checkpoint.level})`,
              {
                sessionID: input.sessionID,
                checkpointID: checkpoint.id,
                level: checkpoint.level,
              },
            )
          }
        } catch (error) {
          // Don't fail compaction if checkpoint creation fails
          log(`[${HOOK_NAME}] Failed to create pre-compaction checkpoint`, {
            sessionID: input.sessionID,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      // Mark this session as post-compaction for recovery injection
      if (input.sessionID) {
        postCompactionSessions.add(input.sessionID)
        log(`[${HOOK_NAME}] Marked session for post-compaction recovery`, {
          sessionID: input.sessionID,
        })
      }

      // Replace compaction prompt with our improved version
      const improvedPrompt = getCompactionPrompt(customInstructions)
      output.prompt = improvedPrompt

      log(`[${HOOK_NAME}] 替换压缩提示词`, {
        sessionID: input.sessionID,
        promptLength: improvedPrompt.length,
        hasCustomInstructions: !!customInstructions,
      })
    },

    'chat.message': (
      input: { sessionID: string },
      output: {
        message: Record<string, unknown>
        parts: Array<{ type: string; text?: string; [key: string]: unknown }>
      },
    ): void => {
      if (!enabled) return
      if (!postCompactionSessions.has(input.sessionID)) return

      // Clear the flag immediately to avoid duplicate injection
      postCompactionSessions.delete(input.sessionID)

      // Find the first text part to inject recovery instructions
      const textPartIndex = output.parts.findIndex(
        (part) => part.type === 'text' && part.text && !part.synthetic,
      )
      if (textPartIndex === -1) {
        log(`[${HOOK_NAME}] No text part found, skipping recovery injection`, {
          sessionID: input.sessionID,
        })
        return
      }

      const originalText = output.parts[textPartIndex].text ?? ''
      output.parts[textPartIndex].text = `${POST_COMPACTION_RECOVERY}\n\n${originalText}`

      log(`[${HOOK_NAME}] Injected post-compaction recovery instructions`, {
        sessionID: input.sessionID,
      })
    },
  }
}

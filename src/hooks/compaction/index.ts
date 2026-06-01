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
 * - 语言感知：检测对话语言，输出对应语言
 * - 增量压缩：检测历史压缩摘要并更新
 * - 9 章节结构化输出
 */

import type { CheckpointManager } from '../../checkpoint/manager'
import { log } from '../../utils/logger'
import { getCompactionPrompt } from './prompt'

const HOOK_NAME = 'compaction'

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
 * 并在压缩前自动创建 checkpoint。
 */
export function createCompactionHook(
  options?: CompactionHookOptions,
): {
  'experimental.session.compacting': (
    input: { sessionID?: string },
    output: { context: string[]; prompt?: string },
  ) => void
} {
  const enabled = options?.enabled !== false
  const customInstructions = options?.customInstructions
  const checkpointManager = options?.checkpointManager

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

      // Replace compaction prompt with our improved version
      const improvedPrompt = getCompactionPrompt(customInstructions)
      output.prompt = improvedPrompt

      log(`[${HOOK_NAME}] 替换压缩提示词`, {
        sessionID: input.sessionID,
        promptLength: improvedPrompt.length,
        hasCustomInstructions: !!customInstructions,
      })
    },
  }
}

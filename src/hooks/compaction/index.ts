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
 * - 压缩后自动继续：如果有未完成的 todo，自动继续工作
 * - 语言感知：检测对话语言，输出对应语言
 * - 增量压缩：检测历史压缩摘要并更新
 * - 9 章节结构化输出
 */

import type { CheckpointManager } from '../../checkpoint/manager';
import type { EffectiveAgentOverlay } from '../../utils/effective-agent-overlay';
import { log } from '../../utils/logger';

const HOOK_NAME = 'compaction';

/** Post-compaction recovery message injected into user's next message */
const POST_COMPACTION_RECOVERY = `**Post-Compaction Recovery**: A context compaction just occurred. Before continuing work, read the checkpoint file to recover detailed context:

**File resolution order:**
1. \`.opencode/extendai-lab/checkpoints/by-session/$SESSION_ID.md\` (manual checkpoint — preferred)
2. \`.opencode/extendai-lab/checkpoints/by-session-auto/$SESSION_ID.md\` (auto-compaction checkpoint — fallback)
3. \`.opencode/extendai-lab/checkpoints/latest.md\` (workspace latest — last resort)

Replace $SESSION_ID with the actual session ID. Read the first file that exists.
If checkpoint has pending tasks, continue from where you left off.

---`;

export interface CompactionHookOptions {
  /** 是否启用压缩提示词替换（默认 true） */
  enabled?: boolean;
  /** 自定义附加指令 */
  customInstructions?: string;
  /** Checkpoint manager instance for auto-checkpoint creation */
  checkpointManager?: CheckpointManager;
  /** 是否启用压缩后自动继续（默认 true） */
  autoContinueEnabled?: boolean;
  /** Get the current effective overlay for a session (phase + agent) */
  getCurrentOverlay?: (sessionID: string) => EffectiveAgentOverlay | null;
}

/**
 * 创建上下文压缩 Hook
 *
 * 通过 experimental.session.compacting hook 替换 OpenCode 原生压缩提示词，
 * 并在压缩前自动创建 checkpoint，压缩后注入恢复指令。
 * 如果有未完成的 todo，压缩后自动继续工作。
 */
export function createCompactionHook(options?: CompactionHookOptions): {
  'experimental.session.compacting': (
    input: { sessionID?: string },
    output: { context: string[]; prompt?: string },
  ) => void;
  'experimental.compaction.autocontinue': (
    input: {
      sessionID: string;
      agent: string;
      model: unknown;
      provider: unknown;
      message: unknown;
      overflow: boolean;
    },
    output: { enabled: boolean },
  ) => Promise<void>;
  'chat.message': (
    input: { sessionID: string },
    output: {
      message: Record<string, unknown>;
      parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
    },
  ) => void;
} {
  const enabled = options?.enabled !== false;
  const customInstructions = options?.customInstructions;
  const checkpointManager = options?.checkpointManager;
  const autoContinueEnabled = options?.autoContinueEnabled !== false;

  // Track which sessions just had compaction
  const postCompactionSessions = new Set<string>();

  return {
    'experimental.session.compacting': (
      input: { sessionID?: string },
      output: { context: string[]; prompt?: string },
    ): void => {
      if (!enabled) return;

      // Auto-create checkpoint before compaction
      // This is the key integration: checkpoint is the "reinforcement board" for compaction
      if (checkpointManager && input.sessionID) {
        try {
          const overlay = options?.getCurrentOverlay?.(input.sessionID);
          const checkpoint = checkpointManager.createPreCompactionCheckpoint(
            input.sessionID,
            {
              goal: 'Pre-compaction checkpoint: preserving context before compression',
              pendingTasks: [],
              keyFiles: [],
              recentDecisions: [],
              currentPhase: overlay?.phase,
              currentAgent: overlay?.agent,
            },
          );
          if (checkpoint) {
            log(
              `[${HOOK_NAME}] Auto-created pre-compaction checkpoint: ${checkpoint.id} (${checkpoint.level})`,
              {
                sessionID: input.sessionID,
                checkpointID: checkpoint.id,
                level: checkpoint.level,
              },
            );
          }
        } catch (error) {
          // Don't fail compaction if checkpoint creation fails
          log(`[${HOOK_NAME}] Failed to create pre-compaction checkpoint`, {
            sessionID: input.sessionID,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Mark this session as post-compaction for recovery injection
      if (input.sessionID) {
        postCompactionSessions.add(input.sessionID);
        log(`[${HOOK_NAME}] Marked session for post-compaction recovery`, {
          sessionID: input.sessionID,
        });
      }

      // Keep OpenCode's native compaction prompt — it produces better summaries.
      // Do NOT override output.prompt or clear output.context.
      // Our only role here is checkpoint integration (pre-compaction snapshot).

      log(`[${HOOK_NAME}] Pre-compaction checkpoint created (using native compaction prompt)`, {
        sessionID: input.sessionID,
        hasCustomInstructions: !!customInstructions,
      });
    },

    'experimental.compaction.autocontinue': async (
      input: {
        sessionID: string;
        agent: string;
        model: unknown;
        provider: unknown;
        message: unknown;
        overflow: boolean;
      },
      output: { enabled: boolean },
    ): Promise<void> => {
      if (!enabled || !autoContinueEnabled) {
        output.enabled = false;
        return;
      }

      // Enable auto-continue after compaction
      // This allows the system to automatically continue working on incomplete todos
      output.enabled = true;

      log(
        `[${HOOK_NAME}] Post-compaction auto-continue enabled for session ${input.sessionID}`,
        {
          sessionID: input.sessionID,
          agent: input.agent,
          overflow: input.overflow,
        },
      );
    },

    'chat.message': (
      input: { sessionID: string },
      output: {
        message: Record<string, unknown>;
        parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
      },
    ): void => {
      if (!enabled) return;
      if (!postCompactionSessions.has(input.sessionID)) return;

      // Clear the flag immediately to avoid duplicate injection
      postCompactionSessions.delete(input.sessionID);

      // Find the first text part to inject recovery instructions
      const textPartIndex = output.parts.findIndex(
        (part) => part.type === 'text' && part.text && !part.synthetic,
      );
      if (textPartIndex === -1) {
        log(`[${HOOK_NAME}] No text part found, skipping recovery injection`, {
          sessionID: input.sessionID,
        });
        return;
      }

      const originalText = output.parts[textPartIndex].text ?? '';
      output.parts[textPartIndex].text =
        `${POST_COMPACTION_RECOVERY}\n\n${originalText}`;

      log(`[${HOOK_NAME}] Injected post-compaction recovery instructions`, {
        sessionID: input.sessionID,
      });
    },
  };
}

/**
 * 上下文压缩提示词
 *
 * 通过 experimental.session.compacting hook 的 output.prompt 机制
 * 替换 OpenCode 原生压缩提示词（SUMMARY_TEMPLATE）。
 *
 * 上游设计：output.prompt 存在时，buildPrompt(previousSummary, context) 不会被调用。
 * 因此我们必须在模板中自行处理增量压缩（previousSummary）逻辑。
 *
 * 设计要点：
 * - 语言感知：检测对话语言，输出对应语言
 * - 增量压缩：检测对话中的历史压缩摘要并更新（替代上游 previousSummary 机制）
 * - 9 章节结构化输出
 * - 防止工具调用
 */

/**
 * 防工具调用前言
 */
export const NO_TOOLS_PREAMBLE = `关键指令：仅使用文本回复。不要调用任何工具。

- 不要使用 Read、Bash、Grep、Glob、Edit、Write 或任何其他工具。
- 你已经在上面的对话中拥有了所有需要的上下文。
- 工具调用将被拒绝，会浪费你唯一的回合——你将无法完成任务。

`

/**
 * 基础压缩提示词
 *
 * 通过 output.prompt 替换上游默认模板。
 * 包含语言检测和增量压缩支持（替代上游 buildPrompt 的 previousSummary 逻辑）。
 */
export const BASE_COMPACT_PROMPT = `## Language Rule
Detect the primary language of the conversation above. If primarily Chinese, respond in Chinese. If primarily English, respond in English. If mixed, use the language of the most recent user messages.

## Incremental Compaction
If the conversation above contains a previous compaction summary (messages with type "compaction" or marked "Session compacted" / "会话已压缩"), update that summary:
- Preserve still-true details
- Remove stale details
- Merge in new facts from the conversation since the last compaction
If no previous compaction summary is found, create a new summary from scratch.

---

Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your prior actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that are critical for continuing development work without losing context.

Before providing the final summary, analyze each part of the conversation in chronological order, ensuring all necessary points are covered.

Your summary should include the following sections:

1. 主要请求和意图 / Primary Requests and Intent: Detail all explicit requests and intents from the user
2. 关键技术概念 / Key Technical Concepts: List all important technical concepts, techniques, and frameworks discussed
3. 文件和代码部分 / Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Pay special attention to recent messages and include complete code snippets where applicable, along with a summary of why this file was read or edited
4. 错误和修复 / Errors and Fixes: List all errors encountered and how they were fixed. Pay special attention to user feedback, especially when the user tells you to do things differently
5. 问题解决 / Problem Solving: Document problems resolved and any ongoing troubleshooting work
6. 所有用户消息 / All User Messages: List all non-tool-result user messages. These are critical for understanding user feedback and evolving intent
7. 待处理任务 / Pending Tasks: Outline any pending tasks you were explicitly asked to work on
8. 当前工作 / Current Work: Detail the work in progress just before this summary request, with special attention to recent messages from both user and assistant. Include filenames and code snippets where applicable
9. 可选下一步 / Optional Next Steps: List next steps related to your recent work. IMPORTANT: Ensure this directly aligns with the user's most recent explicit request and the task you were working on before the summary request. If your last task is complete, only list next steps if they clearly align with the user's request
                       If there are next steps, include direct quotes from the recent conversation showing exactly what task you were working on and where you left off

Provide your summary based on the conversation so far, following this structure and ensuring precision and thoroughness in your response.

## 重要规则 / Important Rules
- 保留精确的文件路径、命令、错误字符串和标识符 / Preserve exact file paths, commands, error strings, and identifiers
- 使用简洁的要点，不要使用散文段落 / Use terse bullets, not prose paragraphs
- 不要提及摘要过程或上下文已被压缩 / Do not mention the summary process or that context was compacted
- 保持每个部分，即使为空 / Keep every section, even when empty
- 用与对话相同的语言回复 / Reply in the same language as the conversation`

/**
 * 获取完整的压缩提示词
 */
export function getCompactionPrompt(customInstructions?: string): string {
  let prompt = NO_TOOLS_PREAMBLE + BASE_COMPACT_PROMPT

  if (customInstructions && customInstructions.trim() !== '') {
    prompt += `\n\n附加指令：\n${customInstructions}`
  }

  return prompt
}

/**
 * 获取部分压缩提示词（保留最近消息）
 */
export function getPartialCompactionPrompt(customInstructions?: string): string {
  let prompt = NO_TOOLS_PREAMBLE + BASE_COMPACT_PROMPT

  if (customInstructions && customInstructions.trim() !== '') {
    prompt += `\n\n附加指令：\n${customInstructions}`
  }

  return prompt
}

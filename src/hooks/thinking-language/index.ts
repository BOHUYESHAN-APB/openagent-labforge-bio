/**
 * Thinking Language Hook
 * 
 * For models that support extended thinking (e.g., DeepSeek R1),
 * inject language preference based on user's message language.
 * 
 * Chinese users → think in Chinese (faster feedback loop)
 * English users → think in English
 */

const THINKING_MODELS = [
  'deepseek/deepseek-reasoner',
  'deepseek/deepseek-chat',
  'deepseek-reasoner',
  'deepseek-chat',
];

const THINKING_LANGUAGE_MARKER = '[THINKING_LANGUAGE_INJECTED]';

/**
 * Detect if message is primarily Chinese
 */
function isPrimarilyChinese(text: string): boolean {
  if (!text) return false;
  
  // Count Chinese characters (CJK Unified Ideographs)
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  
  // If >30% Chinese characters, consider it Chinese
  return totalChars > 0 && chineseChars / totalChars > 0.3;
}

/**
 * Extract text from message parts
 */
function extractMessageText(
  parts: Array<{ type: string; text?: string }>,
): string {
  return parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join(' ');
}

export function createThinkingLanguageHook() {
  return {
    'experimental.chat.system.transform': async (
      input: {
        model?: string;
        messages?: Array<{
          info: { role: string };
          parts: Array<{ type: string; text?: string }>;
        }>;
      },
      output: { system: string[] },
    ) => {
      const model = input.model;
      if (!model || typeof model !== 'string') return;
      
      // Check if model supports extended thinking
      const supportsThinking = THINKING_MODELS.some((m) =>
        model.toLowerCase().includes(m.toLowerCase()),
      );
      
      if (!supportsThinking) return;
      
      // Check if already injected
      const combinedSystem = output.system.join('\n');
      if (combinedSystem.includes(THINKING_LANGUAGE_MARKER)) return;
      
      // Get last user message
      const messages = input.messages || [];
      let lastUserMessage = '';
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].info.role === 'user') {
          lastUserMessage = extractMessageText(messages[i].parts);
          break;
        }
      }
      
      if (!lastUserMessage) return;
      
      // Detect language and inject instruction
      const isChinese = isPrimarilyChinese(lastUserMessage);
      
      if (isChinese) {
        const instruction = `${THINKING_LANGUAGE_MARKER}

<thinking_language_preference>
请用中文进行思考和推理，除非你认为英文更有效。用中文思考可以让用户更快地根据思维内容纠正方向。
</thinking_language_preference>`;
        
        output.system.push(instruction);
      }
    },
  };
}

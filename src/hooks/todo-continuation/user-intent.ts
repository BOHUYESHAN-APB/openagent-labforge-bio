/**
 * User Intent Detection for Continuation Mechanism
 * 
 * Detects user intent from messages to adjust autonomous behavior:
 * - Explicit stop signals → stop continuation
 * - Satisfaction signals → accept completion
 * - Continue signals → maintain standard flow
 */

export interface UserIntent {
  type: 'explicit_stop' | 'user_satisfied' | 'continue_work' | 'unclear';
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
}

/**
 * Detect user intent from message content
 */
export function detectUserIntent(userMessage: string): UserIntent {
  if (!userMessage || typeof userMessage !== 'string') {
    return { type: 'unclear', confidence: 'low', signals: [] };
  }

  const lowerMessage = userMessage.toLowerCase();
  const foundSignals: string[] = [];

  // 1. Explicit stop signals (highest priority)
  const stopSignals = [
    // Chinese
    '停下来',
    '先停',
    '暂停',
    '等一下',
    '等我',
    '我来测试',
    '我会测试',
    '我自己测',
    '我来运行',
    '我会运行',
    '让我看看',
    '让我检查',
    '我先看',
    // English
    'stop',
    'wait',
    'pause',
    'hold on',
    "i'll test",
    'i will test',
    'let me test',
    "i'll run",
    'i will run',
    'let me check',
    'let me see',
    "i'll verify",
  ];

  for (const signal of stopSignals) {
    if (lowerMessage.includes(signal)) {
      foundSignals.push(signal);
    }
  }

  if (foundSignals.length > 0) {
    return {
      type: 'explicit_stop',
      confidence: 'high',
      signals: foundSignals,
    };
  }

  // 2. Satisfaction signals
  const satisfiedSignals = [
    // Chinese
    '完成了',
    '好的',
    '可以了',
    '没问题',
    '不错',
    '看起来不错',
    '看起来可以',
    '这样就行',
    // English
    'done',
    'good',
    'ok',
    'okay',
    'fine',
    'great',
    'looks good',
    'looks fine',
    'lgtm',
    'sounds good',
  ];

  for (const signal of satisfiedSignals) {
    if (lowerMessage.includes(signal)) {
      foundSignals.push(signal);
    }
  }

  if (foundSignals.length > 0) {
    return {
      type: 'user_satisfied',
      confidence: 'medium',
      signals: foundSignals,
    };
  }

  // 3. Continue signals
  const continueSignals = [
    // Chinese
    '继续',
    '下一步',
    '接着',
    '然后',
    '还要',
    '还需要',
    // English
    'continue',
    'next',
    'then',
    'also',
    'need more',
    'keep going',
  ];

  for (const signal of continueSignals) {
    if (lowerMessage.includes(signal)) {
      foundSignals.push(signal);
    }
  }

  if (foundSignals.length > 0) {
    return {
      type: 'continue_work',
      confidence: 'high',
      signals: foundSignals,
    };
  }

  // 4. No clear signals
  return {
    type: 'unclear',
    confidence: 'low',
    signals: [],
  };
}

/**
 * Determine if continuation should be skipped based on user intent
 */
export function shouldSkipContinuation(intent: UserIntent): boolean {
  // User explicitly asked to stop → skip continuation
  if (intent.type === 'explicit_stop' && intent.confidence === 'high') {
    return true;
  }

  // User expressed satisfaction → skip continuation
  if (intent.type === 'user_satisfied') {
    return true;
  }

  return false;
}

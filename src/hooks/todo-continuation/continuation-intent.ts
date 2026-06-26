/**
 * Continuation Intent Detection
 *
 * Detects when the AI signals intent to continue or stop mid-task
 * but didn't produce tool calls or properly finish. Injects a
 * force-continue message when the AI is trying to prematurely
 * hand off or ask for permission.
 *
 * Architecture: openclaude continuation.ts pattern
 * - Regex-based detection of stop signals, unfinished structures
 * - Force-continue injection when intent detected but no action taken
 */

// Signals that the AI is about to continue (but hasn't called tools yet)
const CONTINUATION_SIGNALS = [
  /\bso now (i|let me|we) (?:need to|have to|should|must|will) (?:do|create|write|edit|implement|add|fix|update|refactor|build|make)/i,
  /\bnow i(?:'ll| will) (?:do|create|write|edit|implement|add|fix|update|refactor|build|make)/i,
  /\bi (?:will|shall|now|need to|have to|must|should) (?:now )?(?:do|create|write|edit|implement|add|fix|update|refactor|build|make)/i,
  /\blet me (?:go ahead and |now )?(?:do|create|write|edit|implement|add|fix|update|refactor|build|make)/i,
  /\btime to (?:do|create|write|edit|implement|add|fix|update|refactor|build|make)/i,
  /\b(?:moving on to|next step is to|proceeding to|continuing with)\b/i,
  /:\s*$/, // Sentence ending with colon — signal of continuation
];

// Signals that the AI is stopping prematurely or asking for permission
const STOP_SIGNALS = [
  /\bshould i\b/i,
  /\bwould you like me to\b/i,
  /\blet me know if\b/i,
  /\bif you need (?:anything|me to|further|more)\b/i,
  /\bdo you want me to\b/i,
  /\bwhat (?:should|would) you (?:like|have me to)\b/i,
  /\bi (?:could|could also) (?:do|add|implement|create|write|edit|fix)\b/i,
  /\bas a starting point\b/i,
  /\bfor now\b/i,
  /\bhere['']s a (?:quick|basic|simple|starting)\b/i,
  /\bdoes this (?:look|work|meet)\b/i,
  /\bare you (?:happy|satisfied|ok) with\b/i,
  /\bplease (?:review|check|verify|let me know)\b/i,
  /\bi['']?ll (?:pause|wait|stop|check back)\b/i,
];

// Signals that text may be truncated mid-output
// These must NOT match common natural sentence endings.
const UNFINISHED_SENTINEL_SIGNALS = [
  /,\s*$/, // Trailing comma — may be mid-list
  /```\s*$/, // Unclosed code fence at very end
  /\b(?:and|but|or|to|the|a|an|with|for|in|on|at|by)\s*$/i, // Trailing connector
];

/**
 * Count unclosed code fences (```).
 * Odd count means a code block is open / truncated.
 */
function hasUnclosedCodeBlock(text: string): boolean {
  const codeFenceMatches = text.match(/```/g);
  if (!codeFenceMatches) return false;
  return codeFenceMatches.length % 2 !== 0;
}

/**
 * Detect continuation intent signals in text.
 */
export function detectContinuationIntent(text: string): {
  hasIntent: boolean;
  hasStopSignal: boolean;
  isTruncated: boolean;
} {
  const hasIntent = CONTINUATION_SIGNALS.some((re) => re.test(text));
  const hasStopSignal = STOP_SIGNALS.some((re) => re.test(text));
  const isTruncated =
    hasUnclosedCodeBlock(text) ||
    UNFINISHED_SENTINEL_SIGNALS.some((re) => re.test(text));

  return { hasIntent, hasStopSignal, isTruncated };
}

/**
 * Build a force-continue message when the AI prematurely signals intent
 * to continue but didn't execute. Matches openclaude's nudge pattern.
 */
export function buildForceContinueMessage(): string {
  return (
    '[Continue with the task. You signaled intent to continue but did not produce tool calls.\n' +
    'Do NOT summarize, do NOT ask for permission, do NOT stop.\n' +
    'Resume work on the next incomplete item immediately.]'
  );
}

/**
 * Build a rejection message when the AI tries to stop prematurely
 * with lazy patterns (asking for permission, half-finishing, etc.).
 */
export function buildLazyStopRejectionMessage(): string {
  return (
    '[CRITICAL: You appear to be stopping prematurely or handing off to the user.\n' +
    'This is NOT acceptable while work remains incomplete.\n' +
    'Stop-signal patterns detected:\n' +
    '- "should I?" → Execute the next step, do not ask.\n' +
    '- "let me know if" → Continue working, do not hand off.\n' +
    '- "for now" / "as a starting point" → Finish completely, do not half-implement.\n' +
    '- "I could also..." → Just do it, do not suggest.\n\n' +
    'IMMEDIATELY resume execution on the next incomplete work item.\n' +
    'Do NOT output conversational filler. Do NOT stop until all tasks are done.]'
  );
}

/**
 * Build a truncation detection message when the AI's output appears
 * cut off (unclosed code blocks, trailing connectors).
 */
export function buildTruncationRecoveryMessage(): string {
  return (
    '[Your previous response appears to have been truncated (unclosed code block or ' +
    'trailing connector detected). Resume from where you were interrupted.\n' +
    'Do NOT restart from the beginning. Do NOT summarize.]'
  );
}

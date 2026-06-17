import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginInput } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin/tool';
import {
  createInternalAgentTextPart,
  log,
  SLIM_INTERNAL_INITIATOR_MARKER,
} from '../../utils';
import { createCrashRecovery } from './crash-recovery';
import { createTodoHygiene } from './todo-hygiene';
import { detectUserIntent, shouldSkipContinuation } from './user-intent';

const HOOK_NAME = 'todo-continuation';
const COMMAND_NAME = 'ol-auto-continue';
const LEGACY_COMMAND_NAME = 'auto-continue';
const STOP_COMMAND_NAME = 'ol-stop-continuation';
const LEGACY_STOP_COMMAND_NAME = 'stop-continuation';
const AUTO_ON_ARGS = new Set(['on', 'true', 'enable', 'enabled', 'yes', '1']);
const AUTO_OFF_ARGS = new Set([
  'off',
  'false',
  'disable',
  'disabled',
  'no',
  '0',
]);

const CONTINUATION_PROMPT =
  '[Auto-continue: incomplete todos remain in this work batch. Continue working on the next pending or in-progress item now. Proceed without asking for permission. Do not stop while any todo remains incomplete. If you think the work is already complete, re-check every remaining todo skeptically, verify the work was actually done, and update todo status before stopping. If user input is truly required, use the runtime\'s native question/clarification mechanism instead of conversational filler like "should I continue?". Press Esc to cancel. Call auto_continue with enabled=false only when the batch is actually complete, explicitly stopped by the user, or truly blocked.]';

const REVIEW_PROMPT = `[Auto-review: All todos are marked complete. Before finishing, you MUST perform a structured review.

## How This Works

This review runs in the CURRENT agent (you). You do NOT spawn subagents and do NOT switch agents.

Step 1: Load the reviewer methodology:
\`\`\`
load_agent_instructions(agent="reviewer")
\`\`\`

Step 2: Apply the reviewer's checklist and methodology to review the completed work.

Step 3: Output a verdict (see below).

## What You Must Check

1. **User Requirements** — Are all original requirements addressed?
2. **Todo Completion** — Are todos genuinely complete, not just marked complete?
3. **Lazy Patterns** (CRITICAL) — Reject if you find:
   - "If you need, I can do X" — should have done X already
   - "Let me know if you want me to..." — should have done it
   - "I could also..." — should have done it if possible
   - Partial implementations with "for now" or "as a starting point"
4. **Work Quality** — Are there obvious bugs, half-done implementations, or TODO comments?
5. **Evidence-Based Completion** (CRITICAL) — For each claim of completion:
   - "Tests pass" → MUST show actual test output
   - "Build succeeds" → MUST show build output
   - "Feature works" → MUST show verification steps
   - "No errors" → MUST show diagnostic output

## Evidence Requirements

**NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE**

| Claim | Required Evidence |
|-------|-------------------|
| Tests pass | Test command output: 0 failures |
| Build succeeds | Build command output: exit 0 |
| Feature works | Demonstration or test output |
| No errors | Diagnostic/linter output |
| Bug fixed | Regression test output |

**Red Flags — STOP if you see:**
- "Should work now" without evidence
- "I'm confident" without verification
- "Tests pass" without showing output
- "Build succeeds" without showing output
- Using "should", "probably", "seems to"

## Verdict

After review, output ONE of:

**[APPROVE]** — Work is complete, requirements met, no lazy patterns found, all claims verified with evidence. Call auto_continue(enabled=false) to stop.

**[REJECT: <reason>]** — Work has issues. If rejected:
- List each issue as a new todo
- Do NOT fix the issues yourself — @reviewer is a reviewer, not an implementer
- After creating todos, the system will auto-continue and the original agent will execute the fixes
- Allow auto-review to run again after fixes are complete

**[NEEDS_USER: <reason>]** — Cannot safely continue without user input.

## Critical Rules

- This review runs in the CURRENT agent — do NOT spawn subagents
- You are reviewing, NOT implementing — do NOT write code, edit files, or fix issues
- NEVER disable auto-continue manually — the system handles this automatically after approval
- DO NOT revert git commits — create corrective todos instead
- DO NOT claim completion without running diagnostics
- DO NOT accept "should work" as completion — demand evidence
- If you output [REJECT], create todos and let auto-continue resume to execute fixes]`;

const AUTO_CONTINUE_USER_NOTIFICATION_PREFIX = '⎔ Auto-continue';
const CONTEXT_PRESSURE_USER_NOTIFICATION_PREFIX = '⚠ Context pressure';
const AUTO_REVIEW_USER_NOTIFICATION_PREFIX = '🔎 Auto-review';

function buildUserVisibleContextPressureNotification(args: {
  level: number;
  ratio: number;
  totalTokens: number;
  contextLimit: number;
  strategy: string;
}): string {
  return [
    `${CONTEXT_PRESSURE_USER_NOTIFICATION_PREFIX}: L${args.level} — ${Math.round(args.ratio * 100)}% of context used — strategy ${args.strategy}`,
    `Usage: ${args.totalTokens.toLocaleString()} / ${args.contextLimit.toLocaleString()} tokens`,
    'Before continuing normal work, handle context pressure first, preserve key decisions/constraints/file paths/open todos, and prepare a concise checkpoint or handoff if needed.',
    '',
    '[system status: treat this as a user-visible runtime warning; handle it before continuing without acknowledging the notification itself]',
  ].join('\n');
}

function buildUserVisibleAutoContinueNotification(args: {
  incompleteCount: number;
  cooldownMs: number;
  todosSummary?: string;
}): string {
  return [
    `${AUTO_CONTINUE_USER_NOTIFICATION_PREFIX}: ${args.incompleteCount} incomplete todos remaining — resuming in ${args.cooldownMs / 1000}s — Esc×2 to cancel`,
    ...(args.todosSummary ? ['', 'Remaining todos:', args.todosSummary] : []),
    'This reminder is intentionally user-visible so unfinished work is obvious before the next auto step.',
    '',
    '[system status: continue without acknowledging this notification]',
  ].join('\n');
}

function formatIncompleteTodoLines(todos: TodoItem[]): string {
  const incompleteTodos = todos.filter(
    (todo) => !TERMINAL_TODO_STATUSES.includes(todo.status),
  );
  if (incompleteTodos.length === 0) {
    return '- (none)';
  }

  return incompleteTodos
    .slice(0, 8)
    .map((todo) => `- [${todo.status}] ${todo.content}`)
    .join('\n');
}

function buildContinuationPrompt(todos: TodoItem[]): string {
  const incompleteCount = todos.filter(
    (todo) => !TERMINAL_TODO_STATUSES.includes(todo.status),
  ).length;
  const completedCount = todos.length - incompleteCount;

  return `${CONTINUATION_PROMPT}\n\n[Status: ${completedCount}/${todos.length} completed, ${incompleteCount} remaining]\n\nRemaining todos:\n${formatIncompleteTodoLines(
    todos,
  )}`;
}

function buildUserVisibleReviewNotification(args: {
  stage: 'starting' | 'rejected' | 'needs_user' | 'blocked';
  findings?: string;
}): string {
  const lines = [`${AUTO_REVIEW_USER_NOTIFICATION_PREFIX}:`];

  if (args.stage === 'starting') {
    lines.push(
      'All todos are complete. A structured final review is running against the earliest real user request before this batch may stop.',
    );
  } else if (args.stage === 'rejected') {
    lines.push(
      'Final review found issues. Rework is required before this auto batch may stop.',
    );
  } else if (args.stage === 'needs_user') {
    lines.push(
      'Final review concluded that user input is required before work can safely continue.',
    );
  } else {
    lines.push(
      'Final review found an external blocker that prevents autonomous completion.',
    );
  }

  if (args.findings) {
    lines.push(`Reason: ${args.findings}`);
  }

  lines.push('');
  lines.push(
    '[system status: this is a user-visible runtime review notification; continue without acknowledging the notification itself]',
  );
  return lines.join('\n');
}

function buildReviewPrompt(args?: {
  level: number;
  ratio: number;
  totalTokens: number;
  contextLimit: number;
  strategy: string;
}): string {
  if (!args || args.level < 2) {
    return REVIEW_PROMPT;
  }

  return `${REVIEW_PROMPT}

## High Pressure Finish Requirement

Current session is under context pressure L${args.level} (${Math.round(
    args.ratio * 100,
  )}% = ${args.totalTokens.toLocaleString()} / ${args.contextLimit.toLocaleString()} tokens; strategy ${args.strategy}).

If you output [APPROVE], your brief summary MUST also function as a restart-safe handoff:
- what was actually delivered
- the most important remaining risk/assumption
- the exact next step if this work is reopened later

Keep that handoff delta-only and concise. Do not expand into a long recap.`;
}

type ReviewVerdict = 'approve' | 'reject' | 'needs_user' | 'blocked' | 'none';
type StoredReviewVerdict = Exclude<ReviewVerdict, 'none'> | 'pending';

const TODO_HYGIENE_INSTRUCTION_OPEN = '<instruction name="todo_hygiene">';
const TODO_HYGIENE_INSTRUCTION_CLOSE = '</instruction>';

// Suppress window after user abort (Esc/Ctrl+C) to avoid immediately
// re-continuing something the user explicitly stopped
const SUPPRESS_AFTER_ABORT_MS = 30_000; // 30s — user ESC means "stop", don't retry
const NOTIFICATION_BUSY_GRACE_MS = 250;

const QUESTION_PHRASES = [
  'would you like',
  'should i',
  'do you want',
  'please review',
  'let me know',
  'what do you think',
  'can you confirm',
  'would you prefer',
  'shall i',
  'any thoughts',
];

// Statuses that indicate a todo is terminal (won't be worked on further).
// Uses denylist approach: any status not listed here is considered incomplete.
const TERMINAL_TODO_STATUSES = ['completed', 'cancelled'];
const PRIMARY_AGENT_NAMES = new Set([
  'orchestrator',
  'atlas',
  'bio-orchestrator',
  'chem-orchestrator',
]);

interface ContinuationState {
  enabled: boolean;
  enabledBySession: Map<string, boolean>;
  consecutiveContinuations: number;
  consecutiveContinuationsBySession: Map<string, number>;
  pendingTimer: ReturnType<typeof setTimeout> | null;
  pendingTimerSessionId: string | null;
  suppressUntil: number;
  abortedByUser: boolean;
  orchestratorSessionIds: Set<string>;
  sawChatMessage: boolean;
  isAutoInjecting: boolean;
  notifyingSessionIds: Set<string>;
  notificationBusyUntilBySession: Map<string, number>;
  reviewVerdictBySession: Map<string, StoredReviewVerdict>;
  reviewInjectedBySession: Set<string>;
  autoEnableSuppressedSessionIds: Set<string>;
  autoEnableSuppressedGlobally: boolean;
  lastPressureCheckpointKeyBySession: Map<string, string>;
  transientFailureCountBySession: Map<string, number>;
}

// ── State persistence (OMO ralph-loop pattern) ────────────────────
// Persists key state to file so session can survive crashes/restarts.

interface PersistedContinuationState {
  maintainer: string;
  version: number;
  savedAt: string;
  enabledBySession: Array<[string, boolean]>;
  consecutiveContinuationsBySession: Array<[string, number]>;
  suppressUntil: number;
  reviewVerdictBySession: Array<[string, StoredReviewVerdict]>;
  reviewInjectedBySession: string[];
  autoEnableSuppressedSessionIds: string[];
  autoEnableSuppressedGlobally: boolean;
  lastPressureCheckpointKeyBySession: Array<[string, string]>;
}

function getContinuationStateFilePath(workspaceRoot: string): string {
  return join(
    workspaceRoot,
    '.opencode',
    'extendai-lab',
    'continuation',
    'state.json',
  );
}

function saveContinuationState(
  workspaceRoot: string,
  state: ContinuationState,
): void {
  try {
    const filePath = getContinuationStateFilePath(workspaceRoot);
    const persist: PersistedContinuationState = {
      maintainer: 'extendai-lab',
      version: 1,
      savedAt: new Date().toISOString(),
      enabledBySession: Array.from(state.enabledBySession.entries()),
      consecutiveContinuationsBySession: Array.from(
        state.consecutiveContinuationsBySession.entries(),
      ),
      suppressUntil: state.suppressUntil,
      reviewVerdictBySession: Array.from(
        state.reviewVerdictBySession.entries(),
      ),
      reviewInjectedBySession: Array.from(state.reviewInjectedBySession),
      autoEnableSuppressedSessionIds: Array.from(
        state.autoEnableSuppressedSessionIds,
      ),
      autoEnableSuppressedGlobally: state.autoEnableSuppressedGlobally,
      lastPressureCheckpointKeyBySession: Array.from(
        state.lastPressureCheckpointKeyBySession.entries(),
      ),
    };
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, JSON.stringify(persist, null, 2), 'utf8');
  } catch {
    // Best-effort persistence — failure should not break runtime
    log(`[${HOOK_NAME}] Warning: failed to persist continuation state`);
  }
}

function loadContinuationState(
  workspaceRoot: string,
  state: ContinuationState,
): void {
  try {
    const filePath = getContinuationStateFilePath(workspaceRoot);
    if (!existsSync(filePath)) return;

    const raw = readFileSync(filePath, 'utf8');
    const persisted: PersistedContinuationState = JSON.parse(raw);

    if (persisted.maintainer !== 'extendai-lab') return;

    // Restore persisted fields into runtime state
    for (const [sessionID, enabled] of persisted.enabledBySession) {
      state.enabledBySession.set(sessionID, enabled);
      if (enabled) state.enabled = true; // global fallback for new sessions
    }
    for (const [
      sessionID,
      count,
    ] of persisted.consecutiveContinuationsBySession) {
      state.consecutiveContinuationsBySession.set(sessionID, count);
    }
    state.suppressUntil = persisted.suppressUntil;
    for (const [sessionID, verdict] of persisted.reviewVerdictBySession) {
      state.reviewVerdictBySession.set(sessionID, verdict);
    }
    for (const sessionID of persisted.reviewInjectedBySession) {
      state.reviewInjectedBySession.add(sessionID);
    }
    for (const sessionID of persisted.autoEnableSuppressedSessionIds) {
      state.autoEnableSuppressedSessionIds.add(sessionID);
    }
    state.autoEnableSuppressedGlobally = persisted.autoEnableSuppressedGlobally;
    for (const [
      sessionID,
      key,
    ] of persisted.lastPressureCheckpointKeyBySession) {
      state.lastPressureCheckpointKeyBySession.set(sessionID, key);
    }

    log(`[${HOOK_NAME}] Restored continuation state from ${filePath}`);
  } catch {
    log(`[${HOOK_NAME}] No prior continuation state to restore (fresh start)`);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

const TRANSIENT_FAILURE_RETRY_LIMIT = 3;
const TRANSIENT_FAILURE_BACKOFF_MS = 1500;

function scheduleStateSave(
  workspaceRoot: string,
  state: ContinuationState,
): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveContinuationState(workspaceRoot, state);
  }, 500);
}

/**
 * Parse review verdict from assistant message text.
 * Returns the structured verdict and its reason/findings.
 */
function parseReviewVerdict(text: string): {
  verdict: ReviewVerdict;
  findings: string;
} {
  const approveMatch = text.match(/\[APPROVE\](.*)$/is);
  if (approveMatch) {
    return {
      verdict: 'approve',
      findings:
        approveMatch[1]?.trim() ||
        'Work batch approved after structured auto-review.',
    };
  }

  const rejectMatch = text.match(/\[REJECT(?::\s*(.*?))?\]/is);
  if (rejectMatch) {
    return {
      verdict: 'reject',
      findings:
        rejectMatch[1]?.trim() ||
        'Review rejected work — check findings above.',
    };
  }

  const needsUserMatch = text.match(/\[NEEDS_USER(?::\s*(.*?))?\]/is);
  if (needsUserMatch) {
    return {
      verdict: 'needs_user',
      findings:
        needsUserMatch[1]?.trim() ||
        'Review requires user input before continuing.',
    };
  }

  const blockedMatch = text.match(/\[BLOCKED(?::\s*(.*?))?\]/is);
  if (blockedMatch) {
    return {
      verdict: 'blocked',
      findings:
        blockedMatch[1]?.trim() ||
        'Review found an external blocker that prevents autonomous progress.',
    };
  }

  return { verdict: 'none', findings: '' };
}

/**
 * Build rework prompt from review findings.
 */
function buildReworkPrompt(findings: string): string {
  return `[Auto-review: REJECTED — the following issues were found:\n\n${findings}\n\nThis is mandatory rework. Do not stop. Create or update todos for each finding, fix them, run the relevant diagnostics/tests/build again, and then allow auto-review to run again. DO NOT revert git commits — make new corrective commits instead.]`;
}

function isQuestion(text: string): boolean {
  const lowerText = text.toLowerCase().trim();
  if (/\?\s*$/.test(lowerText)) {
    return true;
  }
  return QUESTION_PHRASES.some((phrase) => lowerText.includes(phrase));
}

interface TodoItem {
  id: string;
  content: string;
  status: string;
  priority: string;
}

interface MessageInfo {
  role?: string;
  [key: string]: unknown;
}

interface MessagePart {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

interface ChatTransformMessage {
  info: {
    id?: string;
    role?: string;
    agent?: string;
    sessionID?: string;
  };
  parts: MessagePart[];
}

interface LastExternalUserMessage {
  sessionID?: string;
  agent?: string;
  signature: string;
}

function isPrimaryAgentName(agent: string | undefined): boolean {
  return Boolean(agent && PRIMARY_AGENT_NAMES.has(agent));
}

interface Message {
  info?: MessageInfo;
  parts?: MessagePart[];
}

function cancelPendingTimer(state: ContinuationState): void {
  if (state.pendingTimer) {
    clearTimeout(state.pendingTimer);
    state.pendingTimer = null;
  }
  state.pendingTimerSessionId = null;
}

function resetState(state: ContinuationState): void {
  cancelPendingTimer(state);
  state.consecutiveContinuations = 0;
  state.enabledBySession.clear();
  state.consecutiveContinuationsBySession.clear();
  state.suppressUntil = 0;
  state.isAutoInjecting = false;
  state.notifyingSessionIds.clear();
  state.notificationBusyUntilBySession.clear();
  state.reviewVerdictBySession.clear();
  state.reviewInjectedBySession.clear();
  state.autoEnableSuppressedSessionIds.clear();
  state.autoEnableSuppressedGlobally = false;
  state.lastPressureCheckpointKeyBySession.clear();
}

export function createTodoContinuationHook(
  ctx: PluginInput,
  config?: {
    maxContinuations?: number;
    autoReviewModel?: string;
    cooldownMs?: number;
    autoEnable?: boolean;
    autoEnableThreshold?: number;
    onReviewOutcome?: (args: {
      sessionID: string;
      verdict: 'approve' | 'reject' | 'needs_user' | 'blocked';
      findings: string;
    }) => void | Promise<void>;
    onAutoPause?: (args: {
      sessionID: string;
      reason: string;
      details: string;
    }) => void | Promise<void>;
    contextPressure?: {
      getState: (sessionID: string) =>
        | {
            level: number;
            ratio: number;
            totalTokens: number;
            contextLimit: number;
          }
        | undefined;
      shouldForceCheckpoint: (sessionID: string) => boolean;
      getRecommendedStrategy: (sessionID: string) => string;
      onForceCheckpoint?: (args: {
        sessionID: string;
        level: number;
        ratio: number;
        totalTokens: number;
        contextLimit: number;
        strategy: string;
      }) => void | Promise<void>;
    };
    onBatchSummary?: (args: {
      sessionID: string;
      summary: string;
    }) => void | Promise<void>;
  },
): {
  tool: Record<string, unknown>;
  handleToolExecuteAfter: (
    input: {
      tool: string;
      sessionID?: string;
    },
    output?: { output?: unknown },
  ) => Promise<void>;
  handleMessagesTransform: (output: {
    messages: ChatTransformMessage[];
  }) => Promise<void>;
  handleSystemTransform: (
    input: { sessionID?: string },
    output: { system: string[] },
  ) => Promise<void>;
  handleEvent: (input: {
    event: { type: string; properties?: Record<string, unknown> };
  }) => Promise<void>;
  handleChatMessage: (input: { sessionID: string; agent?: string }) => void;
  handleCommandExecuteBefore: (
    input: {
      command: string;
      sessionID: string;
      arguments: string;
    },
    output: { parts: Array<{ type: string; text?: string }> },
  ) => Promise<void>;
} {
  const maxContinuations = config?.maxContinuations ?? 5;
  const cooldownMs = config?.cooldownMs ?? 3000;
  const autoEnable = config?.autoEnable ?? false;
  const autoEnableThreshold = config?.autoEnableThreshold ?? 4;
  const requestSignatureBySession = new Map<string, string>();
  const pendingHygieneReminderBySession = new Map<string, string>();

  const state: ContinuationState = {
    enabled: false,
    enabledBySession: new Map(),
    consecutiveContinuations: 0,
    consecutiveContinuationsBySession: new Map(),
    pendingTimer: null,
    pendingTimerSessionId: null,
    suppressUntil: 0,
    abortedByUser: false, // user ESC → true, cleared on next chat.message
    orchestratorSessionIds: new Set<string>(),
    sawChatMessage: false,
    isAutoInjecting: false,
    notifyingSessionIds: new Set<string>(),
    notificationBusyUntilBySession: new Map<string, number>(),
    reviewVerdictBySession: new Map(),
    reviewInjectedBySession: new Set(),
    autoEnableSuppressedSessionIds: new Set(),
    autoEnableSuppressedGlobally: false,
    lastPressureCheckpointKeyBySession: new Map(),
    transientFailureCountBySession: new Map(),
  };

  // Load persisted state from disk (OMO ralph-loop pattern for crash recovery)
  loadContinuationState(ctx.directory, state);

  // Crash recovery guard — prevents re-inject after session.error
  const crashRecovery = createCrashRecovery();

  const hygiene = createTodoHygiene({
    getTodoState: async (sessionID) => {
      const result = await ctx.client.session.todo({
        path: { id: sessionID },
      });
      const todos = result.data as TodoItem[];
      const openTodos = todos.filter(
        (todo) => !TERMINAL_TODO_STATUSES.includes(todo.status),
      );
      return {
        hasOpenTodos: openTodos.length > 0,
        openCount: openTodos.length,
        inProgressCount: openTodos.filter(
          (todo) => todo.status === 'in_progress',
        ).length,
        pendingCount: openTodos.filter((todo) => todo.status === 'pending')
          .length,
      };
    },
    shouldInject: (sessionID) => isOrchestratorSession(sessionID),
    log: (message, meta) => log(`[${HOOK_NAME}] ${message}`, meta),
  });

  function inferSessionID(
    messages: ChatTransformMessage[],
    index: number,
  ): string | undefined {
    const direct = messages[index]?.info.sessionID;
    if (direct) {
      return direct;
    }

    for (let i = index - 1; i >= 0; i--) {
      const sessionID = messages[i]?.info.sessionID;
      if (sessionID) {
        return sessionID;
      }
    }

    for (let i = index + 1; i < messages.length; i++) {
      const sessionID = messages[i]?.info.sessionID;
      if (sessionID) {
        return sessionID;
      }
    }

    if (state.orchestratorSessionIds.size === 1) {
      return Array.from(state.orchestratorSessionIds)[0];
    }

    return undefined;
  }

  function isExternalUserMessage(message: ChatTransformMessage): boolean {
    if (message.info.role !== 'user') {
      return false;
    }

    const visibleText = message.parts
      .filter(
        (part) =>
          part.type === 'text' &&
          typeof part.text === 'string' &&
          !part.text.includes(SLIM_INTERNAL_INITIATOR_MARKER),
      )
      .map((part) => part.text?.trim() ?? '')
      .filter(Boolean)
      .join('\n');
    const hasNonTextPart = message.parts.some((part) => part.type !== 'text');

    return !(
      !visibleText &&
      !hasNonTextPart &&
      message.parts.some(
        (part) =>
          part.type === 'text' &&
          typeof part.text === 'string' &&
          part.text.includes(SLIM_INTERNAL_INITIATOR_MARKER),
      )
    );
  }

  function getLastExternalUserMessage(
    messages: ChatTransformMessage[],
  ): LastExternalUserMessage | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!isExternalUserMessage(message)) {
        continue;
      }

      const sessionID = inferSessionID(messages, i);

      const partSignature = message.parts
        .map((part) => {
          if (part.type === 'text' && typeof part.text === 'string') {
            const text = part.text;
            return `${part.type}:${text.includes(SLIM_INTERNAL_INITIATOR_MARKER) ? '<internal>' : text.trim()}`;
          }
          return part.type ?? 'unknown';
        })
        .join('|');
      const ordinal = messages
        .slice(0, i + 1)
        .filter((item) => isExternalUserMessage(item)).length;

      return {
        sessionID,
        agent: message.info.agent,
        signature: message.info.id
          ? `${message.info.id}:${partSignature}`
          : `${ordinal}:${partSignature}`,
      };
    }

    return null;
  }

  async function handleMessagesTransform(output: {
    messages: ChatTransformMessage[];
  }): Promise<void> {
    const lastUserMessage = getLastExternalUserMessage(output.messages);
    if (!lastUserMessage) {
      return;
    }

    if (lastUserMessage.agent && !isPrimaryAgentName(lastUserMessage.agent)) {
      return;
    }

    if (!lastUserMessage.sessionID) {
      for (const sessionID of state.orchestratorSessionIds) {
        requestSignatureBySession.delete(sessionID);
        state.lastPressureCheckpointKeyBySession.delete(sessionID);
        hygiene.handleRequestStart({ sessionID });
      }
      return;
    }

    const knownOrchestrator = isOrchestratorSession(lastUserMessage.sessionID);
    if (isPrimaryAgentName(lastUserMessage.agent)) {
      registerOrchestratorSession(lastUserMessage.sessionID);
    } else if (!knownOrchestrator) {
      return;
    }

    if (
      requestSignatureBySession.get(lastUserMessage.sessionID) ===
      lastUserMessage.signature
    ) {
      const reminder = hygiene.getPendingReminder(lastUserMessage.sessionID);
      if (reminder) {
        pendingHygieneReminderBySession.set(
          lastUserMessage.sessionID,
          reminder,
        );
      } else {
        pendingHygieneReminderBySession.delete(lastUserMessage.sessionID);
      }
      return;
    }

    // Detect user intent from message text
    const userMessageText =
      output.messages
        .filter((m) => m.info.role === 'user')
        .slice(-1)[0]
        ?.parts.filter((p) => p.type === 'text' && p.text)
        .map((p) => p.text)
        .join(' ') || '';

    if (userMessageText) {
      const intent = detectUserIntent(userMessageText);
      if (shouldSkipContinuation(intent)) {
        let shouldDisable = intent.type === 'explicit_stop';

        if (intent.type === 'user_satisfied') {
          try {
            const todosResult = await ctx.client.session.todo({
              path: { id: lastUserMessage.sessionID },
            });
            const todos = todosResult.data as TodoItem[];
            const hasOpenTodos = todos.some(
              (todo) => !TERMINAL_TODO_STATUSES.includes(todo.status),
            );
            shouldDisable = !hasOpenTodos;
          } catch {
            shouldDisable = false;
          }
        }

        if (shouldDisable) {
          disableContinuationForSession(
            lastUserMessage.sessionID,
            `user intent ${intent.type}`,
          );
          log(
            `[${HOOK_NAME}] User intent detected: ${intent.type} - disabling continuation`,
            {
              sessionID: lastUserMessage.sessionID,
              signals: intent.signals,
            },
          );
        } else {
          log(
            `[${HOOK_NAME}] User satisfaction ignored because incomplete todos still remain`,
            {
              sessionID: lastUserMessage.sessionID,
              signals: intent.signals,
            },
          );
        }
      }
    }

    requestSignatureBySession.set(
      lastUserMessage.sessionID,
      lastUserMessage.signature,
    );
    state.lastPressureCheckpointKeyBySession.delete(lastUserMessage.sessionID);
    pendingHygieneReminderBySession.delete(lastUserMessage.sessionID);
    hygiene.handleRequestStart({ sessionID: lastUserMessage.sessionID });
  }

  async function handleSystemTransform(
    input: { sessionID?: string },
    output: { system: string[] },
  ): Promise<void> {
    if (!input.sessionID || !isOrchestratorSession(input.sessionID)) {
      return;
    }

    const reminder = pendingHygieneReminderBySession.get(input.sessionID);
    if (!reminder) {
      return;
    }

    const instruction = `${TODO_HYGIENE_INSTRUCTION_OPEN}\n${reminder}\n${TODO_HYGIENE_INSTRUCTION_CLOSE}`;
    if (output.system.join('\n\n').includes(TODO_HYGIENE_INSTRUCTION_OPEN)) {
      return;
    }

    output.system.push(instruction);
  }

  function markNotificationStarted(sessionID: string): void {
    state.notifyingSessionIds.add(sessionID);
  }

  function markNotificationFinished(sessionID: string): void {
    state.notifyingSessionIds.delete(sessionID);
    state.notificationBusyUntilBySession.set(
      sessionID,
      Date.now() + NOTIFICATION_BUSY_GRACE_MS,
    );
  }

  function clearNotificationState(sessionID: string): void {
    state.notifyingSessionIds.delete(sessionID);
    state.notificationBusyUntilBySession.delete(sessionID);
  }

  async function emitUserVisibleNotification(
    sessionID: string,
    text: string,
  ): Promise<void> {
    markNotificationStarted(sessionID);
    try {
      await ctx.client.session.prompt({
        path: { id: sessionID },
        body: {
          noReply: true,
          parts: [{ type: 'text', text }],
        },
      });
    } catch {
      // best-effort user-visible notification
    } finally {
      markNotificationFinished(sessionID);
    }
  }

  function isNotificationBusy(sessionID: string): boolean {
    if (state.notifyingSessionIds.has(sessionID)) {
      return true;
    }

    const until = state.notificationBusyUntilBySession.get(sessionID) ?? 0;
    if (until <= Date.now()) {
      state.notificationBusyUntilBySession.delete(sessionID);
      return false;
    }
    return true;
  }

  function isOrchestratorSession(sessionID: string): boolean {
    return state.orchestratorSessionIds.has(sessionID);
  }

  function disableContinuationForSession(
    sessionID: string,
    reason: string,
    suppressAutoEnable = true,
  ): void {
    setContinuationEnabled(state, sessionID, false);
    setConsecutiveContinuations(state, sessionID, 0);
    cancelPendingTimer(state);
    clearNotificationState(sessionID);
    state.reviewVerdictBySession.delete(sessionID);
    state.reviewInjectedBySession.delete(sessionID);
    if (suppressAutoEnable) {
      state.autoEnableSuppressedSessionIds.add(sessionID);
    }
    log(`[${HOOK_NAME}] Auto-continue disabled: ${reason}`, {
      sessionID,
    });
    scheduleStateSave(ctx.directory, state);
  }

  function disableContinuationForCompletedBatch(sessionID: string): void {
    disableContinuationForSession(sessionID, 'auto-review approved', false);
  }

  async function disableContinuationForReviewStop(
    sessionID: string,
    verdict: 'needs_user' | 'blocked',
    reason: string,
  ): Promise<void> {
    await emitUserVisibleNotification(
      sessionID,
      buildUserVisibleReviewNotification({
        stage: verdict,
        findings: reason,
      }),
    );
    disableContinuationForSession(sessionID, `auto-review ${verdict}`);
    log(`[${HOOK_NAME}] Auto-review stopped for user/external input`, {
      sessionID,
      verdict,
      reason,
    });
  }

  async function pauseAutoMode(
    sessionID: string,
    reason: string,
    details: string,
  ): Promise<void> {
    await config?.onAutoPause?.({ sessionID, reason, details });
    disableContinuationForSession(sessionID, `auto pause: ${reason}`);
  }

  function clearTransientFailure(sessionID: string): void {
    state.transientFailureCountBySession.delete(sessionID);
  }

  async function handleTransientFetchFailure(
    sessionID: string,
    reason: 'todo-fetch-failed' | 'message-fetch-failed',
    details: string,
  ): Promise<void> {
    const nextCount =
      (state.transientFailureCountBySession.get(sessionID) ?? 0) + 1;
    state.transientFailureCountBySession.set(sessionID, nextCount);

    if (nextCount < TRANSIENT_FAILURE_RETRY_LIMIT) {
      const backoffMs = TRANSIENT_FAILURE_BACKOFF_MS * nextCount;
      state.suppressUntil = Math.max(
        state.suppressUntil,
        Date.now() + backoffMs,
      );
      log(
        `[${HOOK_NAME}] Transient fetch failure: ${reason} — retrying later`,
        {
          sessionID,
          attempt: nextCount,
          retryLimit: TRANSIENT_FAILURE_RETRY_LIMIT,
          backoffMs,
          details,
        },
      );
      return;
    }

    await pauseAutoMode(sessionID, reason, details);
  }

  function registerOrchestratorSession(sessionID: string): void {
    state.orchestratorSessionIds.add(sessionID);
  }

  function handleChatMessage(input: {
    sessionID: string;
    agent?: string;
  }): void {
    if (!input.agent) {
      return;
    }

    state.sawChatMessage = true;
    if (isPrimaryAgentName(input.agent)) {
      registerOrchestratorSession(input.sessionID);
    }
  }

  const autoContinue = tool({
    description:
      'Toggle auto-continuation for incomplete todos. When enabled, the orchestrator will automatically continue working through its todo list when it stops with incomplete items.',
    args: { enabled: tool.schema.boolean() },
    execute: async (args, toolContext) => {
      const enabled = args.enabled;
      const sessionID =
        toolContext &&
        typeof toolContext === 'object' &&
        'sessionID' in toolContext
          ? (toolContext as { sessionID?: string }).sessionID
          : undefined;

      // Permission: primary agents (orchestrator, engineer, etc.) can disable
      // auto-continue after completing a review cycle. The review runs in the
      // main agent with @reviewer identity — not as a subagent.
      if (!enabled) {
        const callerAgent =
          (toolContext as { agent?: string } | undefined)?.agent ?? '';
        if (callerAgent) {
          const isPrimaryOrReviewer =
            callerAgent === 'reviewer' ||
            callerAgent.includes('review') ||
            PRIMARY_AGENT_NAMES.has(callerAgent as any);
          if (!isPrimaryOrReviewer) {
            return 'Auto-continue can only be disabled by primary agents or @reviewer after a review cycle.';
          }
        }
      }

      // Always set both global and per-session so auto-continue survives restarts
      setContinuationEnabled(state, sessionID, enabled);
      setConsecutiveContinuations(state, sessionID, 0);

      if (enabled) {
        if (sessionID) {
          state.autoEnableSuppressedSessionIds.delete(sessionID);
        } else {
          state.autoEnableSuppressedSessionIds.clear();
          state.autoEnableSuppressedGlobally = false;
        }
        state.suppressUntil = 0;
        log(`[${HOOK_NAME}] Auto-continue enabled`, { maxContinuations });
        scheduleStateSave(ctx.directory, state);
        return `Auto-continue enabled. Will auto-continue for up to ${maxContinuations} consecutive injections.`;
      }

      if (sessionID) {
        state.autoEnableSuppressedSessionIds.add(sessionID);
      } else {
        state.autoEnableSuppressedGlobally = true;
      }
      // Cancel any pending timer on disable
      cancelPendingTimer(state);
      log(`[${HOOK_NAME}] Auto-continue disabled`);
      scheduleStateSave(ctx.directory, state);
      return 'Auto-continue disabled.';
    },
  });

  async function handleEvent(input: {
    event: { type: string; properties?: Record<string, unknown> };
  }): Promise<void> {
    const { event } = input;
    const properties = event.properties ?? {};

    hygiene.handleEvent({
      type: event.type,
      properties: {
        info: properties.info as { id?: string } | undefined,
        sessionID: properties.sessionID as string | undefined,
      },
    });

    // Crash detection — when session errors happen, mark as recovering
    // to prevent immediate re-inject into a crashed session.
    // Only for session.deleted (explicit crash/disconnect) and transport-level
    // errors; routine session.error (tool failures, API errors) continue normally.
    if (event.type === 'session.deleted') {
      const sessionID = properties.sessionID as string;
      if (sessionID) {
        crashRecovery.markRecovering(sessionID);
        log(`[${HOOK_NAME}] Marked session as recovering`, { sessionID });
      }
    }

    if (
      event.type === 'session.idle' ||
      (event.type === 'session.status' &&
        (properties.status as { type?: string } | undefined)?.type === 'idle')
    ) {
      const sessionID = properties.sessionID as string;
      if (!sessionID) {
        return;
      }

      log(`[${HOOK_NAME}] Session idle`, { sessionID });

      // Gate: user aborted — don't continue
      if (state.abortedByUser) {
        log(
          `[${HOOK_NAME}] Skipped: user aborted (ESC). New message required.`,
          { sessionID },
        );
        return;
      }

      // Gate: settle delay (OpenCode v1.15.0 event system can fire idle
      // events while the session is still mid-response — this small delay
      // lets in-flight work settle before we decide to inject).
      // Pattern borrowed from oh-my-openagent's prompt-async-gate.
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Gate: crash recovery — skip sessions that recently errored
      if (crashRecovery.isRecovering(sessionID)) {
        log(`[${HOOK_NAME}] Skipped: session is recovering from crash`, {
          sessionID,
        });
        return;
      }

      // Backward compatibility: if no chat.message has identified the
      // orchestrator yet, fall back to the first idle session.
      if (!state.sawChatMessage && state.orchestratorSessionIds.size === 0) {
        registerOrchestratorSession(sessionID);
        log(`[${HOOK_NAME}] Tracked orchestrator session`, {
          sessionID,
        });
      }

      // Gate: session is orchestrator (needed before auto-enable check)
      if (!isOrchestratorSession(sessionID)) {
        log(`[${HOOK_NAME}] Skipped: not orchestrator session`, {
          sessionID,
        });
        return;
      }

      // Auto-enable check: if configured, not yet enabled, and enough
      // todos exist, automatically enable auto-continue.
      if (
        autoEnable &&
        !isContinuationEnabled(state, sessionID) &&
        !state.autoEnableSuppressedGlobally &&
        !state.autoEnableSuppressedSessionIds.has(sessionID)
      ) {
        try {
          const todosResult = await ctx.client.session.todo({
            path: { id: sessionID },
          });
          const todos = todosResult.data as TodoItem[];
          const incompleteCount = todos.filter(
            (t) => !TERMINAL_TODO_STATUSES.includes(t.status),
          ).length;
          if (incompleteCount >= autoEnableThreshold) {
            setContinuationEnabled(state, sessionID, true);
            setConsecutiveContinuations(state, sessionID, 0);
            state.suppressUntil = 0;
            log(
              `[${HOOK_NAME}] Auto-enabled: ${incompleteCount} incomplete todos >= threshold ${autoEnableThreshold}`,
              { sessionID },
            );
          } else {
            log(
              `[${HOOK_NAME}] Auto-enable skipped: ${incompleteCount} incomplete todos < threshold ${autoEnableThreshold}`,
              { sessionID },
            );
          }
        } catch (error) {
          log(
            `[${HOOK_NAME}] Warning: failed to fetch todos for auto-enable check`,
            {
              sessionID,
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }
      }

      // Safety gate 1: enabled
      if (!isContinuationEnabled(state, sessionID)) {
        log(`[${HOOK_NAME}] Skipped: auto-continue not enabled`, {
          sessionID,
        });
        return;
      }

      // Safety gate 2: incomplete todos exist
      let hasIncompleteTodos = false;
      let incompleteCount = 0;
      let todos: TodoItem[] = [];
      try {
        const todosResult = await ctx.client.session.todo({
          path: { id: sessionID },
        });
        todos = todosResult.data as TodoItem[];
        incompleteCount = todos.filter(
          (t) => !TERMINAL_TODO_STATUSES.includes(t.status),
        ).length;
        hasIncompleteTodos = incompleteCount > 0;
        log(`[${HOOK_NAME}] Fetched todos`, {
          sessionID,
          hasIncompleteTodos,
          total: todos.length,
        });
        clearTransientFailure(sessionID);
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        log(`[${HOOK_NAME}] Warning: failed to fetch todos`, {
          sessionID,
          error: details,
        });
        await handleTransientFetchFailure(
          sessionID,
          'todo-fetch-failed',
          details,
        );
        return;
      }

      if (!hasIncompleteTodos) {
        log(`[${HOOK_NAME}] All todos complete`, { sessionID });

        // === AUTO-REVIEW: Only in full-auto mode ===
        if (state.reviewInjectedBySession.has(sessionID)) {
          // Review already injected — check for verdict in last assistant message
          try {
            const messagesResult = await ctx.client.session.messages({
              path: { id: sessionID },
            });
            const messages = messagesResult.data as Message[];
            const lastAssistant = messages
              .slice()
              .reverse()
              .find((m) => m.info?.role === 'assistant');
            if (lastAssistant?.parts) {
              const text = lastAssistant.parts
                .map((p) => p.text ?? '')
                .join(' ');
              const { verdict, findings } = parseReviewVerdict(text);
              if (verdict === 'approve') {
                await config?.onBatchSummary?.({
                  sessionID,
                  summary: findings,
                });
                await config?.onReviewOutcome?.({
                  sessionID,
                  verdict,
                  findings,
                });
                disableContinuationForCompletedBatch(sessionID);
                return; // Allow stop
              }
              if (verdict === 'reject') {
                await config?.onReviewOutcome?.({
                  sessionID,
                  verdict,
                  findings,
                });
                state.reviewVerdictBySession.set(sessionID, 'reject');
                state.reviewInjectedBySession.delete(sessionID);
                setConsecutiveContinuations(state, sessionID, 0);
                log(`[${HOOK_NAME}] Review REJECTED — injecting rework`, {
                  sessionID,
                  findings,
                });
                // Inject rework prompt
                state.isAutoInjecting = true;
                try {
                  await emitUserVisibleNotification(
                    sessionID,
                    buildUserVisibleReviewNotification({
                      stage: 'rejected',
                      findings,
                    }),
                  );
                  await ctx.client.session.prompt({
                    path: { id: sessionID },
                    body: {
                      parts: [
                        createInternalAgentTextPart(
                          buildReworkPrompt(findings),
                        ),
                      ],
                    },
                  });
                } finally {
                  state.isAutoInjecting = false;
                }
                return;
              }
              if (verdict === 'needs_user' || verdict === 'blocked') {
                await config?.onReviewOutcome?.({
                  sessionID,
                  verdict,
                  findings,
                });
                state.reviewVerdictBySession.set(sessionID, verdict);
                await disableContinuationForReviewStop(
                  sessionID,
                  verdict,
                  findings,
                );
                return;
              }
              // verdict === 'none' — agent hasn't given verdict yet, wait
              log(`[${HOOK_NAME}] Review pending — no verdict found yet`, {
                sessionID,
              });
              return;
            }
          } catch (error) {
            log(`[${HOOK_NAME}] Warning: failed to parse review verdict`, {
              sessionID,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }

        // First time all todos complete — inject review prompt
        log(`[${HOOK_NAME}] Injecting auto-review prompt`, { sessionID });
        state.reviewInjectedBySession.add(sessionID);
        state.reviewVerdictBySession.set(sessionID, 'pending');
        const contextPressure = config?.contextPressure;
        const reviewPressureState = contextPressure?.getState(sessionID);
        const reviewPrompt = buildReviewPrompt(
          reviewPressureState
            ? {
                ...reviewPressureState,
                strategy:
                  contextPressure?.getRecommendedStrategy(sessionID) ?? '',
              }
            : undefined,
        );
        state.isAutoInjecting = true;
        try {
          await emitUserVisibleNotification(
            sessionID,
            buildUserVisibleReviewNotification({ stage: 'starting' }),
          );
          await ctx.client.session.prompt({
            path: { id: sessionID },
            body: {
              parts: [createInternalAgentTextPart(reviewPrompt)],
            },
          });
          incrementConsecutiveContinuations(state, sessionID);
        } catch (error) {
          log(`[${HOOK_NAME}] Error: failed to inject review prompt`, {
            sessionID,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          state.isAutoInjecting = false;
        }
        return;
      }

      // Safety gate 3: inspect last assistant message, but do not let
      // self-generated "should I continue?" style questions stop an
      // unfinished batch. Only explicit user stop / abort / blocker should stop.
      let lastAssistantIsQuestion = false;
      try {
        const messagesResult = await ctx.client.session.messages({
          path: { id: sessionID },
        });
        const messages = messagesResult.data as Message[];
        const lastAssistantMessage = messages
          .slice()
          .reverse()
          .find((m) => m.info?.role === 'assistant');
        if (lastAssistantMessage?.parts) {
          const lastText = lastAssistantMessage.parts
            .map((p) => p.text ?? '')
            .join(' ');
          lastAssistantIsQuestion = isQuestion(lastText);
        }
        log(`[${HOOK_NAME}] Fetched messages`, {
          sessionID,
          lastAssistantIsQuestion,
        });
        clearTransientFailure(sessionID);
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        log(`[${HOOK_NAME}] Warning: failed to fetch messages`, {
          sessionID,
          error: details,
        });
        await handleTransientFetchFailure(
          sessionID,
          'message-fetch-failed',
          details,
        );
        return;
      }

      if (lastAssistantIsQuestion) {
        log(
          `[${HOOK_NAME}] Last assistant message is a question, but incomplete todos force continuation`,
          {
            sessionID,
          },
        );
      }

      // Safety gate 4: below max continuations
      if (getConsecutiveContinuations(state, sessionID) >= maxContinuations) {
        log(`[${HOOK_NAME}] Skipped: max continuations reached`, {
          sessionID,
          consecutive: getConsecutiveContinuations(state, sessionID),
          max: maxContinuations,
        });
        await pauseAutoMode(
          sessionID,
          'max-continuations-reached',
          `Reached ${getConsecutiveContinuations(state, sessionID)} consecutive auto continuations (max ${maxContinuations}).`,
        );
        return;
      }

      // Safety gate 5: not in suppress window
      const now = Date.now();
      if (now < state.suppressUntil) {
        log(`[${HOOK_NAME}] Skipped: in suppress window`, {
          sessionID,
          suppressUntil: state.suppressUntil,
        });
        return;
      }

      // Safety gate 6: no pending timer AND no injection in flight
      if (state.pendingTimer !== null || state.isAutoInjecting) {
        log(`[${HOOK_NAME}] Skipped: timer pending or injection in flight`, {
          sessionID,
        });
        return;
      }

      const pressureState = config?.contextPressure?.getState(sessionID);
      if (
        pressureState &&
        config?.contextPressure?.shouldForceCheckpoint(sessionID)
      ) {
        const strategy =
          config.contextPressure.getRecommendedStrategy(sessionID);
        log(`[${HOOK_NAME}] Context pressure forcing checkpoint-first flow`, {
          sessionID,
          level: pressureState.level,
          ratio: pressureState.ratio,
          strategy,
        });

        const pressureCheckpointKey = [
          pressureState.level,
          strategy,
          Math.round(pressureState.ratio * 100),
          pressureState.contextLimit,
        ].join(':');
        if (
          state.lastPressureCheckpointKeyBySession.get(sessionID) !==
          pressureCheckpointKey
        ) {
          state.lastPressureCheckpointKeyBySession.set(
            sessionID,
            pressureCheckpointKey,
          );
          try {
            await config.contextPressure.onForceCheckpoint?.({
              sessionID,
              level: pressureState.level,
              ratio: pressureState.ratio,
              totalTokens: pressureState.totalTokens,
              contextLimit: pressureState.contextLimit,
              strategy,
            });
          } catch (error) {
            state.lastPressureCheckpointKeyBySession.delete(sessionID);
            log(
              `[${HOOK_NAME}] Warning: failed to record pressure checkpoint`,
              {
                sessionID,
                error: error instanceof Error ? error.message : String(error),
              },
            );
          }
        }

        state.isAutoInjecting = true;
        try {
          await emitUserVisibleNotification(
            sessionID,
            buildUserVisibleContextPressureNotification({
              level: pressureState.level,
              ratio: pressureState.ratio,
              totalTokens: pressureState.totalTokens,
              contextLimit: pressureState.contextLimit,
              strategy,
            }),
          );
          await ctx.client.session.prompt({
            path: { id: sessionID },
            body: {
              parts: [
                createInternalAgentTextPart(
                  `[Context-pressure forcing: current session is at L${pressureState.level} (${Math.round(
                    pressureState.ratio * 100,
                  )}% of model context, ${pressureState.totalTokens.toLocaleString()} / ${pressureState.contextLimit.toLocaleString()} tokens). Before continuing normal todos, perform the recommended ${strategy} response now: handle context pressure first using whatever context-management path is actually available in this runtime, create a concise checkpoint/handoff yourself when needed, then continue with delta-only updates. Do not stop after checkpointing; continue the batch unless blocked or user input is required.]`,
                ),
              ],
            },
          });
          incrementConsecutiveContinuations(state, sessionID);
        } catch (error) {
          log(
            `[${HOOK_NAME}] Error: failed to inject context-pressure continuation`,
            {
              sessionID,
              error: error instanceof Error ? error.message : String(error),
            },
          );
        } finally {
          state.isAutoInjecting = false;
        }
        return;
      }

      // Schedule continuation
      log(`[${HOOK_NAME}] Scheduling continuation`, {
        sessionID,
        delayMs: cooldownMs,
      });

      // Show countdown notification (noReply = agent doesn't respond)
      void emitUserVisibleNotification(
        sessionID,
        buildUserVisibleAutoContinueNotification({
          incompleteCount,
          cooldownMs,
          todosSummary: formatIncompleteTodoLines(todos),
        }),
      );

      state.pendingTimerSessionId = sessionID;
      state.pendingTimer = setTimeout(async () => {
        state.pendingTimer = null;
        state.pendingTimerSessionId = null;
        clearNotificationState(sessionID);

        // Guard: may have been disabled during cooldown
        if (!isContinuationEnabled(state, sessionID)) {
          log(`[${HOOK_NAME}] Cancelled: disabled during cooldown`, {
            sessionID,
          });
          return;
        }

        state.isAutoInjecting = true;
        try {
          await ctx.client.session.prompt({
            path: { id: sessionID },
            body: {
              parts: [
                createInternalAgentTextPart(buildContinuationPrompt(todos)),
              ],
            },
          });
          const consecutive = incrementConsecutiveContinuations(
            state,
            sessionID,
          );
          log(`[${HOOK_NAME}] Continuation injected`, {
            sessionID,
            consecutive,
          });
        } catch (error) {
          log(`[${HOOK_NAME}] Error: failed to inject continuation`, {
            sessionID,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          state.isAutoInjecting = false;
        }
      }, cooldownMs);
    } else if (event.type === 'session.status') {
      const status = properties.status as { type: string };
      const sessionID = properties.sessionID as string;
      if (status?.type === 'busy') {
        const isOrchestrator = isOrchestratorSession(sessionID);
        const isNotification = isNotificationBusy(sessionID);

        // Only cancel timer for orchestrator session — sub-agents going
        // busy must not silently kill the orchestrator's continuation.
        if (
          isOrchestrator &&
          !isNotification &&
          state.pendingTimerSessionId === sessionID
        ) {
          cancelPendingTimer(state);
        }

        // Only reset consecutive counter for user-initiated activity,
        // not for internal notifications.
        if (
          !isNotification &&
          isOrchestrator &&
          getConsecutiveContinuations(state, sessionID) > 0
        ) {
          setConsecutiveContinuations(state, sessionID, 0);
          log(`[${HOOK_NAME}] Reset consecutive count on user activity`, {
            sessionID,
          });
        }

        // User activity means they're engaged — clear abort flag
        if (!isNotification && isOrchestrator) {
          state.abortedByUser = false;
        }
      }
    } else if (event.type === 'session.error') {
      const error = properties.error as { name?: string };
      const sessionID = properties.sessionID as string;
      const errorName = error?.name;
      const isOrchestrator = isOrchestratorSession(sessionID);
      if (
        isOrchestrator &&
        (errorName === 'MessageAbortedError' || errorName === 'AbortError')
      ) {
        state.suppressUntil = Date.now() + SUPPRESS_AFTER_ABORT_MS;
        state.abortedByUser = true;
        log(`[${HOOK_NAME}] Suppressed continuation after abort`, {
          sessionID,
          errorName,
        });
      }
      if (isOrchestrator) {
        cancelPendingTimer(state);
        log(`[${HOOK_NAME}] Cancelled pending timer on error`, {
          sessionID,
        });
      }
    } else if (event.type === 'session.deleted') {
      // OpenCode sends sessionID in two shapes:
      // properties.info.id (from session store) or properties.sessionID (from event)
      const deletedSessionId =
        (properties.info as { id?: string })?.id ??
        (properties.sessionID as string);

      if (deletedSessionId && isOrchestratorSession(deletedSessionId)) {
        requestSignatureBySession.delete(deletedSessionId);
        if (state.pendingTimerSessionId === deletedSessionId) {
          cancelPendingTimer(state);
          log(`[${HOOK_NAME}] Cancelled pending timer on orchestrator delete`, {
            sessionID: deletedSessionId,
          });
        }

        state.orchestratorSessionIds.delete(deletedSessionId);
        state.enabledBySession.delete(deletedSessionId);
        state.consecutiveContinuationsBySession.delete(deletedSessionId);
        state.autoEnableSuppressedSessionIds.delete(deletedSessionId);
        state.lastPressureCheckpointKeyBySession.delete(deletedSessionId);
        clearNotificationState(deletedSessionId);
        if (state.orchestratorSessionIds.size === 0) {
          resetState(state);
          state.sawChatMessage = false;
        }
        log(`[${HOOK_NAME}] Reset orchestrator session on delete`, {
          sessionID: deletedSessionId,
        });
      }
    }
  }

  async function handleCommandExecuteBefore(
    input: {
      command: string;
      sessionID: string;
      arguments: string;
    },
    output: { parts: Array<{ type: string; text?: string }> },
  ): Promise<void> {
    if (
      input.command !== COMMAND_NAME &&
      input.command !== LEGACY_COMMAND_NAME &&
      input.command !== STOP_COMMAND_NAME &&
      input.command !== LEGACY_STOP_COMMAND_NAME
    ) {
      return;
    }

    // Seed orchestrator session from slash command (more reliable than
    // first-idle heuristic — slash commands only fire in main chat)
    registerOrchestratorSession(input.sessionID);

    if (
      input.command === STOP_COMMAND_NAME ||
      input.command === LEGACY_STOP_COMMAND_NAME
    ) {
      disableContinuationForSession(
        input.sessionID,
        `/${STOP_COMMAND_NAME} command`,
      );
      // Keep the prompt template intact so the AI-executed command still
      // performs its broader documented work (Ralph/boulder cleanup). The
      // hook only hard-stops todo auto-continuation deterministically.
      output.parts.push(
        createInternalAgentTextPart(
          '[Auto-continue: disabled by /ol-stop-continuation command.]',
        ),
      );
      return;
    }

    // Clear template text — /ol-auto-continue is handled entirely in this hook.
    output.parts.length = 0;

    // Accept explicit on/off argument, toggle only when no arg. Unknown
    // arguments are rejected so commands like `/ol-auto-continue false` never
    // accidentally toggle auto mode on.
    const arg = input.arguments.trim().toLowerCase();
    let newEnabled: boolean;
    if (!arg) {
      newEnabled = !isContinuationEnabled(state, input.sessionID);
    } else if (AUTO_ON_ARGS.has(arg)) {
      newEnabled = true;
    } else if (AUTO_OFF_ARGS.has(arg)) {
      newEnabled = false;
    } else {
      output.parts.push(
        createInternalAgentTextPart(
          `[Auto-continue: unknown argument "${arg}". Usage: /ol-auto-continue [on|off].]`,
        ),
      );
      return;
    }

    setContinuationEnabled(state, input.sessionID, newEnabled);
    setConsecutiveContinuations(state, input.sessionID, 0);

    if (!newEnabled) {
      state.autoEnableSuppressedSessionIds.add(input.sessionID);
      // Cancel any pending timer on disable
      cancelPendingTimer(state);
      output.parts.push(
        createInternalAgentTextPart(
          '[Auto-continue: disabled by user command.]',
        ),
      );
      log(`[${HOOK_NAME}] Disabled via /${COMMAND_NAME} command`);
      return;
    }

    // Clear suppress window on explicit re-enable
    state.autoEnableSuppressedSessionIds.delete(input.sessionID);
    state.autoEnableSuppressedGlobally = false;
    state.suppressUntil = 0;

    log(`[${HOOK_NAME}] Enabled via /${COMMAND_NAME} command`, {
      maxContinuations,
    });

    // Check for incomplete todos to decide on immediate continuation
    let todos: TodoItem[] = [];
    let hasIncompleteTodos = false;
    let todoFetchFailed = false;
    try {
      const todosResult = await ctx.client.session.todo({
        path: { id: input.sessionID },
      });
      todos = todosResult.data as TodoItem[];
      hasIncompleteTodos = todos.some(
        (t) => !TERMINAL_TODO_STATUSES.includes(t.status),
      );
    } catch (error) {
      todoFetchFailed = true;
      log(`[${HOOK_NAME}] Warning: failed to fetch todos in command hook`, {
        sessionID: input.sessionID,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (hasIncompleteTodos) {
      output.parts.push(
        createInternalAgentTextPart(
          `${buildContinuationPrompt(todos)}\n\n[Auto-continue enabled: up to ${maxContinuations} continuations.]`,
        ),
      );
    } else if (todoFetchFailed) {
      output.parts.push(
        createInternalAgentTextPart(
          `[Auto-continue: enabled for up to ${maxContinuations} continuations, but todos could not be verified right now. Auto mode is enabled; retry when todo access succeeds.]`,
        ),
      );
    } else {
      output.parts.push(
        createInternalAgentTextPart(
          `[Auto-continue: enabled for up to ${maxContinuations} continuations. No incomplete todos right now.]`,
        ),
      );
    }
  }

  return {
    tool: { auto_continue: autoContinue },
    handleToolExecuteAfter: hygiene.handleToolExecuteAfter,
    handleMessagesTransform,
    handleSystemTransform,
    handleEvent,
    handleChatMessage,
    handleCommandExecuteBefore,
  };
}

function isContinuationEnabled(
  state: ContinuationState,
  sessionID: string,
): boolean {
  return state.enabledBySession.get(sessionID) ?? state.enabled;
}

function setContinuationEnabled(
  state: ContinuationState,
  sessionID: string | undefined,
  enabled: boolean,
): void {
  if (sessionID) {
    state.enabledBySession.set(sessionID, enabled);
    return;
  }
  state.enabled = enabled;
}

function getConsecutiveContinuations(
  state: ContinuationState,
  sessionID: string,
): number {
  return (
    state.consecutiveContinuationsBySession.get(sessionID) ??
    state.consecutiveContinuations
  );
}

function setConsecutiveContinuations(
  state: ContinuationState,
  sessionID: string | undefined,
  count: number,
): void {
  if (sessionID) {
    state.consecutiveContinuationsBySession.set(sessionID, count);
    return;
  }
  state.consecutiveContinuations = count;
}

function incrementConsecutiveContinuations(
  state: ContinuationState,
  sessionID: string,
): number {
  const next = getConsecutiveContinuations(state, sessionID) + 1;
  setConsecutiveContinuations(state, sessionID, next);
  return next;
}

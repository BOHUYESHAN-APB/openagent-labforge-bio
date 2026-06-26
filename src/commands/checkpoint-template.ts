export const CHECKPOINT_TEMPLATE = `## CHECKPOINT COMMAND

You are creating a durable checkpoint for session recovery.
Checkpoint is the "reinforcement board" for compaction — it preserves detailed state that compaction might lose.

### PHASE 0: VALIDATE NEED
Confirm there is meaningful work worth saving. If no substantive work has been done, inform the user and skip.

### PHASE 1: GATHER PROGRAMMATIC CONTEXT
Execute these tools to collect current state:
1. \`Bash({ command: "echo $OPENCODE_SESSION_ID" })\` - Get current session ID (if available, otherwise return "unknown")
2. \`todoread()\` - Read current todo list
3. \`Bash({ command: "git diff --stat HEAD~5..HEAD" })\` - Recent changes
4. \`Bash({ command: "git status --porcelain" })\` - Working tree status
5. \`Bash({ command: "git log --oneline -5" })\` - Recent commits

### PHASE 2: DETERMINE CHECKPOINT KIND
- Accept shorthand arguments:
  - "h" or "heavy" → heavy checkpoint
  - "l" or "light" → light checkpoint
- Explicit kind wins: "h"/"heavy" forces heavy, "l"/"light" forces light
- If no kind is specified and context is very complex → heavy checkpoint
- If no kind is specified and context is simple → light checkpoint

**Light checkpoint**: Quick recovery, same-session continuation
  - For daily notes, current development stage
  - Each window manages its own checkpoint
  - Short-distance recovery

**Heavy checkpoint**: Cross-session handoff, long-running work
  - Complete state, all decisions, detailed context
  - For session transitions
  - Long-distance recovery

### PHASE 3: WRITE CHECKPOINT FILES

CRITICAL: You MUST write files yourself using the Write tool. The plugin does NOT automatically persist checkpoints.

**File structure:**
\`\`\`
.opencode/extendai-lab/checkpoints/
├── by-session/
│   └── {session-id}.md          ← 该会话最新的人工 checkpoint（唯一权威来源）
├── by-session-auto/
│   └── {session-id}.md          ← 自动压缩 checkpoint（插件写入，不要手动写）
├── latest.md                    ← 仅用于跨会话显式恢复（自动归档旧版到 history/）
├── latest.meta.json
└── history/
    └── {session-id}/
        └── {timestamp}-{level}.md  ← 永久存档
\`\`\`

**IMPORTANT: Session isolation rule** — Each session writes only to its own
\`by-session/{session-id}.md\`. Do NOT overwrite another session's file.
The \`latest.md\` is a convenience reference for cross-session handoff and
its old content is auto-archived to \`history/\` before overwriting.

**Write these files:**

**Step 3a — Archive previous \`latest.md\` if it exists:**
Before writing the new checkpoint, check if \`latest.md\` exists. If it does:
\`\`\`
1. Read the old latest.md to extract its session-id and timestamp
2. Move it to history/{old-session-id}/{old-timestamp}-{level}.md
   (create the history directory with mkdir -p)
\`\`\`
If the old file cannot be read, skip archiving and proceed.

**Step 3b — Write \`by-session/{session-id}.md\`** (primary checkpoint file):
\`\`\`
CHECKPOINT CONTEXT
==================

SOURCE SESSION
--------------
- Session ID: $SESSION_ID
- Created At: $TIMESTAMP
- Checkpoint Kind: [light|heavy]
- Trigger: manual

USER REQUESTS (AS-IS)
---------------------
[Exact verbatim user requests]

GOAL
----
[One short paragraph]

WORK COMPLETED
--------------
[Concrete work done, first person]

CURRENT STATE
-------------
[Code/research/document state]

PENDING TASKS
-------------
[From todoread(), still-open tasks]

KEY FILES
---------
[Max 12 files with descriptions]

IMPORTANT DECISIONS
-------------------
[Technical decisions and rationale]

RESUME INSTRUCTIONS
-------------------
[How next session should pick up. Include: active plan name, key files, and the exact command: /ol-checkpoint-resume $SESSION_ID]
\`\`\`

**Step 3c — Write \`history/{session-id}/{timestamp}-{level}.md\`** (archive copy):
Same content as \`by-session/{session-id}.md\`. Write to:
\`\`\`
.opencode/extendai-lab/checkpoints/history/{session-id}/{timestamp}-{level}.md
\`\`\`
Use \`mkdir -p\` to create the directory first.

**Step 3d — Write \`latest.md\`** (cross-session reference copy):
Same content as \`by-session/{session-id}.md\`.

**Step 3e — Write \`latest.meta.json\`** (metadata):
\`\`\`json
{
  "checkpoint_kind": "[light|heavy]",
  "checkpoint_scope": "[same-session|cross-session]",
  "source_session_id": "$SESSION_ID",
  "created_at": "$TIMESTAMP",
  "goal": "...",
  "status": "active",
  "session_switch_recommendation": "[stay|recommend-switch]"
}
\`\`\`

### PHASE 4: RESPOND TO USER
After writing all files, respond with:

\`\`\`
══════════════════════════════════════
✅  {Checkpoint kind} checkpoint saved
   Session: $SESSION_ID
   Goal: {brief goal}

📋  **恢复命令（在新会话粘贴即可恢复）:**
   \`/ol-checkpoint-resume $SESSION_ID\`
══════════════════════════════════════
\`\`\`

1. Print the checkpoint kind (light/heavy) and session ID
2. Print the copyable resume command
3. If heavy: recommend switching to new session
4. If light: suggest continuing in current session

### ARGUMENT STYLE
- Prefer short option letters for future parameterized commands when the meaning is unambiguous (for example, "h"/"l" instead of always requiring "heavy"/"light").
- Keep full words accepted for readability and backwards compatibility.

### CONSTRAINTS
- Use Write tool for ALL file creation
- Keep checkpoint concise (< 500 lines)
- Preserve user requests verbatim
- Use workspace-relative paths
- No sensitive information (secrets, keys)
- Do NOT write to by-session-auto/ (that directory is for automatic compaction checkpoints only)`;

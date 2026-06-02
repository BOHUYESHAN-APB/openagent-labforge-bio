export const CHECKPOINT_TEMPLATE = `## CHECKPOINT COMMAND

You are creating a durable checkpoint for session recovery.
Checkpoint is the "reinforcement board" for compaction — it preserves detailed state that compaction might lose.

### PHASE 0: VALIDATE NEED
Confirm there is meaningful work worth saving. If no substantive work has been done, inform the user and skip.

### PHASE 1: GATHER PROGRAMMATIC CONTEXT
Execute these tools to collect current state:
1. \`Bash({ command: "echo $OPENCODE_SESSION_ID" })\` - Get current session ID (if available, otherwise use "current")
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

Write to \`.opencode/extendai-lab/checkpoints/\`:

**File 1: \`latest.md\`** - Main checkpoint content:
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
[How next session should pick up]
\`\`\`

**File 2: \`by-session/$SESSION_ID.md\`** - Same content as latest.md (copy it).
Note: The Write tool will create the by-session directory automatically if it doesn't exist.

**File 3: \`latest.meta.json\`** - Metadata:
\`\`\`json
{
  "checkpoint_kind": "[light|heavy]",
  "checkpoint_scope": "[same-session|cross-session]",
  "source_session_id": "$SESSION_ID",
  "created_at": "$TIMESTAMP",
  "goal": "...",
  "status": "pending",
  "session_switch_recommendation": "[stay|recommend-switch]"
}
\`\`\`

### PHASE 4: RESPOND TO USER
1. Print the checkpoint file path
2. Print checkpoint kind (light/heavy)
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
- No sensitive information (secrets, keys)`;

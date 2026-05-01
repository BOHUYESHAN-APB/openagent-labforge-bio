export const CHECKPOINT_TEMPLATE = `## CHECKPOINT COMMAND

You are creating a durable checkpoint for session recovery.

### PHASE 0: VALIDATE NEED
Confirm there is meaningful work worth saving. If no substantive work has been done, inform the user and skip.

### PHASE 1: GATHER PROGRAMMATIC CONTEXT
Execute these tools to collect current state:
1. \`todoread()\` - Read current todo list
2. \`Bash({ command: "git diff --stat HEAD~5..HEAD" })\` - Recent changes
3. \`Bash({ command: "git status --porcelain" })\` - Working tree status
4. \`Bash({ command: "git log --oneline -5" })\` - Recent commits

### PHASE 2: DETERMINE CHECKPOINT KIND
- If user specified "heavy" or context is very complex → heavy checkpoint
- Otherwise → light checkpoint

**Light checkpoint**: Quick recovery, same-session continuation
**Heavy checkpoint**: Cross-session handoff, long-running work

### PHASE 3: WRITE CHECKPOINT FILES

Write to \`.opencode/openagent-labforge/checkpoints/\`:

**File 1: \`latest.md\`** - Main checkpoint content with these sections:
\`\`\`
CHECKPOINT CONTEXT
==================

SOURCE SESSION
--------------
- Session ID: $SESSION_ID
- Created At: $TIMESTAMP
- Checkpoint Kind: [light|heavy]

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

**File 2: \`by-session/$SESSION_ID.md\`** - Same content as latest.md

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

### CONSTRAINTS
- Use Write tool for file creation
- Keep checkpoint concise (< 500 lines)
- Preserve user requests verbatim
- Use workspace-relative paths
- No sensitive information (secrets, keys)`

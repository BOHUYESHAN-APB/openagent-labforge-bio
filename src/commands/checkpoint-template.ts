export const CHECKPOINT_TEMPLATE = `## CHECKPOINT COMMAND

You are creating a durable checkpoint for session recovery.
Checkpoint is the "reinforcement board" for compaction — it preserves detailed state that compaction might lose.

### PHASE 0: VALIDATE NEED
Confirm there is meaningful work worth saving. If no substantive work has been done, inform the user and skip.

### PHASE 1: GATHER PROGRAMMATIC CONTEXT
Execute these tools to collect current state:
1. \`todoread()\` - Read current todo list
2. \`Bash({ command: "git diff --stat HEAD~5..HEAD" })\` - Recent changes
3. \`Bash({ command: "git status --porcelain" })\` - Working tree status
4. \`Bash({ command: "git log --oneline -5" })\` - Recent commits

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

The plugin system handles file persistence automatically via \`createVersionedCheckpoint()\`.
You do NOT need to write files manually. Instead, provide the structured content below.

**Provide this structured data (the plugin will persist it):**

\`\`\`
CHECKPOINT ID: [auto-generated]
SESSION ID: [current session]
LEVEL: [light|heavy]
TRIGGER: manual

GOAL: [One short paragraph]

WORK COMPLETED / CURRENT STATE: [Concrete work done, first person]

PENDING TASKS:
- [task 1]
- [task 2]

KEY FILES: [Max 12 files with descriptions]

IMPORTANT DECISIONS:
- [decision 1]
- [decision 2]

OPEN ISSUES:
- [issue 1]

RESUME INSTRUCTIONS: [How next session should pick up]
\`\`\`

### PHASE 4: RESPOND TO USER
1. Print the checkpoint level (light/heavy)
2. Print checkpoint ID
3. If heavy: recommend switching to new session
4. If light: suggest continuing in current session

### ARGUMENT STYLE
- Prefer short option letters for future parameterized commands when the meaning is unambiguous (for example, "h"/"l" instead of always requiring "heavy"/"light").
- Keep full words accepted for readability and backwards compatibility.

### CONSTRAINTS
- Keep checkpoint concise (< 500 lines)
- Preserve user requests verbatim
- Use workspace-relative paths
- No sensitive information (secrets, keys)
- The plugin system handles file persistence — you provide the content structure`;

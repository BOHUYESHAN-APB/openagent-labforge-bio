export const CHECKPOINT_RESUME_TEMPLATE = `## CHECKPOINT RESUME COMMAND

Load a checkpoint and resume work from it.

### PHASE 0: RESOLVE CHECKPOINT SOURCE
Determine which checkpoint to load:
- No argument: Read \`.opencode/openagent-labforge/checkpoints/latest.md\`
- Session ID argument: Read \`.opencode/openagent-labforge/checkpoints/by-session/$ARGUMENTS.md\`
- Path argument: Read that file directly

### PHASE 1: LOAD CHECKPOINT CONTEXT
1. Read the checkpoint markdown file
2. Read \`.opencode/openagent-labforge/checkpoints/latest.meta.json\` if exists
3. Extract: goal, current state, pending tasks, key decisions, resume instructions

### PHASE 2: REBUILD EXECUTION STATE
1. Restate the carried-forward mission from checkpoint
2. Restate the goal and current state
3. Create todo list from pending tasks in checkpoint
4. Acknowledge any new user request

### PHASE 3: UPDATE METADATA
If checkpoint has \`latest.meta.json\`, update:
\`\`\`json
{
  "status": "consumed",
  "consumed_by_session_id": "$SESSION_ID",
  "consumed_at": "$TIMESTAMP"
}
\`\`\`

### PHASE 4: RESPOND
1. Confirm checkpoint loaded (show kind: light/heavy)
2. Show restored goal and current state
3. Show restored todo list
4. Ask user for next action or continue with their request

### CONSTRAINTS
- If checkpoint not found, inform user clearly
- Preserve all context from checkpoint
- Create todos from pending tasks immediately
- Do not modify original checkpoint files`

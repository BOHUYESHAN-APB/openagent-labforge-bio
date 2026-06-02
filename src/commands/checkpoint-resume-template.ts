export const CHECKPOINT_RESUME_TEMPLATE = `## CHECKPOINT RESUME COMMAND

Load a checkpoint and resume work from it.
Checkpoint is the "reinforcement board" for compaction — it preserves detailed state that compaction might lose.

### PHASE 0: RESOLVE CHECKPOINT SOURCE
Determine which checkpoint to load:
- No argument: Read the latest checkpoint for current session, falling back to workspace latest
- Session ID argument: Read that session's checkpoint
- "latest" argument: Read workspace-level latest checkpoint
- Path argument: Read that file directly

**Resolution order:**
1. If session ID provided → read \`.opencode/extendai-lab/checkpoints/by-session/$SESSION_ID.md\`
2. If no argument → read current session's checkpoint, then workspace latest
3. Fallback to legacy \`.opencode/openagent-labforge/checkpoints/latest.md\`

### PHASE 1: LOAD CHECKPOINT CONTEXT
1. Read the checkpoint markdown file
2. Read \`.opencode/extendai-lab/checkpoints/latest.meta.json\` if exists
3. Extract: goal, current state, pending tasks, key decisions, resume instructions
4. Check if checkpoint was created before compaction (pre_compaction flag)

### PHASE 2: REBUILD EXECUTION STATE
1. Restate the carried-forward mission from checkpoint
2. Restate the goal and current state
3. Create todo list from pending tasks in checkpoint
4. Acknowledge any new user request
5. If checkpoint was pre-compaction: note that some context may have been compressed

### PHASE 3: UPDATE METADATA
If checkpoint has \`latest.meta.json\`, update:
\`\`\`json
{
  "checkpoint_status": "consumed",
  "consumed_by_session_id": "$SESSION_ID",
  "consumed_at": "$TIMESTAMP"
}
\`\`\`

### PHASE 4: RESPOND
1. Confirm checkpoint loaded (show level: light/heavy)
2. Show restored goal and current state
3. Show restored todo list
4. If pre-compaction checkpoint: warn that context was compressed
5. Ask user for next action or continue with their request

### CONSTRAINTS
- If checkpoint not found, inform user clearly
- Preserve all context from checkpoint
- Create todos from pending tasks immediately
- Do not modify original checkpoint .md files
- You MAY update latest.meta.json to mark checkpoint as consumed`;

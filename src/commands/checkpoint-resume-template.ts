export const CHECKPOINT_RESUME_TEMPLATE = `## CHECKPOINT RESUME COMMAND

Load a checkpoint and resume work from it.
Checkpoint is the "reinforcement board" for compaction — it preserves detailed state that compaction might lose.

### PHASE 0: RESOLVE CHECKPOINT SOURCE
Determine which checkpoint to load:

**Argument handling:**
1. **Session ID provided** (e.g., \`/ol-checkpoint-resume ses_abc123\`)
   → Read \`.opencode/extendai-lab/checkpoints/by-session/ses_abc123.md\`
   → This is the primary, intended use case for cross-session handoff
2. **No argument**
   → Read current session's own checkpoint:
     \`.opencode/extendai-lab/checkpoints/by-session/{current-session-id}.md\`
3. **"latest" argument** (\`/ol-checkpoint-resume latest\`)
   → Read workspace-level \`latest.md\` (cross-session convenience reference)
   → Only use this when you don't know the target session ID

**File resolution order (per session):**
1. \`.opencode/extendai-lab/checkpoints/by-session/$SESSION_ID.md\` (manual checkpoint — PRIMARY)
2. \`.opencode/extendai-lab/checkpoints/by-session-auto/$SESSION_ID.md\` (auto-compaction checkpoint — fallback)
3. \`.opencode/extendai-lab/checkpoints/latest.md\` (workspace latest — only for "latest" arg)

**Directory structure:**
\`\`\`
.opencode/extendai-lab/checkpoints/
├── by-session/
│   └── {session-id}.md          ← 该会话最新的人工 checkpoint（唯一权威来源）
├── by-session-auto/
│   └── {session-id}.md          ← 自动压缩 checkpoint（fallback）
├── latest.md                    ← 跨会话参考（仅 /ol-checkpoint-resume latest 使用）
├── latest.meta.json
└── history/
    └── {session-id}/
        └── {timestamp}-{level}.md  ← 永久存档
\`\`\`

**Important: Session isolation**
Each session has its own \`by-session/{id}.md\`. Do NOT read another session's
checkpoint unless explicitly asked (by session ID argument).
The \`latest.md\` is a cross-session convenience reference only — prefer
session-specific files for reliable recovery.

### PHASE 1: LOAD CHECKPOINT CONTEXT
1. Read the checkpoint markdown file (using resolution rules above)
2. Read metadata:
   - For manual/by-session: check \`latest.meta.json\`
   - For auto: \`.opencode/extendai-lab/checkpoints/by-session-auto/$SESSION_ID.meta.json\`
3. Extract: goal, current state, pending tasks, key decisions, resume instructions
4. Check if checkpoint was created before compaction (pre_compaction flag)
5. If checkpoint mentions an active execution plan / boulder-backed plan, treat that as the authoritative execution lane to restore
6. If checkpoint mentions a Loop FSM state, restore loop awareness

### PHASE 2: REBUILD EXECUTION STATE
1. Restate the carried-forward mission from checkpoint
2. Restate the goal and current state
3. If checkpoint contains active execution plan details, re-read that saved plan file first and rebuild todos from the current top-level plan checkboxes before trusting any stale todo state
4. Create todo list from pending tasks in checkpoint
5. Acknowledge any new user request
6. If checkpoint was pre-compaction: note that some context may have been compressed

### PHASE 3: UPDATE METADATA
If checkpoint has metadata file, update:
\`\`\`json
{
  "checkpoint_status": "consumed",
  "consumed_by_session_id": "$SESSION_ID",
  "consumed_at": "$TIMESTAMP"
}
\`\`\`

### PHASE 4: RESPOND
1. Confirm checkpoint loaded (show level: light/heavy, source: manual/auto, session ID)
2. Show restored goal and current state
3. Show restored todo list
4. If an active execution plan was recovered, say so explicitly and continue from that plan instead of asking for a fresh execution target
5. If pre-compaction checkpoint: warn that context was compressed
6. Ask user for next action or continue with their request

### CONSTRAINTS
- If checkpoint not found, inform user clearly
- Preserve all context from checkpoint
- Create todos from pending tasks immediately
- Do not modify original checkpoint .md files
- You MAY update metadata file to mark checkpoint as consumed`;

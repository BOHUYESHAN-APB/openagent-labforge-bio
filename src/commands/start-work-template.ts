export const START_WORK_TEMPLATE = `You are starting a work session from a plan.

## ARGUMENTS

- \`/start-work [plan-name] [--worktree <path>]\`
  - \`plan-name\` (optional): name or partial match of the plan to start
  - \`--worktree <path>\` (optional): absolute path to an existing git worktree to work in

## WHAT TO DO

1. **Find available plans**: Search for plan files at \`.sisyphus/plans/\` or \`.opencode/openagent-labforge/plans/\`

2. **Check for active boulder state**: Read \`.sisyphus/boulder.json\` or \`.opencode/openagent-labforge/boulder.json\` if it exists

3. **Decision logic**:
   - If boulder.json exists AND plan is NOT complete (has unchecked boxes):
     - **APPEND** current session to session_ids
     - Continue work on existing plan
   - If no active plan OR plan is complete:
     - List available plan files
     - If ONE plan: auto-select it
     - If MULTIPLE plans: show list with timestamps, ask user to select

4. **Worktree Setup** (ONLY when \`--worktree\` was explicitly specified):
   1. \`git worktree list --porcelain\` - see available worktrees
   2. Create: \`git worktree add <absolute-path> <branch-or-HEAD>\`
   3. Update boulder.json to add \`"worktree_path": "<absolute-path>"\`

5. **Create/Update boulder.json**:
   \`\`\`json
   {
     "active_plan": "/absolute/path/to/plan.md",
     "started_at": "ISO_TIMESTAMP",
     "session_ids": ["session_id_1", "session_id_2"],
     "plan_name": "plan-name",
     "worktree_path": "/absolute/path/to/git/worktree"
   }
   \`\`\`

6. **Read the plan file** and start executing tasks

## TASK BREAKDOWN (MANDATORY)

After reading the plan file, you MUST decompose every plan task into granular sub-steps and register ALL of them as todo items BEFORE starting any work.

**How to break down**:
- Each plan checkbox item must be split into concrete, actionable sub-tasks
- Sub-tasks should be specific enough that each one touches a clear set of files/functions
- Include: file to modify, what to change, expected behavior, and how to verify
- Do NOT leave any task vague

**Example**:
Plan task: \`- [ ] Add rate limiting to API\`
  1. Create \`src/middleware/rate-limiter.ts\` with sliding window algorithm
  2. Add RateLimiter middleware to \`src/app.ts\` router chain
  3. Add rate limit headers to response
  4. Add test: verify 429 response after exceeding limit

## WORKTREE COMPLETION

When working in a worktree and ALL plan tasks are complete:
1. Commit all remaining changes in the worktree
2. Sync state back to main repo
3. Switch to the main working directory
4. Merge the worktree branch: \`git merge <worktree-branch>\`
5. Clean up: \`git worktree remove <worktree-path>\`
6. Remove the boulder.json state

## CRITICAL

- Always update boulder.json BEFORE starting work
- Read the FULL plan file before delegating any tasks
- Follow delegation protocols for task execution
- Track progress with todos throughout the session`

export const START_WORK_TEMPLATE = `You are starting an ExtendAI Lab work session from a planner-saved plan.

## COMMAND

- /ol-start-work [plan-name] [--worktree <path>]
- The old /start-work spelling is intentionally not advertised. User-facing workflow commands must use the ol- prefix.

## WHAT THE HOOK ALREADY DID

The command hook should have:
1. Located a plan file under .opencode/extendai-lab/plans/ or legacy .opencode/openagent-labforge/plans/ or .sisyphus/plans/.
2. Created or updated .opencode/extendai-lab/boulder.json.
3. Appended the current session ID to boulder state.
4. Injected the selected plan path, progress, and executor context.
5. Selected the executor agent (display name: executor, internal id: atlas) when the host supports backend switching.

If the hook reports no matching plan, do not invent work. Ask the user to ask the planner agent (internal id: prometheus) to create a saved plan first.

## EXECUTION CONTRACT

1. Read the FULL plan file before delegating or editing anything.
2. Create todos for every incomplete top-level plan checkbox before starting work.
3. Execute from the first unchecked top-level checkbox.
4. Use granular todos for substeps, but the plan file checkboxes are the cross-session source of truth.
5. When a top-level plan task is complete, update its checkbox in the plan file from [ ] to [x].
6. Continue until all implementation tasks and final review tasks are complete, unless blocked or user input is required.

## PLAN CHECKBOX FORMAT

Only top-level structured checkboxes count for boulder progress:

- [ ] 1. Implementation task title
- [ ] 2. Implementation task title
- [ ] F1. Plan Compliance Audit
- [ ] F2. Code Quality Review
- [ ] F3. Real Manual QA
- [ ] F4. Scope Fidelity Check

Nested checkboxes are acceptance criteria or evidence items; do not count them as top-level progress.

## MULTIPLE PLANS HANDLING

When multiple incomplete plans are found, use the question tool to ask the user which plan to execute. This prevents agent switching issues.

**CRITICAL: Use question tool, not direct text output.**

Example:
\`\`\`
question(questions=[{
  question: "Multiple incomplete plans found. Which one would you like to execute?",
  header: "Select Plan",
  options: [
    { label: "Plan A", description: "Progress: 3/10 tasks - Modified: 2026-06-06" },
    { label: "Plan B", description: "Progress: 0/5 tasks - Modified: 2026-06-05" },
    { label: "Start new plan", description: "Create a new plan with planner agent" }
  ]
}])
\`\`\`

**Why question tool?**
- User response goes through the tool, not as a new chat message
- This prevents the UI agent from switching back to the original agent
- The work agent maintains control throughout the session

## REVIEW AND COUNCIL

- Run the final review wave before claiming completion.
- Use @oracle or @reviewer for normal code-quality and plan-compliance review.
- Use @council only when multi-model consensus is useful for high-risk architecture, security, data integrity, ambiguous trade-offs, or when the user explicitly asks for multiple independent opinions.
- @council is not the executor and must not be used to perform implementation tasks.

## WORKTREE COMPLETION

When working in a worktree and ALL plan tasks are complete:
1. Commit all remaining changes in the worktree only if the user requested commits.
2. Sync state back to the main repo.
3. Switch to the main working directory.
4. Merge the worktree branch only if the user requested it.
5. Clean up the worktree only when safe.
6. Remove boulder.json only after all plan and review tasks are complete.

## CRITICAL

- Do not stop just because one wave is complete if plan checkboxes remain unchecked.
- Do not mark a plan checkbox [x] until the task is verified.
- Do not claim completion without evidence.
- If the visible UI agent did not switch to executor, tell the user to switch it manually, but continue following this injected execution context.
- When asking user for input (plan selection, decisions, etc.), ALWAYS use the question tool to prevent agent switching.`;

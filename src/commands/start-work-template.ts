export const START_WORK_TEMPLATE = `You are starting an OpenAgent Labforge work session from a Prometheus plan.

## COMMAND

- /ol-start-work [plan-name] [--worktree <path>]
- The old /start-work spelling is intentionally not advertised. User-facing workflow commands must use the ol- prefix.

## WHAT THE HOOK ALREADY DID

The command hook should have:
1. Located a plan file under .opencode/openagent-labforge/plans/ or legacy .sisyphus/plans/.
2. Created or updated .opencode/openagent-labforge/boulder.json.
3. Appended the current session ID to boulder state.
4. Injected the selected plan path, progress, and executor context.
5. Selected Atlas as the execution agent when the host supports backend switching.

If the hook reports no matching plan, do not invent work. Ask the user to ask Prometheus to create a saved plan first.

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
- If the visible UI agent did not switch to Atlas, tell the user to switch it manually, but continue following this injected execution context.`;

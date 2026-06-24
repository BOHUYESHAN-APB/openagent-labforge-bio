export const START_WORK_TEMPLATE = `You are starting an ExtendAI Lab work session from a planner-saved plan.

## COMMAND

- /ol-start-work [plan-name] [--worktree <path>]
- If no plan name given, the hook auto-selects or presents options.

## WHAT THE HOOK ALREADY DID

The command hook should have:
1. Located a plan file under .opencode/extendai-lab/plans/ or legacy paths.
2. Created or updated .opocode/extendai-lab/boulder.json.
3. Appended the current session ID to boulder state.
4. Injected the selected plan path, progress, and executor context.
5. Selected the executor agent (internal id: atlas) when the host supports backend switching.

If the hook reports no matching plan, do not invent work. Ask the user to create a plan first via the planner agent (prometheus).

If the hook reports multiple incomplete plans, use the Question tool to ask which one to execute. Include the plan description so the user knows what each plan is about.

## EXECUTION CONTRACT

1. Read the FULL plan file before delegating or editing anything.
2. Create todos for every incomplete top-level plan checkbox before starting work.
3. Execute from the first unchecked top-level checkbox.
4. When a top-level plan task is complete, update its checkbox in the plan file from [ ] to [x].
5. Continue until all implementation tasks and final review tasks are complete, unless blocked or user input is required.

## PLAN CHECKBOXES

Plans use markdown checkboxes at column zero to track top-level tasks. Examples:
- [ ] 1. Implementation task title
- [x] 2. Completed task
- [ ] F1. Review task

The plan file may also use other formats like \`### Task 1.1\` headings without checkboxes.
If the plan has no checkboxes, add them as you work (one \`- [ ] N.\` per top-level task).

Nested/indented checkboxes (with leading spaces) are sub-tasks — do not count them as top-level progress.

## MULTIPLE PLANS — NO PLAN NAME GIVEN

When \`/ol-start-work\` is called without a plan name and multiple incomplete plans exist:

1. Read the plan descriptions from the hook-injected context
2. Use the Question tool to ask the user which plan to execute
3. Include each plan's name, progress, and description (not just filename)
4. If there are more than 5 plans, guide the user to type the name manually
5. After user selects, run: /ol-start-work <selected-plan-name>

**Why Question tool?** User response goes through the tool, not as a chat message.
This prevents the UI agent from switching back to the original agent.

## REVIEW AND COUNCIL

- Run the final review wave before claiming completion.
- Use @oracle or @reviewer for normal code-quality review.
- Use @council only for high-risk architecture or when multi-model consensus is useful.
- @council is not the executor — do not use it for implementation.

## WORKTREE COMPLETION

When working in a worktree and ALL plan tasks are complete:
1. Commit remaining changes only if the user requested commits.
2. Sync state back to the main repo.
3. Merge the worktree branch only if the user requested it.
4. Clean up the worktree only when safe.
5. Remove boulder.json only after all plan and review tasks are complete.

## CRITICAL

- Do not stop if plan checkboxes remain unchecked.
- Do not mark a checkbox [x] until the task is verified with evidence.
- Do not claim completion without showing test/build/diagnostic output.
- When asking user for input (plan selection, decisions, etc.), ALWAYS use the Question tool to prevent agent switching. If too many options, let the user type the name manually.`;

# Plan Workflow

ExtendAI Lab’s plan workflow uses two plan-mode tools (`plan_enter` / `plan_exit`)
for agent switching, plus `save_plan` for persistence.

## Agent roles

> **v1.3.5+**: Any main orchestrator (engineer, deep-worker, bio-analyst,
> chem-analyst) can call `plan_enter` to switch to prometheus (planner) for
> structured planning. See [Plan Mode System](../AGENTS.md#plan-mode-system-v135)
> for the full overlay mechanism.

| Agent | Role in plan workflow |
|-------|-----------------------|
| `planner` (`prometheus`) | Strategic planner. It asks clarifying questions, researches context, and writes executable plan files. It should not implement. |
| `executor` (`atlas`) | Plan executor. It reads the saved plan, creates todos, delegates work, marks plan checkboxes complete, and runs the final review wave. |
| `engineer` (`orchestrator`) | Main engineering agent. It triages user requests, delegates, and coordinates work outside a saved plan session. |
| `deep-worker` / `fixer` / specialists | Execution workers for bounded tasks delegated by the executor or engineering lead. |
| `requirements-analyst` (`metis`) | Pre-planning gap analysis when requirements are unclear or high risk. |
| `plan-reviewer` (`momus`) | Plan-quality review when high-accuracy plan review is requested. |
| `council` | Multi-model consensus/advisory review. It is not an executor. |

## File locations

New LabForge plans should be saved under the plugin-owned project state folder:

```text
.opencode/extendai-lab/plans/<plan-name>.md
.opencode/extendai-lab/boulder.json
```

Legacy OMO paths may still be read for compatibility:

```text
.sisyphus/plans/<plan-name>.md
.sisyphus/boulder.json
```

New files should use `.opencode/extendai-lab/`, not `.sisyphus/`. Legacy `.opencode/openagent-labforge/` paths remain readable during the compatibility window.

## Planner contract

When the planner agent (internal id `prometheus`) has enough information to
create an execution plan, it must use the model-visible `save_plan` tool. The
tool is the authority for whether a plan was actually written to disk; chat text
alone is not a successful save.

**v1.3.5+ workflow:**
1. Main orchestrator calls `plan_enter` → switches to prometheus (overlay activates)
2. Prometheus works through 5-phase plan: analyze → research → design → write → save
3. Prometheus calls `save_plan`, then `plan_exit` → returns to original orchestrator
4. Original agent reads the saved plan and begins execution

The planner should:

1. Work within the 5-phase planning workflow (analyze requirements → research context → design solution → write structured plan → call save_plan then plan_exit)
2. Call `save_plan` with a descriptive `name` and the full markdown `content`.
   The tool writes the plan file to `.opencode/extendai-lab/plans/` and returns
   the normalized saved path.
3. Use top-level structured checkboxes for executable progress:
   - `- [ ] 1. Implementation task`
   - `- [ ] 2. Implementation task`
   - `- [ ] F1. Plan Compliance Audit`
   - `- [ ] F2. Code Quality Review`
   - `- [ ] F3. Real Manual QA`
   - `- [ ] F4. Scope Fidelity Check`
3. Keep nested checkboxes for acceptance criteria/evidence only.
4. End with the exact handoff copied from the successful `save_plan` result:

```text
Plan saved to: .opencode/extendai-lab/plans/<plan-name>.md
Next command: /ol-start-work <plan-name>
```

The planner should never tell users to run legacy `/start-work`.
The planner should never claim `Plan saved to:` if `save_plan` fails or was not
called.

## Execution contract

`/ol-start-work [plan-name] [--worktree <path>]` is hook-backed. The hook locates
the plan, creates or updates `boulder.json`, appends the current session ID, and
injects execution context for the executor agent (internal id `atlas`).

The executor must then:

1. Read the full plan before delegating or editing.
2. Create todos for every incomplete top-level plan checkbox.
3. Start from the first unchecked top-level task.
4. Use todos for granular substeps, but treat the plan checkboxes as the
   cross-session source of truth.
5. Mark a top-level checkbox `[x]` only after that task is verified.
6. Keep going while unchecked plan tasks remain unless blocked, user input is
   required, or the user explicitly pauses.
7. Run the final review wave before claiming completion.

## Council role

`council` is a consensus and review mechanism, not an implementation worker.

Use it for:

- high-stakes architecture decisions;
- security, data-integrity, or scalability trade-offs;
- ambiguous decisions where model disagreement is useful;
- explicit user requests for multiple independent opinions.

Do not use `council` to perform implementation tasks. The executor should delegate
implementation to `fixer`, `deep-worker`, `designer`, `bio-analyst` (internal
id `bio-orchestrator`), or
other specialists, then use `oracle`, `reviewer`, or `council` for review when
appropriate.

## Resume behavior

`boulder.json` tracks the active plan, sessions, executor, and optional worktree.
The plan file remains the durable progress record. If a session stops, run
`/ol-start-work <plan-name>` again; the executor should resume from the first unchecked
top-level checkbox.

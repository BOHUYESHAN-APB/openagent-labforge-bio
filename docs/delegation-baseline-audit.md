# Delegation Baseline Audit

> **v1.3.5 更新**: `subagentPolicy` system has been removed. Agent registration
> now uses only `disabled_agents`. This audit's recommendations around demoting
> subagentPolicy (Baseline Conclusion #3, File-Level Inventory items) are now
> **resolved upstream** — the policy system itself is deleted, not just demoted.

## Scope

This document is the Phase 0 baseline audit for the delegation/planner refactor program in `.opencode/extendai-lab/plans/rebuild-delegation-lanes-and-planner-overlay.md`.

Classification terms used below:

- `active` — wired into current runtime behavior.
- `half-migrated` — partially wired or behavior/prompt mismatch exists.
- `residual` — leftover compatibility/remnant code that should not remain a core path.
- `target-core` — the subsystem should remain or become a canonical foundation in the new architecture.

## Runtime Capability Matrix

| Capability | Current status | Evidence | Notes |
|---|---|---|---|
| Native `task` blocking child session | `active`, `target-core` | `src/hooks/task-session-manager/index.ts` | The plugin already tracks `task` IDs, aliases, and resumable child sessions. |
| Native `task(background=true)` background child session | `half-migrated`, `target-core` | `src/agents/orchestrator.ts`, `src/hooks/task-session-manager/index.ts` | Prompt/documentation assumes background support, but the plugin does not yet provide a first-class tracking/cancel/reconcile surface around it. |
| Plugin `subtask` blocking worker | `active`, auxiliary | `src/tools/subtask/tools.ts` | Works as a simple child-session worker for bounded tasks. |
| Plugin `subtask` background worker | `active`, auxiliary | `src/tools/subtask/tools.ts` | Background mode now keeps the child session alive, but `subtask` still remains an auxiliary path rather than the primary native background lane. |
| Background task manager infrastructure | `active`, `target-core` | `src/features/background-agent/manager.ts`, `src/shared/prompt-async-gate.ts` | Strong lifecycle/gating infrastructure exists, but it is not yet the canonical public specialist-lane entrypoint. |
| Team mode runtime | `active`, separate system | `src/features/team-mode/team-runtime/create.ts`, `src/features/team-mode/tools/lifecycle.ts` | Long-lived member sessions, mailbox semantics, and dedicated lifecycle tools already exist. |
| Effective-agent switch via hook | `active`, `target-core` | `src/hooks/start-work/index.ts` | `/ol-start-work` already injects executor context and mutates the runtime message agent to `atlas`. |
| Mode-driven agent switching | `half-migrated` | `src/hooks/mode-detector/index.ts` | Current implementation only injects prompts such as `[search-mode]`; it does not switch effective execution agents. |
| Todo/review automation | `active` | `src/hooks/todo-continuation/index.ts` | Auto-continue/auto-review are real, but still assume a mostly flat current-agent flow. |
| `delegate-task` public tool path | `residual` | `src/tools/index.ts` plus repository references | The public tool is not exported; only references/remnants remain in the codebase. |

## File-Level Inventory

| File | Current classification | Why it matters now | Target role |
|---|---|---|---|
| `src/index.ts` | `active` | Central composition root; registers `subtask`, team tools, hooks, commands, and `subagentPolicy` compatibility behavior. | Keep as the main runtime wiring point. |
| `src/agents/index.ts` | `active` | `subagentPolicy` still filters custom subagent registration and affects the live agent set. | Demote policy influence and restore full specialist availability. |
| `src/agents/orchestrator.ts` | `active`, `half-migrated` | Prompt hardcodes `ultra-minimal` / `minimal` policy logic and describes blocking/background modes ahead of actual unified runtime routing. | Keep as the canonical routing policy prompt, but shift to lane semantics instead of agent-count semantics. |
| `src/config/schema.ts` | `active` | `subagentPolicy` and `team_mode` remain persisted configuration surface. | Preserve as compatibility surface while reducing workflow centrality of `subagentPolicy`. |
| `src/tools/index.ts` | `active` | Confirms actual public tool surface: `subtask` exists; `delegate-task` does not. | Add/keep only canonical delegation tools. |
| `src/tools/subtask/tools.ts` | `active`, `half-migrated` | Only plugin-provided child-worker tool today; background branch is not safe. | Reduce to auxiliary worker role or rename/restrict after native-first background lane is rebuilt. |
| `src/hooks/task-session-manager/index.ts` | `active`, `target-core` | Already solves native `task` aliasing, resume, and prompt enrichment. | Use as a core building block for blocking/background child-session lanes. |
| `src/features/background-agent/manager.ts` | `active`, `target-core` | Contains robust task lifecycle, queueing, wake, retry, and notification machinery. | Re-anchor as the background specialist lane manager. |
| `src/shared/prompt-async-gate.ts` | `active`, `target-core` | Prevents prompt collisions and serializes internal prompt delivery. | Keep as the gating primitive for background wakeups and team live delivery. |
| `src/features/team-mode/team-runtime/create.ts` | `active`, `target-core` | Launches long-lived member sessions and keeps them idle for later wakeups. | Preserve as the basis of team mode rather than folding into normal delegation. |
| `src/features/team-mode/tools/lifecycle.ts` | `active` | Team lifecycle tools call direct team runtime APIs; not dependent on public `task`. | Keep distinct from ordinary subagent lanes. |
| `src/hooks/start-work/index.ts` | `active`, `target-core` | Best existing example of hook-driven effective-agent overlay (`atlas`). | Generalize into planner/executor/review overlays. |
| `src/hooks/mode-detector/index.ts` | `active`, `half-migrated` | Detects search/analyze/bio/chem/heavy intent but only injects extra prompt text. | Evolve from prompt hints into overlay/lane-routing hints. |
| `src/hooks/todo-continuation/index.ts` | `active` | Owns auto-continue and auto-review state transitions. | Make phase-aware once plan/execute/review overlays are formalized. |

## Active vs Non-Core Findings

### Active and should be preserved

- Native `task` session tracking in `src/hooks/task-session-manager/index.ts`.
- Background gating primitives in `src/shared/prompt-async-gate.ts`.
- Background task lifecycle infrastructure in `src/features/background-agent/manager.ts`.
- Team-mode runtime and lifecycle tools under `src/features/team-mode/`.
- `/ol-start-work` hook-driven executor handoff in `src/hooks/start-work/index.ts`.

### Active but architecturally mispositioned

- `subagentPolicy` currently influences both agent registration and orchestrator behavior, which makes “few agents” a workflow constraint instead of a compatibility option.
- `mode-detector` currently implies different working modes only through prompt injection; it does not provide actual runtime lane or overlay switching.
- `todo-continuation` is effective for one-agent loops but not yet aware of planning/execution/review phases.

### Half-migrated paths

- `subtask(background=true)` no longer aborts the child session immediately, but it still should not be treated as the primary background orchestration substrate.
- Orchestrator prompt text already discusses blocking/background/batch native `task` modes, but the surrounding runtime UX has not been fully rebuilt around those lanes yet.

### Residual paths

- `delegate-task` is not part of the exported public tool surface in `src/tools/index.ts` and should not remain a hidden dependency.

## Baseline Conclusions

1. The repository already has three real foundations worth preserving: native `task` tracking, background gating/lifecycle infrastructure, and team mode.
2. The current architectural problem is not lack of machinery; it is mismatch between prompt policy, public tool surface, and runtime lane ownership.
3. `subagentPolicy` should no longer define the primary orchestration story.
4. `subtask` should not be treated as the main future delegation substrate while its background semantics remain unsafe.
5. `/ol-start-work` is the strongest existing seed for effective-agent overlays and should be generalized rather than replaced.

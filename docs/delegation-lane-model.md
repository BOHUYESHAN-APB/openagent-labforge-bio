# Canonical Delegation Lane Model

> **v1.3.5 更新**: `subagentPolicy` 已移除（系统已删除）。Agent 注册仅使用
> `disabled_agents`。Plan mode 新增 `plan_enter`/`plan_exit` 工具实现代理切换（见
> Planner/Executor/Review overlay 模型）。

## Purpose

This document is the Phase 1 canonical model for delegation and effective-agent overlays.

## Invariants

1. The user-selected visible agent in the UI remains unchanged unless the user changes it.
2. Runtime hooks may switch the effective execution agent for a bounded phase.
3. Every effective-agent switch must be disclosed in session-visible content.
4. Blocking/background routing is chosen by dependency semantics, not by a “few subagents” philosophy.
5. Team mode remains a separate long-lived coordination system, not a synonym for ordinary delegation.
6. Native OpenCode `task` is the preferred child-session substrate when the required runtime capability exists.
7. Cache stability is a system goal, but it is achieved by reducing main-session noise and using the right lane, not by artificially suppressing delegation.
8. An overlay is not complete if it only renames the agent; the phase-specific system-prompt stack must also be isolated.

## The Four Runtime Lanes

### 1. Direct main work

Use the current main agent directly when the work is straightforward, tightly scoped, or does not benefit from independent specialist judgment.

Typical examples:

- known-file edits
- targeted debugging once the cause is already clear
- localized refactors
- lightweight validation or documentation updates

### 2. Blocking subagent lane

Use a child session when the next parent decision depends on the result.

Blocking lane examples:

- `explorer` finding code locations before the parent can patch
- `librarian` checking current external API behavior before implementation
- `oracle` reviewing an architectural decision before a risky change

Routing rule: if the parent cannot safely choose the next step without the answer, the child belongs in the blocking lane.

### 3. Background subagent lane

Use a child session when the work is independent and the parent can continue productively without the result.

Background lane examples:

- broad repo investigations that may inform later cleanup
- long-running code searches or validation sweeps
- external documentation gathering while the parent patches local code
- implementation or review work that can be reconciled asynchronously

Routing rule: if the work is useful but not immediately dependency-gating, it belongs in the background lane.

### 4. Team agent lane

Use team mode for long-lived multi-member coordination with mailbox/task semantics.

Team lane characteristics:

- explicit team runtime state
- dedicated lifecycle tools
- long-lived idle member sessions that wake on messages
- collaboration-oriented messaging and task ownership semantics

Routing rule: if the problem needs a persistent multi-member collaboration structure instead of one-shot specialist sessions, use team mode.

## Blocking vs Background Decision Test

Ask one question first:

> Does the parent need this result before it can safely choose the next action?

- If `yes`, use the blocking subagent lane.
- If `no`, use the background subagent lane.

This rule overrides legacy heuristics such as “spawn fewer agents” or “always keep work in the main agent.”

## Overlay Model for Plan / Execute / Review

The visible UI agent stays the same, but runtime hooks may switch the effective execution agent for a bounded phase.

### Planner overlay

- Phase: `plan`
- Effective agent: `prometheus`
- Responsibility: convert user intent into a structured saved plan

### Executor overlay

- Phase: `execute`
- Effective agent: `atlas`
- Responsibility: execute the saved plan, maintain plan/todo state, and drive verification

### Review overlay

- Phase: `review`
- Effective agent: `reviewer`
- Responsibility: final quality gate before the work batch stops
- Constraint: review turns must not inherit the ordinary orchestrator prompt stack, mode prompts, or unrelated system overlays.

## Overlay Visibility Requirements

Every overlay transition must disclose:

- current phase
- effective execution agent
- the trigger that caused the switch
- when control returns to the original main agent context

The disclosure must happen in session-visible content; relying only on hidden runtime state is not acceptable.

For review specifically, visible disclosure alone is insufficient. The review turn also needs prompt isolation so reviewer behavior does not get diluted by the main orchestration prompt.

## Agent-Family Behavior

### `orchestrator`

- May work directly.
- May launch blocking/background specialists.
- May trigger planner/executor/review overlays.

### `bio-orchestrator`

- Same lane model as `orchestrator`.
- Domain-specific skills and prompts should influence tools and methods, not replace the lane model.

### `chem-orchestrator`

- Same lane model as `orchestrator`.
- Domain-specific rigor changes method choice, not delegation semantics.

## Implications for Existing Systems

1. `subagentPolicy` becomes compatibility/configuration, not the core mental model.
2. `task-session-manager` becomes the canonical tracking layer for normal child sessions.
3. `background-agent` plus `prompt-async-gate` become the canonical background control plane.
4. Team mode remains separate and must not depend on hidden `delegate-task` behavior.
5. `/ol-start-work` becomes the seed pattern for generalized effective-agent overlays.

## Phase 1 Output

With this model, later implementation phases can make precise decisions:

- Phase 2 demotes `subagentPolicy`.
- Phase 3 rebuilds the background lane around native-first child sessions.
- Phase 4 formalizes blocking specialist routing.
- Phase 5 hardens team mode as its own runtime family.
- Phases 6–8 connect overlays, todo state, and checkpoint recovery.

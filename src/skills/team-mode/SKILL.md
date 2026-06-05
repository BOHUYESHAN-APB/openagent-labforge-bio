---
name: team-mode
description: Team Mode - parallel multi-agent coordination for complex tasks
category: coordination
exposure: standard
---

# Team Mode

Team Mode enables parallel multi-agent coordination. OFF by default. Enable via `team_mode.enabled` in config.

## When to use

- Split a large job across several agents
- Keep a lead agent focused while member agents work in parallel
- Use worktree mode for isolated code changes

## Eligible agents

**Primary agents (can be team members):**
- `orchestrator` - Main coordinator, plans + delegates
- `atlas` - Plan executor, todo management
- `bio-orchestrator` - Biological science specialist

**Conditional:**
- `deep-worker` - Deep code modification (requires high-context model)

**Hard-reject (read-only, use delegate-task instead):**
- `prometheus` - Plan-mode-only
- All subagents: `explorer`, `librarian`, `oracle`, `designer`, `fixer`, `observer`, `council`, `councillor`, `metis`, `momus`, `multimodal-looker`, `reviewer`

## Member kinds

- `kind: "subagent_type"` - Direct agent (orchestrator, atlas, bio-orchestrator)
- `kind: "category"` - Routed through category system with specified model

## Lifecycle

1. **Create team**: `team_create({ teamName: "my-team" })` or `team_create({ inline_spec: {...} })`
2. **Assign work**: `team_send_message` or `team_task_create`
3. **Track progress**: `team_task_list`, `team_status`
4. **Shutdown**: `team_shutdown_request` → `team_approve_shutdown` / `team_reject_shutdown`
5. **Delete team**: `team_delete` when done

## Tools

| Tool | Purpose |
|------|---------|
| `team_create` | Create a new team |
| `team_delete` | Delete a team |
| `team_send_message` | Send message to member |
| `team_task_create` | Create task |
| `team_task_list` | List tasks |
| `team_task_update` | Update task status |
| `team_task_get` | Get task details |
| `team_status` | Get team status |
| `team_list` | List all teams |
| `team_shutdown_request` | Request member shutdown |
| `team_approve_shutdown` | Approve shutdown |
| `team_reject_shutdown` | Reject shutdown |

## Communication rules

- Use `team_send_message` to communicate (not plain text)
- Use `to: "lead"` for lead, `to: "<name>"` for specific member
- Members cannot call `delegate-task` (budget is zero)
- No nested teams (members cannot call `team_create`)

## Bounds

- Max 8 members
- Max 4 parallel workers
- Max 32KB per message
- Max 256KB unread inbox

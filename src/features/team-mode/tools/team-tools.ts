// Team Mode OpenCode tools — factory pattern with dependency injection
import { type ToolDefinition, tool } from '@opencode-ai/plugin'
import type { PluginInput } from '@opencode-ai/plugin'
import type { TeamModeConfig } from '../../../config/schema/team-mode'
import { teamCreate, teamDelete } from './lifecycle'
import { teamSendMessage } from './messaging'
import { createTask, listTasks, updateTaskStatus, getTask } from '../team-tasklist/index'
import { loadRuntimeState, listActiveTeams } from '../team-state-store/index'
import { loadTeamSpec } from '../team-registry/loader'
import { requestShutdown, approveShutdown, rejectShutdown } from '../team-runtime/shutdown'

const z = tool.schema

type TeamToolsContext = {
  config: TeamModeConfig
  ctx: PluginInput
}

export function createTeamCreateTool(ctx: TeamToolsContext): ToolDefinition {
  return tool({
    description: `Create a new team with the given specification.

Use this tool to spawn a coordinated agent team with shared mailbox, task list, and optional tmux layout.

Example:
team_create({
  teamName: "my-team",
  inline_spec: {
    name: "my-team",
    members: [
      { name: "worker", kind: "category", category: "quick", prompt: "Do the assigned work." }
    ]
  }
})`,
    args: {
      teamName: z.string().min(1).optional().describe('Name of an existing team to activate'),
      inline_spec: z.unknown().optional().describe('Inline TeamSpec to create a new team'),
    },
    async execute(args, toolContext) {
      try {
        const teamName = args.teamName as string | undefined
        let inlineSpec: Record<string, unknown> | undefined

        // Handle inline_spec: could be JSON string or object
        const raw = args.inline_spec
        if (typeof raw === 'string') {
          try { inlineSpec = JSON.parse(raw) } catch { return 'Error: inline_spec is a string but not valid JSON.' }
        } else if (raw && typeof raw === 'object') {
          inlineSpec = raw as Record<string, unknown>
        }

        if (!teamName && !inlineSpec) {
          return 'Error: Provide exactly one of teamName or inline_spec.'
        }

        if (teamName && inlineSpec) {
          return 'Error: Provide exactly one of teamName or inline_spec, not both.'
        }

        const name = teamName ?? (inlineSpec?.name as string)
        const spec = inlineSpec ?? (await loadTeamSpec(teamName!))

        if (!spec) {
          return `Error: Team "${teamName}" not found.`
        }

        // Get session ID from tool context
        const runtimeContext = toolContext as unknown as { sessionID?: string }
        const leadSessionId = runtimeContext?.sessionID

        const result = await teamCreate(name, spec, ctx.config, ctx.ctx.client, leadSessionId)
        return `Team "${result.teamName}" created successfully with ${result.spec.members.length} members. Runtime: ${result.runtimeState.teamRunId}`
      } catch (error) {
        return `Error creating team: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamDeleteTool(ctx: TeamToolsContext): ToolDefinition {
  return tool({
    description: `Delete a team and clean up all its resources.

This will remove the team's state, mailbox, tasklist, and worktrees.`,
    args: {
      teamName: z.string().min(1).describe('Name of the team to delete'),
    },
    async execute(args) {
      try {
        await teamDelete(args.teamName, ctx.config, ctx.ctx.client)
        return `Team "${args.teamName}" deleted successfully.`
      } catch (error) {
        return `Error deleting team: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamSendTool(ctx: TeamToolsContext): ToolDefinition {
  return tool({
    description: `Send a message to a team member or broadcast to all members.

Use to: "lead" for the lead, "<name>" for a specific teammate, "*" for team-wide broadcasts.`,
    args: {
      teamName: z.string().min(1).describe('Name of the team'),
      to: z.string().min(1).describe('Recipient name or "*" for broadcast'),
      body: z.string().min(1).describe('Message body'),
      kind: z.enum(['message', 'announcement']).optional().describe('Message kind'),
    },
    async execute(args) {
      try {
        // Load runtime state to get teamRunId and sender info
        const runtimeState = await loadRuntimeState(args.teamName)
        if (!runtimeState) {
          return `Error: Team "${args.teamName}" is not active.`
        }

        // Get sender name from context (lead or first member)
        const senderMember = runtimeState.members.find(m => m.agentType === 'leader')
        const senderName = senderMember?.name ?? 'lead'

        // Send message with live delivery
        const result = await teamSendMessage(
          args.teamName,
          runtimeState.teamRunId,
          args.to,
          senderName,
          args.body,
          ctx.ctx.client,
          args.kind ?? 'message',
        )

        const deliveryStatus = result.delivered
          ? 'delivered live'
          : 'stored in inbox (recipient will receive when idle)'

        return `Message sent to ${args.to} (ID: ${result.message.messageId}). Status: ${deliveryStatus}`
      } catch (error) {
        return `Error sending message: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamTaskCreateTool(ctx: TeamToolsContext): ToolDefinition {
  return tool({
    description: `Create a new task in the team's shared task list.`,
    args: {
      teamName: z.string().min(1).describe('Name of the team'),
      subject: z.string().min(1).describe('Task subject'),
      description: z.string().min(1).describe('Task description'),
      owner: z.string().optional().describe('Assignee name'),
    },
    async execute(args) {
      try {
        const task = await createTask(
          args.teamName,
          args.subject,
          args.description,
        )
        return `Task created: ${task.id} - ${task.subject}`
      } catch (error) {
        return `Error creating task: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamTaskListTool(ctx: TeamToolsContext): ToolDefinition {
  return tool({
    description: `List tasks in the team's shared task list.

Optionally filter by status or owner.`,
    args: {
      teamName: z.string().min(1).describe('Name of the team'),
      status: z.enum(['pending', 'claimed', 'in_progress', 'completed', 'deleted']).optional().describe('Filter by status'),
      owner: z.string().optional().describe('Filter by owner'),
    },
    async execute(args) {
      try {
        let tasks = await listTasks(args.teamName)
        if (args.status) {
          tasks = tasks.filter(t => t.status === args.status)
        }
        if (args.owner) {
          tasks = tasks.filter(t => t.owner === args.owner)
        }
        if (tasks.length === 0) {
          return 'No tasks found.'
        }
        return tasks.map(t => `[${t.id}] ${t.subject} (${t.status})`).join('\n')
      } catch (error) {
        return `Error listing tasks: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamTaskUpdateTool(ctx: TeamToolsContext): ToolDefinition {
  return tool({
    description: `Update a task's status, owner, or other fields.

Use to claim, complete, or reassign tasks.`,
    args: {
      teamName: z.string().min(1).describe('Name of the team'),
      taskId: z.string().min(1).describe('Task ID'),
      status: z.enum(['pending', 'claimed', 'in_progress', 'completed', 'deleted']).optional().describe('New status'),
      owner: z.string().optional().describe('New owner'),
    },
    async execute(args) {
      try {
        const task = await updateTaskStatus(args.teamName, args.taskId, args.status ?? 'pending', args.owner)
        if (!task) {
          return `Task ${args.taskId} not found.`
        }
        return `Task ${task.id} updated: ${task.status}`
      } catch (error) {
        return `Error updating task: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamTaskGetTool(ctx: TeamToolsContext): ToolDefinition {
  return tool({
    description: `Get details of a specific task.`,
    args: {
      teamName: z.string().min(1).describe('Name of the team'),
      taskId: z.string().min(1).describe('Task ID'),
    },
    async execute(args) {
      try {
        const task = await getTask(args.teamName, args.taskId)
        if (!task) {
          return `Task ${args.taskId} not found.`
        }
        return JSON.stringify(task, null, 2)
      } catch (error) {
        return `Error getting task: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamStatusTool(ctx: TeamToolsContext): ToolDefinition {
  return tool({
    description: `Get the full status of a team run, including members, tasks, and mailbox.`,
    args: {
      teamName: z.string().min(1).describe('Name of the team'),
    },
    async execute(args) {
      try {
        const state = await loadRuntimeState(args.teamName)
        if (!state) {
          const spec = await loadTeamSpec(args.teamName)
          if (!spec) return `Team "${args.teamName}" not found.`
          return `Team "${args.teamName}" config found but no active runtime state.`
        }
        return JSON.stringify(state, null, 2)
      } catch (error) {
        return `Error getting team status: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamListTool(ctx: TeamToolsContext): ToolDefinition {
  return tool({
    description: `List all declared and active teams.`,
    args: {},
    async execute() {
      try {
        const teams = await listActiveTeams()
        if (teams.length === 0) {
          return 'No active teams.'
        }
        return teams.map(t => `- ${t.teamName} (${t.teamRunId})`).join('\n')
      } catch (error) {
        return `Error listing teams: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamShutdownRequestTool(ctx: TeamToolsContext): ToolDefinition {
  return tool({
    description: `Request shutdown for a team member.`,
    args: {
      teamName: z.string().min(1).describe('Name of the team'),
      targetMemberName: z.string().min(1).describe('Name of the member to shut down'),
    },
    async execute(args, toolContext) {
      try {
        const state = await loadRuntimeState(args.teamName)
        if (!state) return `Team "${args.teamName}" is not active.`

        const leadMember = state.members.find(m => m.agentType === 'leader')
        const requesterName = leadMember?.name ?? 'lead'

        await requestShutdown(args.teamName, args.targetMemberName, requesterName)
        return `Shutdown requested for member "${args.targetMemberName}" in team "${args.teamName}".`
      } catch (error) {
        return `Error requesting shutdown: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamApproveShutdownTool(ctx: TeamToolsContext): ToolDefinition {
  return tool({
    description: `Approve a pending shutdown request.`,
    args: {
      teamName: z.string().min(1).describe('Name of the team'),
      memberName: z.string().min(1).describe('Name of the member whose shutdown to approve'),
    },
    async execute(args, toolContext) {
      try {
        const state = await loadRuntimeState(args.teamName)
        if (!state) return `Team "${args.teamName}" is not active.`

        await approveShutdown(args.teamName, args.memberName)
        return `Shutdown approved for member "${args.memberName}" in team "${args.teamName}".`
      } catch (error) {
        return `Error approving shutdown: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamRejectShutdownTool(ctx: TeamToolsContext): ToolDefinition {
  return tool({
    description: `Reject a pending shutdown request.`,
    args: {
      teamName: z.string().min(1).describe('Name of the team'),
      memberName: z.string().min(1).describe('Name of the member whose shutdown to reject'),
      reason: z.string().min(1).describe('Reason for rejection'),
    },
    async execute(args, toolContext) {
      try {
        const state = await loadRuntimeState(args.teamName)
        if (!state) return `Team "${args.teamName}" is not active.`

        await rejectShutdown(args.teamName, args.memberName, args.reason)
        return `Shutdown rejected for member "${args.memberName}" in team "${args.teamName}". Reason: ${args.reason}`
      } catch (error) {
        return `Error rejecting shutdown: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

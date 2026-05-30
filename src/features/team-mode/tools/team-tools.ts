// Team Mode OpenCode tools
import { type ToolDefinition, tool } from '@opencode-ai/plugin'
import { teamCreate, teamDelete } from './lifecycle'
import { sendMessage } from '../team-mailbox/send'
import { listUnreadMessages } from '../team-mailbox/inbox'
import { createTask, listTasks, updateTaskStatus, getTask } from '../team-tasklist/index'
import { loadRuntimeState, listActiveTeams } from '../team-state-store/store'
import { loadTeamSpec } from '../team-registry/loader'

const z = tool.schema

export function createTeamCreateTool(): ToolDefinition {
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
    async execute(args) {
      try {
        const teamName = args.teamName as string | undefined
        const inlineSpec = args.inline_spec as Record<string, unknown> | undefined

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

        const result = await teamCreate(name, spec)
        return `Team "${result.teamName}" created successfully with ${result.spec.members.length} members.`
      } catch (error) {
        return `Error creating team: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamDeleteTool(): ToolDefinition {
  return tool({
    description: `Delete a team and clean up all its resources.

This will remove the team's state, mailbox, tasklist, and worktrees.`,
    args: {
      teamName: z.string().min(1).describe('Name of the team to delete'),
    },
    async execute(args) {
      try {
        await teamDelete(args.teamName)
        return `Team "${args.teamName}" deleted successfully.`
      } catch (error) {
        return `Error deleting team: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamSendTool(): ToolDefinition {
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
        const message = await sendMessage(
          args.teamName,
          args.to,
          'user',
          args.body,
          args.kind ?? 'message',
        )
        return `Message sent to ${args.to} (ID: ${message.messageId})`
      } catch (error) {
        return `Error sending message: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamTaskCreateTool(): ToolDefinition {
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

export function createTeamTaskListTool(): ToolDefinition {
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

export function createTeamTaskUpdateTool(): ToolDefinition {
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

export function createTeamTaskGetTool(): ToolDefinition {
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

export function createTeamStatusTool(): ToolDefinition {
  return tool({
    description: `Get the full status of a team run, including members, tasks, and mailbox.`,
    args: {
      teamName: z.string().min(1).describe('Name of the team'),
    },
    async execute(args) {
      try {
        const spec = await loadTeamSpec(args.teamName)
        if (!spec) {
          return `Team "${args.teamName}" not found.`
        }

        const teams = await listActiveTeams({ enabled: true } as any)
        const activeTeam = teams.find(t => t.teamName === args.teamName)

        if (!activeTeam) {
          return `Team "${args.teamName}" is not active.`
        }

        const state = await loadRuntimeState(activeTeam.teamRunId, { enabled: true } as any)
        return JSON.stringify(state, null, 2)
      } catch (error) {
        return `Error getting team status: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export function createTeamListTool(): ToolDefinition {
  return tool({
    description: `List all declared and active teams.`,
    args: {},
    async execute() {
      try {
        const teams = await listActiveTeams({ enabled: true } as any)
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

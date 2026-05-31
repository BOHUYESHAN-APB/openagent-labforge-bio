// Team runtime create — synchronous: creates member sessions, waits for all to complete
import { randomUUID } from "node:crypto"
import type { PluginInput } from "@opencode-ai/plugin"
import type { TeamSpec, RuntimeState, Member } from "../types"
import { saveRuntimeState, loadRuntimeState } from "../team-state-store/index"
import { registerTeamSession } from "../team-session-registry"
import {
  promptWithTimeout,
} from "../../../utils/session"

export interface CreateTeamRunOptions {
  leadSessionId?: string
  parentMessageID?: string
}

const MEMBER_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes per member

function buildMemberPrompt(
  spec: TeamSpec,
  member: Member,
  teamRunId: string,
): string {
  return [
    `## Team Assignment`,
    `You are "${member.name}" in team "${spec.name}".`,
    `TeamRunId: ${teamRunId}`,
    ``,
    member.prompt || `Research and report your findings.`,
    ``,
    `## Instructions`,
    `1. Complete ONLY the task described above.`,
    `2. Report your results when done using team_send_message to "lead".`,
    `3. Stop when your task is complete.`,
  ].join("\n")
}

export async function createTeamRun(
  teamName: string,
  spec: TeamSpec,
  specSource: "project" | "user" = "user",
  client?: PluginInput["client"],
  options?: CreateTeamRunOptions,
): Promise<RuntimeState> {
  const teamRunId = randomUUID()
  const leadSessionId = options?.leadSessionId

  const state: RuntimeState = {
    version: 1,
    teamRunId,
    teamName,
    specSource,
    createdAt: Date.now(),
    status: "creating",
    leadSessionId,
    members: spec.members.map(member => ({
      name: member.name,
      agentType: member.name === spec.leadAgentId ? "leader" : "general-purpose",
      subagent_type: member.kind === "subagent_type" ? member.subagent_type : undefined,
      category: member.kind === "category" ? member.category : undefined,
      status: "pending" as const,
      color: member.color,
      pendingInjectedMessageIds: [],
    })),
    shutdownRequests: [],
    bounds: { maxMembers: 8, maxParallelMembers: 4, maxMessagesPerRun: 10000, maxWallClockMinutes: 120, maxMemberTurns: 500 },
  }

  await saveRuntimeState(teamName, state)

  if (client) {
    // Synchronous: launch all members and wait for results
    await launchAndWait(state, spec, client, teamName, leadSessionId)
    await saveRuntimeState(teamName, state)
  }

  return state
}

async function launchAndWait(
  state: RuntimeState,
  spec: TeamSpec,
  client: PluginInput["client"],
  teamName: string,
  leadSessionId?: string,
): Promise<void> {
  const directory = process.cwd()

  // Get lead session's model to inherit via prompt body
  let leadModel: { providerID: string; modelID: string } | undefined;
  if (leadSessionId) {
    try {
      const sessionData = await client.session.get({
        path: { id: leadSessionId },
        query: { directory },
      });
      const session = (sessionData as { data?: { model?: { providerID: string; id: string } } })?.data;
      if (session?.model) {
        leadModel = {
          providerID: session.model.providerID,
          modelID: session.model.id,
        };
      }
    } catch {
      // ignore - will use default
    }
  }

  const promises = spec.members.map(async (member, index) => {
    const prompt = buildMemberPrompt(spec, member, state.teamRunId)
    let sessionId: string | undefined

    try {
      // Create session (no model - passed via prompt body)
      const createResult = await client.session.create({
        body: {
          parentID: leadSessionId || undefined,
        } as Record<string, unknown>,
        query: { directory },
      })

      if (createResult.error) throw new Error(`Session create failed: ${createResult.error}`)
      sessionId = createResult.data.id

      registerTeamSession(sessionId, {
        teamRunId: state.teamRunId,
        teamName,
        memberName: member.name,
        role: "member",
      })

      state.members[index].sessionId = sessionId
      state.members[index].status = "running"
      await saveRuntimeState(teamName, state)

      // Send prompt with inherited model
      await promptWithTimeout(
        client,
        {
          responseStyle: "data",
          throwOnError: true,
          query: { directory },
          path: { id: sessionId },
          body: {
            agent: member.kind === "subagent_type" ? member.subagent_type : undefined,
            parts: [{ type: "text", text: prompt }],
            ...(leadModel ? { model: leadModel } : {}),
          },
        },
        MEMBER_TIMEOUT_MS,
      )

      // Extract result and cleanup
      try {
        await client.session.abort({ path: { id: sessionId }, query: { directory } })
      } catch {
        // ignore cleanup errors
      }
    } catch (error) {
      state.members[index].status = "errored"
      if (sessionId) {
        try { await client.session.abort({ path: { id: sessionId }, query: { directory } }) } catch {}
      }
    }
  })

  await Promise.all(promises)
  state.status = "active"
}

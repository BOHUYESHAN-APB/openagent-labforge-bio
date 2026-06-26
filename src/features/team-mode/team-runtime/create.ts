// Team runtime create — creates member sessions with proper lifecycle
// Sessions stay alive after initial prompt, waiting for messages via live delivery
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { PluginInput } from '@opencode-ai/plugin';
import { log } from '../../../shared/logger';
import { getInboxDir, resolveBaseDir } from '../team-registry/paths';
import { registerTeamSession } from '../team-session-registry';
import { loadRuntimeState, saveRuntimeState } from '../team-state-store/index';
import type { Member, RuntimeState, TeamSpec } from '../types';

export interface CreateTeamRunOptions {
  leadSessionId?: string;
  parentMessageID?: string;
}

// Timeout for initial prompt (5 minutes)
const INITIAL_PROMPT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Build the initial prompt for a team member.
 * Includes team context, task, and communication guidance.
 */
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
    `## Communication Protocol`,
    `You are a team member. The lead coordinates work through the task system and messaging.`,
    ``,
    `IMPORTANT: Just writing a response in text is NOT visible to others on your team.`,
    `You MUST use the \`team_send_message\` tool to communicate.`,
    ``,
    `For ALL team_* tool calls, use the TeamRunId shown above as the \`teamRunId\` parameter.`,
    ``,
    `## Tools you should use`,
    `- \`team_send_message\` — Send results, blockers, completion updates. Use \`to: "lead"\` for the lead.`,
    `- \`team_task_update\` — Update your task status (claimed → in_progress → completed).`,
    `- \`team_task_list\` — Check for newly unblocked work after completing each task.`,
    ``,
    `## Lead-only tools you must NOT call`,
    `\`team_shutdown_request\`, \`team_delete\`, \`team_approve_shutdown\`, \`team_reject_shutdown\``,
    ``,
    `## Idle is normal`,
    `Going idle after sending a message is the expected flow.`,
    `Idle teammates can still receive messages; the next message wakes you up.`,
    ``,
    `## Wrap-up`,
    `When you finish your assigned work:`,
    `1. Send your results to the lead via \`team_send_message\`.`,
    `2. Mark your task as completed via \`team_task_update\`.`,
    `3. Send a completion message to the lead.`,
    `4. Then go idle — do NOT try to shut yourself down.`,
  ].join('\n');
}

/**
 * Get the lead session's model to inherit for team members.
 */
async function getLeadModel(
  client: PluginInput['client'],
  leadSessionId: string,
  directory: string,
): Promise<{ providerID: string; modelID: string } | undefined> {
  try {
    const sessionData = await client.session.get({
      path: { id: leadSessionId },
      query: { directory },
    });
    const session = (
      sessionData as { data?: { model?: { providerID: string; id: string } } }
    )?.data;
    if (session?.model) {
      return {
        providerID: session.model.providerID,
        modelID: session.model.id,
      };
    }
  } catch {
    // ignore - will use default
  }
  return undefined;
}

/**
 * Create mailbox inbox directories for all team members.
 */
async function createMailboxDirs(
  teamRunId: string,
  memberNames: string[],
): Promise<void> {
  const baseDir = resolveBaseDir();
  for (const memberName of memberNames) {
    const inboxDir = getInboxDir(baseDir, teamRunId, memberName);
    await mkdir(inboxDir, { recursive: true });
  }
}

/**
 * Create a team run with proper session lifecycle.
 * Sessions stay alive after initial prompt, waiting for messages.
 */
export async function createTeamRun(
  teamName: string,
  spec: TeamSpec,
  specSource: 'project' | 'user' = 'user',
  client?: PluginInput['client'],
  options?: CreateTeamRunOptions,
): Promise<RuntimeState> {
  const teamRunId = randomUUID();
  const leadSessionId = options?.leadSessionId;
  const directory = process.cwd();

  const state: RuntimeState = {
    version: 1,
    teamRunId,
    teamName,
    specSource,
    createdAt: Date.now(),
    status: 'creating',
    leadSessionId,
    members: spec.members.map((member) => ({
      name: member.name,
      agentType:
        member.name === spec.leadAgentId ? 'leader' : 'general-purpose',
      subagent_type:
        member.kind === 'subagent_type' ? member.subagent_type : undefined,
      category: member.kind === 'category' ? member.category : undefined,
      status: 'pending' as const,
      color: member.color,
      pendingInjectedMessageIds: [],
    })),
    shutdownRequests: [],
    bounds: {
      maxMembers: 8,
      maxParallelMembers: 4,
      maxMessagesPerRun: 10000,
      maxWallClockMinutes: 120,
      maxMemberTurns: 500,
    },
  };

  await saveRuntimeState(teamName, state);

  if (client) {
    // Create mailbox infrastructure
    await createMailboxDirs(
      teamRunId,
      spec.members.map((m) => m.name),
    );

    // Launch all member sessions
    await launchMembers(
      state,
      spec,
      client,
      teamName,
      leadSessionId,
      directory,
    );
    await saveRuntimeState(teamName, state);
  }

  return state;
}

/**
 * Launch all member sessions with proper lifecycle.
 * Each session:
 * 1. Creates a new session
 * 2. Sends initial prompt (synchronous, waits for completion)
 * 3. Session goes idle after completion
 * 4. Session stays alive, waiting for messages via live delivery
 */
async function launchMembers(
  state: RuntimeState,
  spec: TeamSpec,
  client: PluginInput['client'],
  teamName: string,
  leadSessionId: string | undefined,
  directory: string,
): Promise<void> {
  // Get lead model to inherit
  const leadModel = leadSessionId
    ? await getLeadModel(client, leadSessionId, directory)
    : undefined;

  // Launch all members in parallel
  const promises = spec.members.map(async (member, index) => {
    const prompt = buildMemberPrompt(spec, member, state.teamRunId);
    let sessionId: string | undefined;

    try {
      // Create session with proper parameters
      const createResult = await client.session.create({
        responseStyle: 'data',
        throwOnError: true,
        body: {
          parentID: leadSessionId || undefined,
        } as Record<string, unknown>,
        query: { directory },
      });

      // Extract session ID from response
      sessionId =
        (createResult as { data?: { id?: string }; id?: string })?.data?.id ??
        (createResult as { data?: { id?: string }; id?: string })?.id;
      if (!sessionId) {
        throw new Error(`Session create failed: no session ID returned`);
      }

      // Register session for team tracking
      registerTeamSession(sessionId, {
        teamRunId: state.teamRunId,
        teamName,
        memberName: member.name,
        role: member.name === spec.leadAgentId ? 'lead' : 'member',
      });

      // Update state
      state.members[index].sessionId = sessionId;
      state.members[index].status = 'running';
      await saveRuntimeState(teamName, state);

      // Send initial prompt (synchronous, waits for completion)
      // After completion, session goes idle and stays alive
      await client.session.prompt({
        responseStyle: 'data',
        throwOnError: true,
        query: { directory },
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: prompt }],
          ...(leadModel ? { model: leadModel } : {}),
        },
      });

      // Session is now idle and ready to receive messages
      state.members[index].status = 'idle';
      await saveRuntimeState(teamName, state);

      log('[team-runtime] Member session launched and idle', {
        teamRunId: state.teamRunId,
        memberName: member.name,
        sessionId,
      });
    } catch (error) {
      log('[team-runtime] Member launch failed', {
        teamRunId: state.teamRunId,
        memberName: member.name,
        error: error instanceof Error ? error.message : String(error),
      });
      state.members[index].status = 'errored';
      if (sessionId) {
        try {
          await client.session.abort({
            path: { id: sessionId },
            query: { directory },
          });
        } catch {}
      }
    }
  });

  await Promise.all(promises);
  state.status = 'active';
}

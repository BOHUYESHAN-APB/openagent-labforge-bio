// Team inbox injector — delivers pending messages when members become idle
import type { PluginInput } from "@opencode-ai/plugin"
import type { RuntimeState } from "../types"
import { loadRuntimeState, saveRuntimeState } from "../team-state-store/index"
import { pollAndDeliverMessages } from "./messaging"
import { log } from "../../../shared/logger"

/**
 * Check and deliver pending messages to a member that just became idle.
 * Called when a session idle event is detected for a team member.
 *
 * @returns Number of messages delivered
 */
export async function onMemberIdle(
  teamRunId: string,
  memberName: string,
  client: PluginInput["client"],
): Promise<number> {
  try {
    const delivered = await pollAndDeliverMessages(teamRunId, memberName, client)

    if (delivered > 0) {
      log("[team-injector] Delivered pending messages to idle member", {
        teamRunId,
        memberName,
        delivered,
      })
    }

    return delivered
  } catch (error) {
    log("[team-injector] Failed to deliver messages to idle member", {
      teamRunId,
      memberName,
      error: error instanceof Error ? error.message : String(error),
    })
    return 0
  }
}

/**
 * Check all members of a team and deliver pending messages to idle members.
 * Can be called periodically or on-demand.
 *
 * @returns Total messages delivered across all members
 */
export async function checkAllMembersInbox(
  teamRunId: string,
  client: PluginInput["client"],
): Promise<number> {
  try {
    const runtimeState = await loadRuntimeState(teamRunId)
    if (!runtimeState || runtimeState.status !== "active") {
      return 0
    }

    let totalDelivered = 0

    for (const member of runtimeState.members) {
      if (member.status === "idle" && member.sessionId) {
        const delivered = await pollAndDeliverMessages(teamRunId, member.name, client)
        totalDelivered += delivered
      }
    }

    if (totalDelivered > 0) {
      log("[team-injector] Delivered pending messages to idle members", {
        teamRunId,
        totalDelivered,
      })
    }

    return totalDelivered
  } catch (error) {
    log("[team-injector] Failed to check members inbox", {
      teamRunId,
      error: error instanceof Error ? error.message : String(error),
    })
    return 0
  }
}

/**
 * Build the inbox status for a team (for status reporting).
 */
export async function getTeamInboxStatus(
  teamRunId: string,
): Promise<Array<{ memberName: string; pendingMessages: number; status: string }>> {
  try {
    const runtimeState = await loadRuntimeState(teamRunId)
    if (!runtimeState) {
      return []
    }

    const status: Array<{ memberName: string; pendingMessages: number; status: string }> = []

    for (const member of runtimeState.members) {
      status.push({
        memberName: member.name,
        pendingMessages: member.pendingInjectedMessageIds.length,
        status: member.status,
      })
    }

    return status
  } catch {
    return []
  }
}

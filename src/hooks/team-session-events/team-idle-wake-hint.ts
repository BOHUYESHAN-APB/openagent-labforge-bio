import type { TeamModeConfig } from "../../config/schema/team-mode"
import { findResolvedMemberSession } from "../../features/team-mode/member-session-resolution"
import { listUnreadMessages } from "../../features/team-mode/team-mailbox/inbox"
import { loadRuntimeState } from "../../features/team-mode/team-state-store/store"
import { resolveSessionEventID } from "../../shared/event-session-id"
import { log } from "../../shared/logger"

type HookInput = { event: { type: string; properties?: unknown } }
export type HookImpl = (input: HookInput) => Promise<void>

export function createTeamIdleWakeHint(
  _ctx: { directory: string; client: unknown },
  config: TeamModeConfig,
): HookImpl {
  return async ({ event }: HookInput): Promise<void> => {
    if (event.type !== "session.idle") return

    const sessionID = resolveSessionEventID(event.properties)
    if (!sessionID) return

    try {
      const runtimeMember = await findResolvedMemberSession(sessionID, config, "team idle wake hint")
      if (runtimeMember === null) return

      const runtimeState = await loadRuntimeState(runtimeMember.teamRunId, config)
      const memberEntry = runtimeState.members.find((member) => member.name === runtimeMember.memberName)
      if (!memberEntry) return

      if (memberEntry.status === "errored" || memberEntry.status === "completed" || memberEntry.status === "shutdown_approved") {
        return
      }

      const unreadMessages = await listUnreadMessages(runtimeState.teamRunId, memberEntry.name, config)
      if (unreadMessages.length === 0) return

      log("team idle wake hint", {
        event: "team-mode-idle-wake-hint",
        teamRunId: runtimeState.teamRunId,
        memberName: memberEntry.name,
        sessionID,
        unreadCount: unreadMessages.length,
      })
    } catch (error) {
      log("team idle wake hint failed", {
        event: "team-mode-idle-wake-hint-error",
        sessionID,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

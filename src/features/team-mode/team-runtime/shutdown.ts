// Team runtime shutdown — supports both legacy (teamName) and new (teamRunId + config) interfaces
import type { TeamModeConfig } from "../../../config/schema/team-mode"
import type { RuntimeState } from "../types"
import { loadRuntimeState as loadByTeamName, saveRuntimeState as saveByTeamName, deleteRuntimeState } from "../team-state-store/index"
import { loadRuntimeState as loadByRunId, saveRuntimeState as saveByRunId } from "../team-state-store/store"

// --- Legacy interface (teamName-based, for backward compat) ---

export async function deleteTeam(teamName: string): Promise<void> {
  await deleteRuntimeState(teamName)
}

export async function requestShutdown(
  teamName: string,
  memberId: string,
  requesterName: string
): Promise<RuntimeState | null> {
  const state = await loadByTeamName(teamName)
  if (!state) return null
  
  state.shutdownRequests.push({
    memberId,
    requesterName,
    requestedAt: Date.now(),
  })
  
  state.status = "shutdown_requested"
  await saveByTeamName(teamName, state)
  return state
}

export async function approveShutdown(
  teamName: string,
  memberId: string,
  _approverName?: string,
  _config?: TeamModeConfig,
): Promise<RuntimeState | null> {
  const state = await loadByTeamName(teamName)
  if (!state) return null
  
  const request = state.shutdownRequests.find(r => r.memberId === memberId)
  if (request) {
    request.approvedAt = Date.now()
  }
  
  await saveByTeamName(teamName, state)
  return state
}

export async function rejectShutdown(
  teamName: string,
  memberId: string,
  reason: string,
  _config?: TeamModeConfig,
): Promise<RuntimeState | null> {
  const state = await loadByTeamName(teamName)
  if (!state) return null
  
  const request = state.shutdownRequests.find(r => r.memberId === memberId)
  if (request) {
    request.rejectedReason = reason
    request.rejectedAt = Date.now()
  }
  
  await saveByTeamName(teamName, state)
  return state
}

// --- New interface (teamRunId + config, for proper integration) ---

export async function requestShutdownOfMember(
  teamRunId: string,
  targetMemberName: string,
  requesterName: string,
  config: TeamModeConfig,
): Promise<void> {
  const state = await loadByRunId(teamRunId, config)
  
  state.shutdownRequests.push({
    memberId: targetMemberName,
    requesterName,
    requestedAt: Date.now(),
  })
  
  state.status = "shutdown_requested"
  await saveByRunId(state, config)
}

export async function approveShutdownByRunId(
  teamRunId: string,
  memberName: string,
  approverName: string,
  config: TeamModeConfig,
): Promise<void> {
  const state = await loadByRunId(teamRunId, config)
  
  const request = state.shutdownRequests.find(r => r.memberId === memberName)
  if (request) {
    request.approvedAt = Date.now()
  }
  
  await saveByRunId(state, config)
}

export async function rejectShutdownByRunId(
  teamRunId: string,
  memberName: string,
  reason: string,
  config: TeamModeConfig,
): Promise<void> {
  const state = await loadByRunId(teamRunId, config)
  
  const request = state.shutdownRequests.find(r => r.memberId === memberName)
  if (request) {
    request.rejectedReason = reason
    request.rejectedAt = Date.now()
  }
  
  await saveByRunId(state, config)
}

/**
 * Session-to-Team Registry
 *
 * Maps OpenCode session IDs to team member entries.
 * Used to track which sessions belong to which team members,
 * enabling session event handlers to update team member status.
 *
 * Inspired by OMO's team-session-registry.
 */

export type TeamSessionRole = 'lead' | 'member';

export type TeamSessionEntry = {
  teamRunId: string;
  teamName: string;
  memberName: string;
  role: TeamSessionRole;
  registeredAt: number;
};

// In-memory registry: sessionId → TeamSessionEntry
const registry = new Map<string, TeamSessionEntry>();

/**
 * Register a session as belonging to a team member.
 */
export function registerTeamSession(
  sessionId: string,
  entry: Omit<TeamSessionEntry, 'registeredAt'>,
): void {
  registry.set(sessionId, {
    ...entry,
    registeredAt: Date.now(),
  });
}

/**
 * Look up which team member a session belongs to.
 */
export function lookupTeamSession(
  sessionId: string,
): TeamSessionEntry | undefined {
  return registry.get(sessionId);
}

/**
 * Unregister a session (e.g., when session is deleted).
 */
export function unregisterTeamSession(sessionId: string): void {
  registry.delete(sessionId);
}

/**
 * Unregister all sessions belonging to a specific team run.
 */
export function unregisterTeamSessionsByTeam(teamRunId: string): void {
  for (const [sessionId, entry] of registry.entries()) {
    if (entry.teamRunId === teamRunId) {
      registry.delete(sessionId);
    }
  }
}

/**
 * Get all sessions belonging to a specific team run.
 */
export function getTeamSessions(
  teamRunId: string,
): Array<{ sessionId: string } & TeamSessionEntry> {
  const result: Array<{ sessionId: string } & TeamSessionEntry> = [];
  for (const [sessionId, entry] of registry.entries()) {
    if (entry.teamRunId === teamRunId) {
      result.push({ sessionId, ...entry });
    }
  }
  return result;
}

/**
 * Get all registered team sessions (for debugging/dashboard).
 */
export function getAllTeamSessions(): Array<
  { sessionId: string } & TeamSessionEntry
> {
  const result: Array<{ sessionId: string } & TeamSessionEntry> = [];
  for (const [sessionId, entry] of registry.entries()) {
    result.push({ sessionId, ...entry });
  }
  return result;
}

/**
 * Clear the entire registry (for testing).
 */
export function clearTeamSessionRegistry(): void {
  registry.clear();
}

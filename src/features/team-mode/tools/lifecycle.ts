// Team tools lifecycle — uses OpenCode client directly for session spawning
import type { PluginInput } from '@opencode-ai/plugin';
import type { TeamModeConfig } from '../../../config/schema/team-mode';
import { loadTeamSpec, saveTeamSpec } from '../team-registry/loader';
import { createTeamRun } from '../team-runtime/create';
import { deleteTeam as deleteTeamRuntime } from '../team-runtime/shutdown';
import type { TeamSpec } from '../types';
import { parseMember } from '../types';

export async function teamCreate(
  teamName: string,
  specInput: unknown,
  config?: TeamModeConfig,
  client?: PluginInput['client'],
  leadSessionId?: string,
): Promise<{
  teamName: string;
  spec: TeamSpec;
  runtimeState: { teamRunId: string };
}> {
  // Parse and validate the spec
  const spec = specInput as TeamSpec;

  // Validate all members
  for (const member of spec.members) {
    parseMember(member);
  }

  // Save the spec
  await saveTeamSpec(teamName, spec);

  // Create the runtime state and optionally launch member sessions
  const runtimeState = await createTeamRun(teamName, spec, 'user', client, {
    leadSessionId,
  });

  return {
    teamName,
    spec,
    runtimeState: { teamRunId: runtimeState.teamRunId },
  };
}

export async function teamDelete(
  teamName: string,
  _config?: TeamModeConfig,
  client?: PluginInput['client'],
): Promise<void> {
  // Load the spec to get member names
  const spec = await loadTeamSpec(teamName);
  if (spec) {
    // TODO: clean up worktrees (requires team-worktree manager)
  }

  // Delete the runtime state (includes session abort)
  await deleteTeamRuntime(teamName, client);
}

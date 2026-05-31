export const SUBAGENT_POLICY_TEMPLATE = `## SUBAGENT POLICY COMMAND

The user has executed a subagent policy command. Display the current policy status.

### INSTRUCTIONS
1. Read the policy information from the command arguments
2. Display it clearly to the user
3. If the user requested a mode change, explain that a restart is required

### DISPLAY FORMAT
\`\`\`
[Subagent Policy]
Current mode: {mode}
Allowed agents: {agents}

Available modes:
- /ol-subagents-UM : ultra-minimal (strict main-agent-first)
- /ol-subagents-M  : minimal (cache-first low-agent)
- /ol-subagents-F  : full (all configured subagents)
- /ol-subagents-C  : custom (allowedAgents allowlist)
- /ol-subagents-MO : main-only (disable child sessions)

Note: Mode changes require plugin restart to take effect.
\`\`\`

### CONSTRAINTS
- Display the information directly, do not execute any code
- If mode was changed, remind user to restart OpenCode
`;

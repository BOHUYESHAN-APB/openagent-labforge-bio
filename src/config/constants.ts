// Agent names
export const AGENT_ALIASES: Record<string, string> = {
  engineer: 'orchestrator',
  explore: 'explorer',
  'frontend-ui-ux-engineer': 'designer',
  planner: 'prometheus',
  executor: 'atlas',
  'bio-analyst': 'bio-orchestrator',
  'chem-analyst': 'chem-orchestrator',
  'requirements-analyst': 'metis',
  'plan-reviewer': 'momus',
};

export const SUBAGENT_NAMES = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'fixer',
  'observer',
  'council',
  'councillor',
  // New subagents from Omo/OLD-2
  'metis',
  'momus',
  'multimodal-looker',
] as const;

export const ORCHESTRATOR_NAME = 'orchestrator' as const;
export const DEFAULT_VISIBLE_AGENT_NAME = 'engineer' as const;

// Primary agents (visible in UI) — includes loop-managed agents
// (reviewer, internal-planner) which are hidden from manual selection
// but shown as primary when activated by the system.
export const PRIMARY_AGENT_NAMES = [
  'orchestrator',
  'deep-worker',
  'prometheus',
  'atlas',
  'bio-orchestrator',
  'chem-orchestrator',
  'reviewer',
  'internal-planner',
] as const;

export const ALL_AGENT_NAMES = [
  ...PRIMARY_AGENT_NAMES,
  ...SUBAGENT_NAMES,
] as const;

// Agent name type (for use in DEFAULT_MODELS)
export type AgentName = (typeof ALL_AGENT_NAMES)[number];

// Delegation rules: which agents can spawn which other agents/modules
// orchestrator: can spawn all orchestratable specialists/modules (full delegation)
// deep-worker: can spawn explorer, librarian, oracle for autonomous work
// prometheus: read-only planner, cannot spawn subagents
// atlas: plan executor, can spawn core specialists plus science modules
// bio-orchestrator: biological science specialist, can spawn all orchestratable specialists/modules
// fixer: leaf node — prompt forbids delegation; use grep/glob for lookups
// designer: can spawn explorer (for research during design)
// explorer/librarian/oracle: cannot spawn any subagents (leaf nodes)
// Unknown agent types not listed here default to explorer-only access
// Which agents each agent type can spawn via delegation.
// councillor is internal — only CouncilManager spawns it.
export const ORCHESTRATABLE_AGENTS = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'fixer',
  'observer',
  'council',
  'bio-orchestrator',
  'chem-orchestrator',
  // New subagents
  'metis',
  'momus',
  'multimodal-looker',
  'reviewer',
] as const;

/** Agents that cannot be disabled even if listed in disabled_agents config. */
export const PROTECTED_AGENTS = new Set([
  'orchestrator',
  'councillor',
  // Primary agents are protected
  'deep-worker',
  'prometheus',
  'atlas',
  'bio-orchestrator',
  'chem-orchestrator',
]);

/**
 * Get the list of orchestratable agents, excluding any disabled agents.
 * This is used for delegation validation at runtime.
 */
export function getOrchestratableAgents(
  disabledAgents?: Set<string>,
): string[] {
  return ORCHESTRATABLE_AGENTS.filter((name) => !disabledAgents?.has(name));
}

export const SUBAGENT_DELEGATION_RULES: Record<AgentName, readonly string[]> = {
  orchestrator: ORCHESTRATABLE_AGENTS,
  'deep-worker': ['explorer', 'librarian', 'oracle'],
  prometheus: [], // Planner cannot spawn subagents in interview mode
  atlas: ['explorer', 'librarian', 'oracle', 'fixer', 'bio-orchestrator'],
  'bio-orchestrator': ORCHESTRATABLE_AGENTS,
  'chem-orchestrator': ORCHESTRATABLE_AGENTS,
  fixer: [],
  designer: [],
  explorer: [],
  librarian: [],
  oracle: [],
  observer: [],
  council: [],
  councillor: [],
  metis: [],
  momus: [],
  'multimodal-looker': [],
  reviewer: [],
  'internal-planner': ORCHESTRATABLE_AGENTS,
};

/**
 * Redesign-mode delegation rules for prometheus.
 * In redesign (loop autonomous re-planning), the planner can spawn
 * explorer, librarian, and oracle for autonomous research.
 */
export const PROMETHEUS_REDESIGN_AGENTS: readonly string[] = [
  'explorer',
  'librarian',
  'oracle',
];

/**
 * Get effective delegation rules for an agent, considering active loop phase.
 * In redesign mode, prometheus gains access to research subagents.
 */
export function getEffectiveDelegationRules(
  agentName: string,
  isRedesign?: boolean,
): readonly string[] {
  if (agentName === 'prometheus' && isRedesign) {
    return PROMETHEUS_REDESIGN_AGENTS;
  }
  return SUBAGENT_DELEGATION_RULES[agentName as AgentName] ?? [];
}

// Default models for each agent.
// ALL undefined by default — sub-agents inherit the main agent's model
// via OpenCode's native inheritance. Only set explicitly when a preset
// or user config overrides a specific agent.
export const DEFAULT_MODELS: Record<AgentName, string | undefined> = {
  // Primary agents
  orchestrator: undefined,
  'deep-worker': undefined,
  prometheus: undefined,
  atlas: undefined,
  'bio-orchestrator': undefined,
  'chem-orchestrator': undefined,
  // Subagents — all inherit from main agent by default
  oracle: undefined,
  librarian: undefined,
  explorer: undefined,
  designer: undefined,
  fixer: undefined,
  observer: undefined,
  council: undefined,
  councillor: undefined,
  // New subagents
  metis: undefined,
  momus: undefined,
  'multimodal-looker': undefined,
  reviewer: undefined,
  'internal-planner': undefined,
};

// Polling configuration
export const POLL_INTERVAL_MS = 500;
export const POLL_INTERVAL_SLOW_MS = 1000;
export const POLL_INTERVAL_BACKGROUND_MS = 2000;

// Timeouts
export const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
export const MAX_POLL_TIME_MS = 5 * 60 * 1000; // 5 minutes
export const FALLBACK_FAILOVER_TIMEOUT_MS = 15_000;

// Subagent depth limits
export const DEFAULT_MAX_SUBAGENT_DEPTH = 3;

// Workflow reminders
export const PHASE_REMINDER_TEXT = `!IMPORTANT! Recall the workflow rules:
Understand → choose the best parallelized path based on your capabilities and agents delegation rules → recall session reuse rules → execute → verify.
If delegating, launch the specialist in the same turn you mention it !END!`;

// Document parser reminder
export const DOC_PARSER_REMINDER =
  '<internal_reminder>If the model does not support native document parsing (PDF/DOCX/XLSX/PPTX), use Python tools (python -c, or write a script) to read and extract content from document files. Do not attempt to read binary files directly — extract text first.</internal_reminder>';
export const TMUX_SPAWN_DELAY_MS = 500;

// Stagger delay (ms) between parallel councillor launches to avoid tmux collisions
export const COUNCILLOR_STAGGER_MS = 250;

// Polling stability
export const STABLE_POLLS_THRESHOLD = 3;

/** Agents that are disabled by default. Users must explicitly enable them
 *  by removing from disabled_agents and configuring an appropriate model. */
export const DEFAULT_DISABLED_AGENTS: string[] = ['observer'];

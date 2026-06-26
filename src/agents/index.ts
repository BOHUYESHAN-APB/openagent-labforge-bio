import type { AgentConfig as SDKAgentConfig } from '@opencode-ai/sdk/v2';
import { getSkillPermissionsForAgent } from '../cli/skills';
import {
  type AgentOverrideConfig,
  ALL_AGENT_NAMES,
  DEFAULT_DISABLED_AGENTS,
  DEFAULT_MODELS,
  getAgentOverride,
  getCustomAgentNames,
  loadAgentPrompt,
  ORCHESTRATABLE_AGENTS,
  type PluginConfig,
  PRIMARY_AGENT_NAMES,
  PROTECTED_AGENTS,
  SUBAGENT_NAMES,
} from '../config';
import { getAgentMcpList } from '../config/agent-mcps';

// New primary agents
import { createAtlasAgent } from './atlas';
import { createBioOrchestratorAgent } from './bio-orchestrator';
import { createChemOrchestratorAgent } from './chem-orchestrator';
// Existing agents
import { createCouncilAgent } from './council';
import { createCouncillorAgent } from './councillor';
import { createDeepWorkerAgent } from './deep-worker';
import { createDesignerAgent } from './designer';
import { createExplorerAgent } from './explorer';
import { createFixerAgent } from './fixer';
import { createLibrarianAgent } from './librarian';
import { createMetisAgent } from './metis';
import { createMomusAgent } from './momus';
import { createMultimodalLookerAgent } from './multimodal-looker';
import { createObserverAgent } from './observer';
import { createOracleAgent } from './oracle';
import {
  type AgentDefinition,
  createOrchestratorAgent,
  resolvePrompt,
} from './orchestrator';
import { createPrometheusAgent } from './prometheus';
import { createReviewerAgent } from './reviewer';

export type { AgentDefinition } from './orchestrator';

type AgentFactory = (
  model: string | undefined,
  customPrompt?: string,
  customAppendPrompt?: string,
) => AgentDefinition;

const COUNCIL_TOOL_ALLOWED_AGENTS = new Set(['council']);

function normalizeDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

function reorderPrimaryAgentFactories(
  config?: PluginConfig,
): [PrimaryAgentName, (typeof PRIMARY_AGENT_FACTORIES)[PrimaryAgentName]][] {
  const entries = Object.entries(PRIMARY_AGENT_FACTORIES) as [
    PrimaryAgentName,
    (typeof PRIMARY_AGENT_FACTORIES)[PrimaryAgentName],
  ][];

  const preferredVisibleAgent = config?.preferredVisibleAgent?.trim();
  if (!preferredVisibleAgent) return entries;

  const preferredInternalName =
    preferredVisibleAgent === 'engineer'
      ? 'orchestrator'
      : preferredVisibleAgent === 'planner'
        ? 'prometheus'
        : preferredVisibleAgent === 'executor'
          ? 'atlas'
          : preferredVisibleAgent === 'bio-analyst'
            ? 'bio-orchestrator'
            : preferredVisibleAgent === 'chem-analyst'
              ? 'chem-orchestrator'
              : undefined;

  if (!preferredInternalName) return entries;

  const preferredEntry = entries.find(
    ([name]) => name === preferredInternalName,
  );
  if (!preferredEntry) return entries;

  return [
    preferredEntry,
    ...entries.filter(([name]) => name !== preferredInternalName),
  ];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Agent Configuration Helpers

/**
 * Apply user-provided overrides to an agent's configuration.
 * Supports overriding model (string or priority array), variant, and temperature.
 * When model is an array, stores it as _modelArray for runtime fallback resolution
 * and clears config.model so OpenCode does not pre-resolve a stale value.
 */
function applyOverrides(
  agent: AgentDefinition,
  override: AgentOverrideConfig,
): void {
  if (override.model) {
    if (Array.isArray(override.model)) {
      agent._modelArray = override.model.map((m) =>
        typeof m === 'string' ? { id: m } : m,
      );
      // Use the first model as the primary config.model
      // (OpenCode needs a string, not undefined)
      const first = override.model[0];
      agent.config.model = typeof first === 'string' ? first : first.id;
    } else {
      agent.config.model = override.model;
    }
  }
  if (override.variant) agent.config.variant = override.variant;
  if (override.temperature !== undefined)
    agent.config.temperature = override.temperature;
  if (override.options) {
    agent.config.options = {
      ...agent.config.options,
      ...override.options,
    };
  }
  if (override.displayName) {
    agent.displayName = override.displayName;
  }
}

function isKnownAgentName(name: string): boolean {
  return (ALL_AGENT_NAMES as readonly string[]).includes(name);
}

function normalizeCustomAgentName(name: string): string {
  return name.trim();
}

function isSafeCustomAgentName(name: string): boolean {
  return /^[a-z][a-z0-9_-]*$/i.test(name) && !isKnownAgentName(name);
}

function hasCustomAgentModel(
  override: AgentOverrideConfig | undefined,
): override is AgentOverrideConfig & {
  model: NonNullable<AgentOverrideConfig['model']>;
} {
  if (!override?.model) {
    return false;
  }

  return !Array.isArray(override.model) || override.model.length > 0;
}

function buildCustomAgentDefinition(
  name: string,
  override: AgentOverrideConfig,
  filePrompt?: string,
  fileAppendPrompt?: string,
): AgentDefinition {
  const basePrompt = override.prompt ?? `You are the ${name} specialist.`;

  return {
    name,
    config: {
      model:
        typeof override.model === 'string'
          ? override.model
          : (DEFAULT_MODELS.orchestrator ?? DEFAULT_MODELS.oracle),
      temperature: 0.2,
      prompt: resolvePrompt(basePrompt, filePrompt, fileAppendPrompt),
    },
  } as AgentDefinition;
}

function injectDisplayNames(
  orchestrator: AgentDefinition,
  nameMap: Map<string, string>,
): void {
  if (nameMap.size === 0) return;
  let prompt = orchestrator.config.prompt;
  if (!prompt) return;

  for (const [internalName, displayName] of nameMap) {
    prompt = prompt.replace(
      new RegExp(`@${escapeRegExp(internalName)}\\b`, 'g'),
      `@${normalizeDisplayName(displayName)}`,
    );
  }

  orchestrator.config.prompt = prompt;
}

/**
 * Agent-specific tool permission restrictions.
 * Based on Omo's permission model, adapted for lightweight OMOS architecture.
 *
 * Categories:
 * - READ_ONLY: Can only read files, search, and analyze (no write/edit/bash)
 * - PLANNING: Can write plan files but no bash
 * - FULL: Full tool access (write/edit/bash)
 * - COUNCIL: Read-only + council-specific tools
 * - VISUAL: Strictest - only read tool
 */
type PermissionLevel = 'READ_ONLY' | 'PLANNING' | 'FULL' | 'COUNCIL' | 'VISUAL';

const AGENT_PERMISSION_LEVELS: Record<string, PermissionLevel> = {
  // Primary agents
  orchestrator: 'FULL',
  'deep-worker': 'FULL',
  prometheus: 'PLANNING',
  atlas: 'FULL',
  'bio-orchestrator': 'FULL',
  'chem-orchestrator': 'FULL',
  council: 'COUNCIL',
  // Subagents
  explorer: 'READ_ONLY',
  librarian: 'READ_ONLY',
  oracle: 'READ_ONLY',
  metis: 'READ_ONLY',
  momus: 'READ_ONLY',
  reviewer: 'READ_ONLY',
  observer: 'VISUAL',
  'multimodal-looker': 'VISUAL',
  designer: 'FULL',
  fixer: 'FULL',
  councillor: 'VISUAL',
};

function getAgentToolPermissions(
  agentName: string,
): Record<string, 'ask' | 'allow' | 'deny'> {
  const level = AGENT_PERMISSION_LEVELS[agentName] ?? 'FULL';
  const perms: Record<string, 'ask' | 'allow' | 'deny'> = {};
  switch (level) {
    case 'READ_ONLY':
      Object.assign(perms, { write: 'deny', edit: 'deny', bash: 'deny' });
      break;
    case 'PLANNING':
      // prometheus: read-only + sub-agents allowed (for Plan A/B research)
      Object.assign(perms, {
        write: 'deny',
        edit: 'deny',
        bash: 'deny',
        task: 'allow',
        enter_plan_mode: 'deny',
      });
      break;
    case 'COUNCIL':
      Object.assign(perms, { write: 'deny', edit: 'deny', bash: 'deny' });
      break;
    case 'VISUAL':
      Object.assign(perms, { write: 'deny', edit: 'deny', bash: 'deny' });
      break;
    default:
      break;
  }

  // switch_agent is an internal loop orchestration tool — hide from
  // regular primary agents. Only reviewer and prometheus may use it.
  if (agentName !== 'reviewer' && agentName !== 'prometheus') {
    perms.switch_agent = 'deny';
  }
  return perms;
}

/**
 * Apply default permissions to an agent.
 * Sets 'question' permission to 'allow' and includes skill permission presets.
 * Applies agent-specific tool restrictions based on permission level.
 * If configuredSkills is provided, it honors that list instead of defaults.
 *
 * Note: If the agent already explicitly sets question to 'deny', that is
 * respected (e.g. councillor should not ask questions).
 */
function applyDefaultPermissions(
  agent: AgentDefinition,
  configuredSkills?: string[],
): void {
  const existing = (agent.config.permission ?? {}) as Record<
    string,
    'ask' | 'allow' | 'deny' | Record<string, 'ask' | 'allow' | 'deny'>
  >;

  // Get skill-specific permissions for this agent
  const skillPermissions = getSkillPermissionsForAgent(
    agent.name,
    configuredSkills,
  );

  // Get agent-specific tool restrictions
  const toolRestrictions = getAgentToolPermissions(agent.name);

  // Respect explicit deny on question (councillor)
  const questionPerm = existing.question === 'deny' ? 'deny' : 'allow';
  const councilSessionPerm = COUNCIL_TOOL_ALLOWED_AGENTS.has(agent.name)
    ? (existing.council_session ?? 'allow')
    : 'deny';

  agent.config.permission = {
    ...toolRestrictions,
    ...existing,
    question: questionPerm,
    council_session: councilSessionPerm,
    // Apply skill permissions as nested object under 'skill' key
    skill: {
      ...(typeof existing.skill === 'object' ? existing.skill : {}),
      ...skillPermissions,
    },
  } as SDKAgentConfig['permission'];
}

// Agent Factories

type SubagentName = (typeof SUBAGENT_NAMES)[number];
type PrimaryAgentName = (typeof PRIMARY_AGENT_NAMES)[number];

export type { SubagentName };

export function isSubagent(name: string): name is SubagentName {
  return (SUBAGENT_NAMES as readonly string[]).includes(name);
}

export function isPrimaryAgent(name: string): boolean {
  return (PRIMARY_AGENT_NAMES as readonly string[]).includes(name);
}

const SUBAGENT_FACTORIES: Record<SubagentName, AgentFactory> = {
  explorer: createExplorerAgent,
  librarian: createLibrarianAgent,
  oracle: createOracleAgent,
  designer: createDesignerAgent,
  fixer: createFixerAgent,
  observer: createObserverAgent,
  council: createCouncilAgent,
  councillor: createCouncillorAgent,
  // New subagents
  metis: createMetisAgent,
  momus: createMomusAgent,
  'multimodal-looker': createMultimodalLookerAgent,
  reviewer: createReviewerAgent,
};

const PRIMARY_AGENT_FACTORIES: Record<
  PrimaryAgentName,
  (
    model: string | undefined,
    customPrompt?: string,
    customAppendPrompt?: string,
    disabledAgents?: Set<string>,
  ) => AgentDefinition
> = {
  orchestrator: createOrchestratorAgent,
  'deep-worker': (m, p, a) => createDeepWorkerAgent(m, p, a),
  prometheus: (m, p, a) => createPrometheusAgent(m, p, a),
  atlas: (m, p, a) => createAtlasAgent(m, p, a),
  'bio-orchestrator': createBioOrchestratorAgent,
  'chem-orchestrator': createChemOrchestratorAgent,
};

// Public API

/**
 * Create all agent definitions with optional configuration overrides.
 * Instantiates the orchestrator, primary agents, and all subagents,
 * applying user config and defaults.
 *
 * @param config - Optional plugin configuration with agent overrides
 * @returns Array of agent definitions (primary agents first, then subagents)
 */
export function createAgents(config?: PluginConfig): AgentDefinition[] {
  const disabled = getDisabledAgents(config);

  // Model resolution: per-agent override > modelPreferences > inherit (undefined).
  // When undefined is returned, OpenCode's native model inheritance kicks in —
  // the sub-agent uses whatever model the main agent is using.
  const getModelForAgent = (
    name: SubagentName | PrimaryAgentName,
  ): string | string[] | undefined => {
    // 1. Per-agent override from config (highest priority)
    const override = getAgentOverride(config, name);
    if (override?.model) {
      const m = override.model;
      if (typeof m === 'string') return m;
      if (Array.isArray(m) && m.length > 0) {
        const first = m[0];
        return typeof first === 'string' ? first : first.id;
      }
    }

    // 2. modelPreferences (global or per-agent)
    const prefs = config?.modelPreferences;
    if (prefs?.enabled) {
      if (prefs.perAgent?.[name]) {
        return prefs.perAgent[name];
      }
      if (prefs.customModel) {
        return prefs.customModel;
      }
    }

    // 3. Inherit from main agent (return undefined → OpenCode native)
    return undefined;
  };

  // 1. Create all primary agents (orchestrator + new primary agents)
  const primaryAgents = reorderPrimaryAgentFactories(config)
    .filter(([name]) => !disabled.has(name))
    .map(([name, factory]) => {
      const customPrompts = loadAgentPrompt(name, config?.preset);
      const override = getAgentOverride(config, name);
      let model: string | undefined;
      if (override?.model) {
        if (Array.isArray(override.model)) {
          const first = override.model[0];
          model = typeof first === 'string' ? first : first?.id;
        } else {
          model = override.model;
        }
      } else {
        const resolved = getModelForAgent(name);
        model = Array.isArray(resolved) ? resolved[0] : resolved;
      }
      const agent = factory(
        model,
        customPrompts.prompt,
        customPrompts.appendPrompt,
        disabled,
      );
      if (override) {
        applyOverrides(agent, override);
      }
      applyDefaultPermissions(agent, override?.skills);
      return agent;
    });

  // 2. Gather all sub-agent definitions with custom prompts
  const protoSubAgents = (
    Object.entries(SUBAGENT_FACTORIES) as [SubagentName, AgentFactory][]
  )
    .filter(([name]) => !disabled.has(name))
    .map(([name, factory]) => {
      const customPrompts = loadAgentPrompt(name, config?.preset);
      const resolved = getModelForAgent(name);
      const model = Array.isArray(resolved) ? resolved[0] : resolved;
      return factory(model, customPrompts.prompt, customPrompts.appendPrompt);
    });

  // 2b. Discover unknown keys in config.agents as custom subagents.
  const customAgentNames = getCustomAgentNames(config)
    .map(normalizeCustomAgentName)
    .filter((name) => name.length > 0)
    .filter((name) => {
      if (!isSafeCustomAgentName(name)) {
        throw new Error(`Unsafe custom agent name '${name}'`);
      }
      if (disabled.has(name)) {
        return false;
      }
      return true;
    });

  const protoCustomAgents = customAgentNames.flatMap((name) => {
    const override = getAgentOverride(config, name);
    if (!hasCustomAgentModel(override)) {
      console.warn(
        `[extendai-lab] Custom agent '${name}' skipped: 'model' is required`,
      );
      return [];
    }

    const customPrompts = loadAgentPrompt(name, config?.preset);

    return [
      buildCustomAgentDefinition(
        name,
        override,
        customPrompts.prompt,
        customPrompts.appendPrompt,
      ),
    ];
  });

  // 3. Apply overrides and default permissions to built-in subagents
  const builtInSubAgents = protoSubAgents.map((agent) => {
    const override = getAgentOverride(config, agent.name);
    if (override) {
      applyOverrides(agent, override);
    }
    applyDefaultPermissions(agent, override?.skills);
    return agent;
  });

  // 3b. Backward compat: if council has no preset override and still uses the
  // hardcoded default model, fall back to the deprecated council.master.model.
  // See https://github.com/alvinunreal/openagent-labforge/issues/369
  const legacyMasterModel = config?.council?._legacyMasterModel;
  if (legacyMasterModel) {
    const councilAgent = builtInSubAgents.find((a) => a.name === 'council');
    if (
      councilAgent &&
      !getAgentOverride(config, 'council')?.model &&
      councilAgent.config.model === DEFAULT_MODELS.council
    ) {
      councilAgent.config.model = legacyMasterModel;
    }
  }

  const customSubAgents = protoCustomAgents.map((agent) => {
    const override = getAgentOverride(config, agent.name);
    if (override) {
      applyOverrides(agent, override);
    }
    applyDefaultPermissions(agent, override?.skills);
    return agent;
  });

  const allSubAgents = [...builtInSubAgents, ...customSubAgents];

  // 4. Collect all display names from all agents
  const displayNameMap = new Map<string, string>();
  for (const agent of primaryAgents) {
    if (agent.displayName) {
      displayNameMap.set(agent.name, agent.displayName);
    }
  }
  for (const agent of allSubAgents) {
    if (agent.displayName) {
      displayNameMap.set(agent.name, agent.displayName);
    }
  }

  // 4b. Append custom orchestrator hints from custom agent overrides.
  const orchestratorAgent = primaryAgents.find(
    (a) => a.name === 'orchestrator',
  );
  if (orchestratorAgent) {
    const customOrchestratorPrompts = customSubAgents
      .map((agent) => {
        const override = getAgentOverride(config, agent.name);
        return override?.orchestratorPrompt;
      })
      .filter((prompt): prompt is string => Boolean(prompt));

    // Validate display names
    const usedDisplayNames = new Set<string>();
    for (const [, displayName] of displayNameMap) {
      const normalizedDisplayName = normalizeDisplayName(displayName);
      if (usedDisplayNames.has(normalizedDisplayName)) {
        throw new Error(
          `Duplicate displayName '${normalizedDisplayName}' assigned to multiple agents`,
        );
      }
      usedDisplayNames.add(normalizedDisplayName);
    }
    for (const displayName of usedDisplayNames) {
      if (
        (ALL_AGENT_NAMES as readonly string[]).includes(displayName) ||
        customAgentNames.includes(displayName)
      ) {
        throw new Error(
          `displayName '${displayName}' conflicts with an agent name`,
        );
      }
    }

    // Inject display names into orchestrator prompt (complete map)
    injectDisplayNames(orchestratorAgent, displayNameMap);

    if (customOrchestratorPrompts.length > 0) {
      const rewrittenPrompts = customOrchestratorPrompts.map((promptText) => {
        let text = promptText;
        for (const [internalName, displayName] of displayNameMap) {
          text = text.replace(
            new RegExp(`@${escapeRegExp(internalName)}\\b`, 'g'),
            `@${normalizeDisplayName(displayName)}`,
          );
        }
        return text;
      });

      orchestratorAgent.config.prompt = `${orchestratorAgent.config.prompt}\n\n${rewrittenPrompts.join(
        '\n\n',
      )}`;
    }
  }

  return [...primaryAgents, ...allSubAgents];
}

/**
 * Get agent configurations formatted for the OpenCode SDK.
 * Converts agent definitions to SDK config format and applies classification metadata.
 *
 * @param config - Optional plugin configuration with agent overrides
 * @returns Record mapping agent names to their SDK configurations
 */
export function getAgentConfigs(
  config?: PluginConfig,
): Record<string, SDKAgentConfig> {
  const agents = createAgents(config);

  const applyClassification = (
    name: string,
    sdkConfig: SDKAgentConfig & {
      mcps?: string[];
      displayName?: string;
      hidden?: boolean;
    },
  ): void => {
    if (name === 'council') {
      // Council is a primary agent — user-facing multi-LLM consensus engine
      sdkConfig.mode = 'primary';
    } else if (name === 'councillor') {
      // Internal agent — subagent mode, hidden from @ autocomplete
      sdkConfig.mode = 'subagent';
      sdkConfig.hidden = true;
    } else if (name === 'reviewer') {
      // Loop review agent — UI visible, but not manually selectable
      // Only activated by /ol-loop-start or auto-review system
      sdkConfig.mode = 'subagent';
      sdkConfig.hidden = false;
    } else if (isPrimaryAgent(name)) {
      // Primary agents are visible in UI
      sdkConfig.mode = 'primary';
    } else if (isSubagent(name)) {
      sdkConfig.mode = 'subagent';
    } else {
      sdkConfig.mode = 'subagent';
    }
  };

  const isInternalOnly = (name: string): boolean => name === 'councillor';

  const entries: Array<[string, SDKAgentConfig]> = [];

  for (const a of agents) {
    const sdkConfig: SDKAgentConfig & {
      mcps?: string[];
      displayName?: string;
      hidden?: boolean;
    } = {
      ...a.config,
      description: a.description,
      mcps: getAgentMcpList(a.name, config),
    };

    if (a.displayName) {
      sdkConfig.displayName = a.displayName;
    }

    applyClassification(a.name, sdkConfig);

    const normalizedDisplayName = a.displayName
      ? normalizeDisplayName(a.displayName)
      : undefined;

    if (normalizedDisplayName && !isInternalOnly(a.name)) {
      entries.push([normalizedDisplayName, sdkConfig]);
      entries.push([a.name, { ...sdkConfig, hidden: true }]);
      continue;
    }

    entries.push([a.name, sdkConfig]);
  }

  // 5. Hide upstream OpenCode "plan" and "build" agents by overriding them
  //    as hidden subagents in the plugin's agent return. This is more reliable
  //    than hiding in the config hook because OpenCode merges plugin agents
  //    after its own built-in registration.
  const hidePlan = config?.hide_upstream_agents?.plan ?? true;
  const hideBuild = config?.hide_upstream_agents?.build ?? true;

  if (hidePlan) {
    entries.push([
      'plan',
      {
        mode: 'subagent',
        hidden: true,
        description:
          'Upstream plan agent (hidden by ExtendAI Lab, use planner instead)',
      },
    ]);
  }
  if (hideBuild) {
    entries.push([
      'build',
      {
        mode: 'subagent',
        hidden: true,
        description:
          'Upstream build agent (hidden by ExtendAI Lab, use orchestrator/deep-worker instead)',
      },
    ]);
  }

  return Object.fromEntries(entries);
}

/**
 * Get the set of disabled agent names from config, applying protection rules.
 */
export function getDisabledAgents(config?: PluginConfig): Set<string> {
  const userDisabled = config?.disabled_agents;
  const disabledSource =
    userDisabled !== undefined ? userDisabled : DEFAULT_DISABLED_AGENTS;
  const disabled = new Set<string>();
  for (const name of disabledSource) {
    if (!PROTECTED_AGENTS.has(name)) {
      disabled.add(name);
    }
  }

  return disabled;
}

/**
 * Get the list of enabled (non-disabled) agent names.
 */
export function getEnabledAgentNames(config?: PluginConfig): string[] {
  const disabled = getDisabledAgents(config);
  const customAgentNames = getCustomAgentNames(config).filter(
    (name) => !disabled.has(name),
  );
  return [
    ...ALL_AGENT_NAMES.filter((name) => !disabled.has(name)),
    ...customAgentNames,
  ];
}

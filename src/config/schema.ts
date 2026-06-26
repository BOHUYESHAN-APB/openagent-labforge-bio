import { z } from 'zod';
import { AGENT_ALIASES, ALL_AGENT_NAMES } from './constants';
import { CouncilConfigSchema } from './council-schema';
import { TeamModeConfigSchema } from './schema/team-mode';

const FALLBACK_AGENT_NAMES = [
  'orchestrator',
  'oracle',
  'designer',
  'explorer',
  'librarian',
  'fixer',
] as const;

const MANUAL_AGENT_NAMES = [
  'orchestrator',
  'oracle',
  'designer',
  'explorer',
  'librarian',
  'fixer',
] as const;

export const ProviderModelIdSchema = z
  .string()
  .regex(
    /^[^/\s]+\/[^\s]+$/,
    'Expected provider/model format (provider/.../model)',
  );

export const ManualAgentPlanSchema = z
  .object({
    primary: ProviderModelIdSchema,
    fallback1: ProviderModelIdSchema,
    fallback2: ProviderModelIdSchema,
    fallback3: ProviderModelIdSchema,
  })
  .superRefine((value, ctx) => {
    const unique = new Set([
      value.primary,
      value.fallback1,
      value.fallback2,
      value.fallback3,
    ]);
    if (unique.size !== 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'primary and fallbacks must be unique per agent',
      });
    }
  });

export const ManualPlanSchema = z
  .object({
    orchestrator: ManualAgentPlanSchema,
    oracle: ManualAgentPlanSchema,
    designer: ManualAgentPlanSchema,
    explorer: ManualAgentPlanSchema,
    librarian: ManualAgentPlanSchema,
    fixer: ManualAgentPlanSchema,
  })
  .strict();

export type ManualAgentName = (typeof MANUAL_AGENT_NAMES)[number];
export type ManualAgentPlan = z.infer<typeof ManualAgentPlanSchema>;
export type ManualPlan = z.infer<typeof ManualPlanSchema>;

const AgentModelChainSchema = z.array(z.string()).min(1);

const FallbackChainsSchema = z
  .object({
    orchestrator: AgentModelChainSchema.optional(),
    oracle: AgentModelChainSchema.optional(),
    designer: AgentModelChainSchema.optional(),
    explorer: AgentModelChainSchema.optional(),
    librarian: AgentModelChainSchema.optional(),
    fixer: AgentModelChainSchema.optional(),
  })
  .catchall(AgentModelChainSchema);

export type FallbackAgentName = (typeof FALLBACK_AGENT_NAMES)[number];

// Agent override configuration (distinct from SDK's AgentConfig)
export const AgentOverrideConfigSchema = z
  .object({
    model: z
      .union([
        z.string(),
        z
          .array(
            z.union([
              z.string(),
              z.object({
                id: z.string(),
                variant: z.string().optional(),
              }),
            ]),
          )
          .min(1),
      ])
      .optional(),
    temperature: z.number().min(0).max(2).optional(),
    variant: z.string().optional().catch(undefined),
    skills: z.array(z.string()).optional(), // skills this agent can use ("*" = all, "!item" = exclude)
    mcps: z.array(z.string()).optional(), // MCPs this agent can use ("*" = all, "!item" = exclude)
    prompt: z.string().min(1).optional(),
    orchestratorPrompt: z.string().min(1).optional(),
    options: z.record(z.string(), z.unknown()).optional(), // provider-specific model options (e.g., textVerbosity, thinking budget)
    displayName: z.string().min(1).optional(),
  })
  .strict();

// Multiplexer type options
export const MultiplexerTypeSchema = z.enum(['auto', 'tmux', 'zellij', 'none']);
export type MultiplexerType = z.infer<typeof MultiplexerTypeSchema>;

// Layout options (shared across multiplexers)
export const MultiplexerLayoutSchema = z.enum([
  'main-horizontal', // Main pane on top, agents stacked below
  'main-vertical', // Main pane on left, agents stacked on right
  'tiled', // All panes equal size grid
  'even-horizontal', // All panes side by side
  'even-vertical', // All panes stacked vertically
]);

export type MultiplexerLayout = z.infer<typeof MultiplexerLayoutSchema>;

// Legacy Tmux layout options (for backward compatibility)
export const TmuxLayoutSchema = MultiplexerLayoutSchema;
export type TmuxLayout = MultiplexerLayout;

// Multiplexer integration configuration (new unified config)
export const MultiplexerConfigSchema = z.object({
  type: MultiplexerTypeSchema.default('none'),
  layout: MultiplexerLayoutSchema.default('main-vertical'),
  main_pane_size: z.number().min(20).max(80).default(60), // percentage for main pane
});

export type MultiplexerConfig = z.infer<typeof MultiplexerConfigSchema>;

// Legacy Tmux integration configuration (for backward compatibility)
// When tmux.enabled is true, it's equivalent to multiplexer.type = 'tmux'
export const TmuxConfigSchema = z.object({
  enabled: z.boolean().default(false),
  layout: TmuxLayoutSchema.default('main-vertical'),
  main_pane_size: z.number().min(20).max(80).default(60), // percentage for main pane
});

export type TmuxConfig = z.infer<typeof TmuxConfigSchema>;

export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>;

/** Normalized model entry with optional per-model variant. */
export type ModelEntry = { id: string; variant?: string };

export const PresetSchema = z.record(z.string(), AgentOverrideConfigSchema);

export type Preset = z.infer<typeof PresetSchema>;

// Websearch provider configuration
export const WebsearchConfigSchema = z.object({
  provider: z.enum(['exa', 'tavily']).default('exa'),
});
export type WebsearchConfig = z.infer<typeof WebsearchConfigSchema>;

// MCP names
export const McpNameSchema = z.enum([
  'websearch',
  'context7',
  'grep_app',
  'arxiv_mcp',
  'browser_puppeteer',
  'chrome_devtools_mcp',
  'deepwiki_mcp',
  'open_websearch_mcp',
  'paper_search_mcp',
  'semantic_scholar_fastmcp',
  'bioNext',
  'uniprot',
  'extendaiLab',
  'cua_driver',
]);
export type McpName = z.infer<typeof McpNameSchema>;

export const InterviewConfigSchema = z.object({
  maxQuestions: z.number().int().min(1).max(10).default(2),
  outputFolder: z.string().min(1).default('interview'),
  autoOpenBrowser: z
    .boolean()
    .default(true)
    .describe(
      'Automatically open the interview UI in your default browser during interactive runs. Disabled automatically in tests and CI.',
    ),
  port: z.number().int().min(0).max(65535).default(0),
  dashboard: z.boolean().default(false),
});

export type InterviewConfig = z.infer<typeof InterviewConfigSchema>;

export const SessionManagerConfigSchema = z.object({
  maxSessionsPerAgent: z.number().int().min(1).max(10).default(2),
  readContextMinLines: z.number().int().min(0).max(1000).default(10),
  readContextMaxFiles: z.number().int().min(0).max(50).default(8),
});

export type SessionManagerConfig = z.infer<typeof SessionManagerConfigSchema>;

export const RuntimeTargetConfigSchema = z.object({
  enabled: z.boolean().default(false),
  configPath: z.string().min(1).optional(),
  priority: z.number().int().min(0).max(100).default(50),
  capabilities: z.array(z.string()).optional(),
});

export const RuntimeTargetsConfigSchema = z.object({
  opencode: RuntimeTargetConfigSchema.optional(),
  claude: RuntimeTargetConfigSchema.optional(),
  openclaude: RuntimeTargetConfigSchema.optional(),
  codex: RuntimeTargetConfigSchema.optional(),
});

export type RuntimeTargetsConfig = z.infer<typeof RuntimeTargetsConfigSchema>;

export const CompatProvidersConfigSchema = z.object({
  enabled: z.boolean().default(false),
  autoDetect: z.boolean().default(true),
  fallbackToOpenCodeOnly: z.boolean().default(true),
});

export type CompatProvidersConfig = z.infer<typeof CompatProvidersConfigSchema>;

// Todo continuation configuration
export const TodoContinuationConfigSchema = z.object({
  maxContinuations: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .describe(
      'Maximum consecutive auto-continuations before stopping (default 100). For open-ended goals, use 500+ with autoReviewModel.',
    ),
  autoReviewModel: z
    .string()
    .optional()
    .describe(
      'Optional separate model for auto-review (e.g., "opencode-go/deepseek-v4-flash"). Defaults to the orchestrator\'s own model when unset.',
    ),
  cooldownMs: z
    .number()
    .int()
    .min(0)
    .max(30_000)
    .default(3000)
    .describe('Delay in ms before auto-continuing (gives user time to abort)'),
  autoEnable: z
    .boolean()
    .default(true)
    .describe(
      'Automatically enable auto-continue when the orchestrator session has enough todos',
    ),
  autoEnableThreshold: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(1)
    .describe(
      'Number of todos that triggers auto-enable (only used when autoEnable is true)',
    ),
});

export type TodoContinuationConfig = z.infer<
  typeof TodoContinuationConfigSchema
>;

// Loop Engineering configuration
export const LoopConfigSchema = z.object({
  defaultMaxIterations: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(12)
    .describe(
      'Default maximum iterations for /ol-loop-start (default 12). Can be overridden per-command with --iterations N.',
    ),
  taskGateReentryCap: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(3)
    .describe(
      'Maximum re-entries allowed by the task stop-gate before forcing stop (default 3 for main session).',
    ),
});

export type LoopConfig = z.infer<typeof LoopConfigSchema>;

// Checkpoint cleanup configuration
export const CheckpointCleanupConfigSchema = z.object({
  enabled: z
    .boolean()
    .default(true)
    .describe('Enable automatic checkpoint cleanup on startup'),
  maxAgeMs: z
    .number()
    .int()
    .min(0)
    .default(30 * 24 * 60 * 60 * 1000)
    .describe('Maximum age of checkpoints in milliseconds (default: 30 days)'),
  maxCheckpointsPerSession: z
    .number()
    .int()
    .min(1)
    .default(50)
    .describe('Maximum number of checkpoints to keep per session'),
  maxTotalSizeMb: z
    .number()
    .min(0)
    .default(100)
    .describe('Maximum total size of checkpoint storage in MB (0 = unlimited)'),
});

export type CheckpointCleanupConfig = z.infer<
  typeof CheckpointCleanupConfigSchema
>;

// Bio Skills configuration (on-demand loading)
export const BioSkillsConfigSchema = z.object({
  enabled: z
    .boolean()
    .default(false)
    .describe('Enable bio skills catalog and on-demand loading'),
  repoPath: z
    .string()
    .optional()
    .describe(
      'Path to bioSkills repository. Defaults to bundled resources/bioSkills in the plugin package, falling back to legacy Future/clone/bioSkills',
    ),
  allowedAgents: z
    .array(z.string())
    .default(['*'])
    .describe(
      'Agents that can see bio skills catalog. Default ["*"] = all agents',
    ),
});

export type BioSkillsConfig = z.infer<typeof BioSkillsConfigSchema>;

// Compression configuration (global toggle)
const CompressionThresholdsSchema = z.object({
  l1: z
    .number()
    .gt(0)
    .lt(1)
    .default(0.5)
    .describe('L1 context-pressure ratio threshold (0-1)'),
  l2: z
    .number()
    .gt(0)
    .lt(1)
    .default(0.65)
    .describe('L2 context-pressure ratio threshold (0-1)'),
  l3: z
    .number()
    .gt(0)
    .lt(1)
    .default(0.8)
    .describe('L3 context-pressure ratio threshold (0-1)'),
});

export const CompressionConfigSchema = z.object({
  enabled: z
    .boolean()
    .default(false)
    .describe(
      'Enable context-pressure awareness and automatic checkpoint/compression guidance',
    ),
  strategy: z
    .enum(['auto', 'manual', 'hybrid'])
    .default('auto')
    .describe(
      'Compression strategy: auto (automatic), manual (user-triggered), hybrid (both)',
    ),
  thresholdTokens: z
    .number()
    .min(1000)
    .default(100000)
    .describe('Token threshold to trigger automatic compression'),
  preserveRecent: z
    .number()
    .min(1)
    .default(10)
    .describe('Number of recent messages to preserve from compression'),
  profiles: z
    .object({
      engineering: CompressionThresholdsSchema.default({
        l1: 0.5,
        l2: 0.65,
        l3: 0.8,
      }).describe(
        'Context-pressure thresholds for engineer/default workflows. Uses actual host-reported context limits rather than guessing model sizes.',
      ),
      bio: CompressionThresholdsSchema.default({
        l1: 0.55,
        l2: 0.7,
        l3: 0.85,
      }).describe(
        'Context-pressure thresholds for biological-science workflows. Uses actual host-reported context limits rather than guessing model sizes.',
      ),
    })
    .optional()
    .describe(
      'Optional per-profile L1/L2/L3 ratios. Ratios are applied to the actual context limit reported by OpenCode for the current provider/model/session.',
    ),
});

export type CompressionConfig = z.infer<typeof CompressionConfigSchema>;

// Thinking floor configuration
export const ThinkingFloorConfigSchema = z.object({
  enabled: z
    .boolean()
    .default(true)
    .describe(
      'Enable thinking floor enforcement. Ensures models always operate with sufficient thinking depth. Default: true.',
    ),
  floor: z
    .enum(['none', 'low', 'medium', 'high', 'xhigh', 'max'])
    .default('high')
    .describe(
      'Minimum reasoning effort level. Models below this level will be upgraded. Default: high.',
    ),
  minBudgetTokens: z
    .number()
    .min(1000)
    .default(10000)
    .describe(
      'Minimum budgetTokens for Anthropic thinking when floor is active. Default: 10000.',
    ),
});

export type ThinkingFloorConfig = z.infer<typeof ThinkingFloorConfigSchema>;

// Model profile presets (7 options)
export const ModelProfileSchema = z.enum([
  'free',
  'ds-first',
  'openai',
  'openai-go',
  'ds-mimo',
  '3-mix',
  'custom',
]);
export type ModelProfile = z.infer<typeof ModelProfileSchema>;

// Per-agent custom model config (only active when profile=custom)
export const CustomAgentModelSchema = z.object({
  model: z.string().describe('provider/model-id format'),
  variant: z
    .string()
    .optional()
    .describe('reasoning effort: low/medium/high/xhigh/max'),
  fallback: z.array(z.string()).optional().describe('fallback model chain'),
});
export type CustomAgentModel = z.infer<typeof CustomAgentModelSchema>;

export const CustomModelsSchema = z.record(z.string(), CustomAgentModelSchema);
export type CustomModels = z.infer<typeof CustomModelsSchema>;

// Role capability buckets for role-aware model presets (Phase 9)
export const RoleCapabilitySchema = z.enum([
  'leader',
  'planner',
  'executor',
  'search',
  'research',
  'implement',
  'review',
  'team_lead',
  'team_member',
]);
export type RoleCapability = z.infer<typeof RoleCapabilitySchema>;

export const CapabilityTendencySchema = z.enum([
  'reasoning',
  'coding',
  'search',
  'writing',
  'summarization',
  'long_context',
  'vision',
  'low_cost',
]);
export type CapabilityTendency = z.infer<typeof CapabilityTendencySchema>;

export const RoleMappingSchema = z.object({
  role: RoleCapabilitySchema,
  model: z.string().describe('provider/model-id for this role'),
  fallback: z.array(z.string()).optional().describe('fallback model chain'),
  capabilities: z
    .array(CapabilityTendencySchema)
    .optional()
    .describe('what this model is good at'),
});
export type RoleMapping = z.infer<typeof RoleMappingSchema>;

// Model preferences configuration (global model override)
export const ModelPreferencesConfigSchema = z.object({
  enabled: z
    .boolean()
    .default(true)
    .describe(
      'Enable model preferences. When false (default free mode), no model binding or recommendations.',
    ),
  profile: ModelProfileSchema.optional()
    .default('free')
    .describe(
      'Model profile preset: free (no binding), ds-first (all DeepSeek), openai (all GPT), openai-go (GPT+DS), ds-mimo (DS+mimo), 3-mix (3-model mix), custom (user-defined)',
    ),
  customModels: CustomModelsSchema.optional().describe(
    'Per-agent custom model config (only active when profile=custom)',
  ),
  customModel: z
    .string()
    .optional()
    .describe(
      'Default model for all agents when enabled (provider/model format). Per-agent overrides take precedence.',
    ),
  perAgent: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional()
    .describe(
      'Per-agent model overrides (agent name → model id). Kept for backward compatibility.',
    ),
  roleMappings: z
    .array(RoleMappingSchema)
    .optional()
    .describe(
      'Role-aware model mappings for capability-based routing. Maps roles (leader, planner, executor, etc.) to provider/model with capability tendencies.',
    ),
});

export type ModelPreferencesConfig = z.infer<
  typeof ModelPreferencesConfigSchema
>;

// Prompt mode configuration (heavy/light/turbo)
export const PromptModeConfigSchema = z.object({
  defaultMode: z
    .enum(['heavy', 'light', 'turbo'])
    .default('light')
    .describe(
      'Default prompt mode: heavy (Omo 542 lines), light (OMOS 200-300 lines), turbo (OLD-2 58 lines)',
    ),
  allowModeSwitch: z
    .boolean()
    .default(true)
    .describe(
      'Allow runtime mode switching via /ol-light, /ol-heavy, /ol-turbo commands',
    ),
  applyToAgents: z
    .array(z.string())
    .default([
      'orchestrator',
      'bio-orchestrator',
      'deep-worker',
      'prometheus',
      'atlas',
    ])
    .describe('Agents that use mode system. Default: all primary agents'),
});

export type PromptModeConfig = z.infer<typeof PromptModeConfigSchema>;

export const FailoverConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timeoutMs: z.number().min(0).default(15000),
  retryDelayMs: z.number().min(0).default(500),
  chains: FallbackChainsSchema.default({}),
  retry_on_empty: z
    .boolean()
    .default(true)
    .describe(
      'When true (default), empty provider responses are treated as failures, ' +
        'triggering fallback/retry. Set to false to treat them as successes.',
    ),
});

export type FailoverConfig = z.infer<typeof FailoverConfigSchema>;

function validateCustomOnlyPromptFields(
  overrides: Record<string, z.infer<typeof AgentOverrideConfigSchema>>,
  ctx: z.RefinementCtx,
  pathPrefix: Array<string | number>,
): void {
  for (const [name, override] of Object.entries(overrides)) {
    const isBuiltInOrAlias =
      (ALL_AGENT_NAMES as readonly string[]).includes(name) ||
      AGENT_ALIASES[name] !== undefined;

    if (!isBuiltInOrAlias) {
      continue;
    }

    if (override.prompt !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...pathPrefix, name, 'prompt'],
        message: 'prompt is only supported for custom agents',
      });
    }

    if (override.orchestratorPrompt !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...pathPrefix, name, 'orchestratorPrompt'],
        message: 'orchestratorPrompt is only supported for custom agents',
      });
    }
  }
}

export const PluginConfigSchema = z
  .object({
    preset: z.string().optional(),
    setDefaultAgent: z.boolean().optional(),
    defaultAgentName: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Preferred default agent name used only when default_agent is not already configured. Defaults to engineer.',
      ),
    defaultVisibleAgent: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Deprecated alias for defaultAgentName. Used only when default_agent is not already configured.',
      ),
    preferredVisibleAgent: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Visible primary agent to place first in UI ordering without changing default_agent. Use this to make one expert more prominent while keeping engineer as the default agent.',
      ),
    scoringEngineVersion: z.enum(['v1', 'v2-shadow', 'v2']).optional(),
    balanceProviderUsage: z.boolean().optional(),
    autoUpdate: z
      .boolean()
      .optional()
      .describe(
        'Disable automatic installation of plugin updates when false. Defaults to true.',
      ),
    manualPlan: ManualPlanSchema.optional(),
    presets: z.record(z.string(), PresetSchema).optional(),
    agents: z.record(z.string(), AgentOverrideConfigSchema).optional(),
    disabled_agents: z
      .array(z.string())
      .optional()
      .describe(
        'Agent names to disable completely. ' +
          'Disabled agents are not instantiated and cannot be delegated to. ' +
          'Orchestrator and council internal agents (councillor) cannot be disabled. ' +
          "By default, 'observer' is disabled. Remove it from this list and configure a vision-capable model to enable.",
      ),
    disabled_mcps: z.array(z.string()).optional(),
    enabled_mcps: z
      .array(z.string())
      .optional()
      .describe(
        'Opt in to built-in MCP servers that are shipped disabled by default. ' +
          'Use this for slow or environment-sensitive local MCPs such as semantic_scholar_fastmcp.',
      ),
    // Multiplexer config (new unified config - preferred)
    multiplexer: MultiplexerConfigSchema.optional(),
    // Legacy tmux config (for backward compatibility)
    // When tmux.enabled is true, it's equivalent to multiplexer.type = 'tmux'
    tmux: TmuxConfigSchema.optional(),
    websearch: WebsearchConfigSchema.optional(),
    interview: InterviewConfigSchema.optional(),
    sessionManager: SessionManagerConfigSchema.optional(),
    runtimeTargets: RuntimeTargetsConfigSchema.optional(),
    compatProviders: CompatProvidersConfigSchema.optional(),
    todoContinuation: TodoContinuationConfigSchema.optional(),
    loop: LoopConfigSchema.optional(),
    checkpoint: CheckpointCleanupConfigSchema.optional(),
    bioSkills: BioSkillsConfigSchema.optional(),
    compression: CompressionConfigSchema.optional(),
    thinkingFloor: ThinkingFloorConfigSchema.optional(),
    modelPreferences: ModelPreferencesConfigSchema.optional(),
    promptMode: PromptModeConfigSchema.optional(),
    fallback: FailoverConfigSchema.optional(),
    hide_upstream_agents: z
      .object({
        plan: z.boolean().default(true),
        build: z.boolean().default(true),
      })
      .optional()
      .describe(
        'Hide OpenCode built-in agents (plan, build) from UI. ' +
          'Default: both hidden. Set to false to show them.',
      ),
    council: CouncilConfigSchema.optional(),
    team_mode: TeamModeConfigSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.agents) {
      validateCustomOnlyPromptFields(value.agents, ctx, ['agents']);
    }

    if (value.presets) {
      for (const [presetName, preset] of Object.entries(value.presets)) {
        validateCustomOnlyPromptFields(preset, ctx, ['presets', presetName]);
      }
    }
  });

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// Agent names - re-exported from constants for convenience
export type { AgentName } from './constants';

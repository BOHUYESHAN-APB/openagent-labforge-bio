import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from '@opencode-ai/plugin';
import { createAgents, getAgentConfigs, getDisabledAgents } from './agents';
import { buildOrchestratorPrompt } from './agents/orchestrator';
import {
  ATLAS_HEAVY_PROMPT,
  ATLAS_TURBO_PROMPT,
  BIO_ORCHESTRATOR_HEAVY_PROMPT,
  BIO_ORCHESTRATOR_TURBO_PROMPT,
  DEEP_WORKER_HEAVY_PROMPT,
  DEEP_WORKER_TURBO_PROMPT,
  ORCHESTRATOR_HEAVY_PROMPT,
  ORCHESTRATOR_TURBO_PROMPT,
  PROMETHEUS_HEAVY_PROMPT,
  PROMETHEUS_TURBO_PROMPT,
} from './agents/prompts/index.js';
import {
  BioSkillsSessionManager,
  createLoadBioSkillsTool,
  formatCatalogForPrompt,
  formatLoadedSkillsForPrompt,
  scanBioSkillsCatalog,
} from './bio-skills';
import {
  TemplateSkillsSessionManager,
  buildTemplateCatalog,
  createLoadSkillTemplateTool,
  formatTemplateCatalogForPrompt,
} from './template-skills';
import { CheckpointManager } from './checkpoint';
import {
  CANCEL_RALPH_TEMPLATE,
  CHECKPOINT_RESUME_TEMPLATE,
  CHECKPOINT_TEMPLATE,
  DIAGNOSE_TEMPLATE,
  GRILL_TEMPLATE,
  HANDOFF_TEMPLATE,
  KARPATHY_TEMPLATE,
  RALPH_LOOP_TEMPLATE,
  REVIEW_TEMPLATE,
  SIMPLIFY_TEMPLATE,
  START_WORK_TEMPLATE,
  STOP_CONTINUATION_TEMPLATE,
  TDD_TEMPLATE,
} from './commands/index.js';
import {
  type AgentOverrideConfig,
  applyDefaultAgent,
  deepMerge,
  ensureGlobalPluginConfigFile,
  loadPluginConfig,
  type MultiplexerConfig,
  PACKAGE_NAME,
} from './config';
import { parseList } from './config/agent-mcps';
import { AGENT_ALIASES } from './config/constants';
import {
  getActiveRuntimePreset,
  getPreviousRuntimePreset,
  setActiveRuntimePreset,
} from './config/runtime-preset';
import { CouncilManager } from './council';
import {
  createApplyPatchHook,
  createAutoUpdateCheckerHook,
  createChatHeadersHook,
  createCompactionHook,
  createContextPressureHook,
  createDelegateTaskRetryHook,
  createFilterAvailableSkillsHook,
  createFlashEscalationHook,
  createJsonErrorRecoveryHook,
  createMemoryCommandsHook,
  createModeDetectorHook,
  createPhaseReminderHook,
  createPostFileToolNudgeHook,
  createPrefixStabilityHook,
  createSchemaSanitizeHook,
  createSessionGoalHook,
  createStartWorkHook,
  createStormBreakerHook,
  createTaskSessionManagerHook,
  createTodoContinuationHook,
  ForegroundFallbackManager,
} from './hooks';
import { processImageAttachments } from './hooks/image-hook';
import { createThinkingLanguageHook } from './hooks/thinking-language';
import { createInterviewManager } from './interview';
import { createBuiltinMcps } from './mcp';
import {
  getMultiplexer,
  MultiplexerSessionManager,
  startAvailabilityCheck,
} from './multiplexer';
import { getPackageResourceDir, getPackageRoot } from './paths/plugin-paths';
import { createModeCommandHandler } from './prompt-mode/commands.js';
import { PromptModeManager } from './prompt-mode/manager.js';
import { createDeleteGuardHook } from './safety/delete-guard.js';
import {
  ast_grep_replace,
  ast_grep_search,
  createCouncilTool,
  createMediaInventoryTool,
  createMcpToggleTool,
  createPresetManager,
  createSavePlanTool,
  createSubtaskTool,
  createWebfetchTool,
  loadAgentInstructionsTool,
} from './tools';
import { createSaveChangeTool } from './tools/save-change';
import { createSaveExploreTool } from './tools/save-explore';
import { createSaveScratchTool } from './tools/save-scratch';
import { createSubtaskState } from './tools/subtask/state';
import { detectBioTaskTool } from './tools/detect-bio-task.js';
import {
  createTeamCreateTool,
  createTeamDeleteTool,
  createTeamSendTool,
  createTeamTaskCreateTool,
  createTeamTaskListTool,
  createTeamTaskUpdateTool,
  createTeamTaskGetTool,
  createTeamStatusTool,
  createTeamListTool,
  createTeamShutdownRequestTool,
  createTeamApproveShutdownTool,
  createTeamRejectShutdownTool,
} from './features/team-mode/tools/team-tools';
import {
  createDisplayNameMentionRewriter,
  createInternalAgentTextPart,
  resolveRuntimeAgentName,
} from './utils';
import { initLogger, log } from './utils/logger';
import { SubagentDepthTracker } from './utils/subagent-depth';
import { collapseSystemInPlace } from './utils/system-collapse';

const packageRoot = getPackageRoot(import.meta.url);

function resolveBioSkillsRepoPath(
  configuredPath: string | undefined,
  workspaceRoot: string,
): string {
  const candidates = [
    configuredPath,
    getPackageResourceDir(packageRoot, 'bioSkills'),
    join(packageRoot, 'Future', 'clone', 'bioSkills'),
    join(workspaceRoot, 'resources', 'bioSkills'),
    join(workspaceRoot, 'Future', 'clone', 'bioSkills'),
  ].filter((path): path is string => Boolean(path));

  return candidates.find((path) => existsSync(path)) ?? candidates[0];
}

/**
 * Read the extendai-lab config file.
 */
function readExtendaiConfig(): Record<string, unknown> {
  const configPath = join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.config',
    'opencode',
    'extendai-lab.json',
  );

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Write the extendai-lab config file.
 */
function writeExtendaiConfig(config: Record<string, unknown>): void {
  const configPath = join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.config',
    'opencode',
    'extendai-lab.json',
  );

  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Get the allowed agents for a given subagent policy mode.
 */
function getAllowedAgentsForMode(mode: string): string[] {
  const modeAgents: Record<string, string[]> = {
    'ultra-minimal': ['explorer', 'librarian', 'oracle'],
    minimal: ['explorer', 'librarian', 'oracle', 'fixer'],
    full: [
      'explorer',
      'librarian',
      'oracle',
      'fixer',
      'designer',
      'council',
      'reviewer',
    ],
    custom: [], // 从配置文件读取
    'main-only': [], // 不允许子 agent
  };

  return modeAgents[mode] || [];
}

/**
 * Best-effort log to opencode's app logger.
 * Wrapped in try/catch to avoid deadlocking on opencode v1.4.8–v1.4.9
 * where client.app.log() during init triggers a middleware cycle.
 */
async function appLog(
  ctx: Parameters<Plugin>[0],
  level: 'error' | 'warn' | 'info',
  message: string,
): Promise<void> {
  try {
    await ctx.client.app.log({
      body: { service: 'extendai-lab', level, message },
    });
  } catch {
    // client.app.log may deadlock or be unavailable; stderr is the
    // fallback
    const prefix =
      level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'INFO';
    console.error(`[extendai-lab] ${prefix}: ${message}`);
  }
}

/** Minimum expected registrations for a healthy plugin load. */
const HEALTH_CHECK = {
  minAgents: 5,
  minTools: 5,
  minMcps: 1,
} as const;

const SUBAGENT_POLICY_COMMAND = 'ol-subagents';

const SUBAGENT_POLICY_USAGE =
  'Commands: /ol-subagents-UM ultra-minimal, /ol-subagents-M minimal, /ol-subagents-F full, /ol-subagents-C custom, /ol-subagents-MO main-only. Real agent registration changes require config reload/restart.';

const CHECKPOINT_LIGHT_COMMAND = 'ol-checkpoint-light';
const CHECKPOINT_HEAVY_COMMAND = 'ol-checkpoint-heavy';
const CHECKPOINT_RESUME_LATEST_COMMAND = 'ol-checkpoint-resume-latest';
const AUTO_CONTINUE_ON_COMMAND = 'ol-auto-continue-on';
const AUTO_CONTINUE_OFF_COMMAND = 'ol-auto-continue-off';

const SUBAGENT_POLICY_ALIASES = {
  um: 'ultra-minimal',
  ultraminimal: 'ultra-minimal',
  'ultra-minimal': 'ultra-minimal',
  m: 'minimal',
  minimal: 'minimal',
  f: 'full',
  full: 'full',
  c: 'custom',
  custom: 'custom',
  mo: 'main-only',
  'main-only': 'main-only',
  mainonly: 'main-only',
} as const;

type SubagentPolicyMode =
  (typeof SUBAGENT_POLICY_ALIASES)[keyof typeof SUBAGENT_POLICY_ALIASES];

const SUBAGENT_POLICY_COMMAND_MODES = {
  'ol-subagents-UM': 'ultra-minimal',
  'ol-subagents-M': 'minimal',
  'ol-subagents-F': 'full',
  'ol-subagents-C': 'custom',
  'ol-subagents-MO': 'main-only',
} as const satisfies Record<string, SubagentPolicyMode>;

const SUBAGENT_POLICY_COMMAND_DESCRIPTIONS: Record<
  keyof typeof SUBAGENT_POLICY_COMMAND_MODES,
  string
> = {
  'ol-subagents-UM':
    'Subagent policy: UM=ultra-minimal, strict main-agent-first default',
  'ol-subagents-M': 'Subagent policy: M=minimal, cache-first low-agent mode',
  'ol-subagents-F':
    'Subagent policy: F=full registration, but main-agent execution remains default',
  'ol-subagents-C': 'Subagent policy: C=custom, use allowedAgents allowlist',
  'ol-subagents-MO': 'Subagent policy: MO=main-only, disable child sessions',
};

function parseSubagentPolicyMode(
  argument: string | undefined,
): SubagentPolicyMode | undefined {
  const first = argument?.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return undefined;
  return SUBAGENT_POLICY_ALIASES[first as keyof typeof SUBAGENT_POLICY_ALIASES];
}

function getSubagentPolicyModeForCommand(
  command: string,
): SubagentPolicyMode | undefined {
  return SUBAGENT_POLICY_COMMAND_MODES[
    command as keyof typeof SUBAGENT_POLICY_COMMAND_MODES
  ];
}

function registerCommandIfMissing(
  commands: Record<string, unknown>,
  name: string,
  config: Record<string, unknown>,
): void {
  if (!commands[name]) {
    commands[name] = config;
  }
}

function formatSubagentPolicyStatus(
  config: ReturnType<typeof loadPluginConfig>,
  requestedMode?: SubagentPolicyMode,
): string {
  const policy = config.subagentPolicy;
  const mode = policy?.mode ?? 'ultra-minimal';
  const allowed = policy?.allowedAgents?.length
    ? policy.allowedAgents.join(', ')
    : '(none configured)';
  const requestNote = requestedMode
    ? `\nRequested mode: ${requestedMode}\nConfig value: { "subagentPolicy": { "mode": "${requestedMode}" } }\n`
    : '';

  return `[Subagent policy]\n${SUBAGENT_POLICY_USAGE}\n\nActive mode: ${mode}\nAllowed agents: ${allowed}${requestNote}\nRuntime note: this command reports the active policy for the currently loaded plugin instance. Real changes to registered child agents/tools usually require updating config and reloading/restarting the plugin.\n\nExecution rule: the main agent should perform work directly by default. Registered specialists should be treated as local checklists/tooling references first, not automatic child-session targets. Only use real child sessions when the active policy permits it, the work is genuinely parallel or independently judgment-heavy, and the user has explicitly allowed child-session use. When delegation is still worthwhile, put the same shared-prefix snapshot first for every child, then role/task-specific instructions. If shared-context MCP tools are visible, write that same snapshot to the shared session and tell children to read/search it before work. Prefer resuming existing specialist sessions when possible.`;
}

function registerSubagentPolicyCommand(opencodeConfig: {
  command?: Record<string, unknown>;
}): void {
  if (!opencodeConfig.command) {
    opencodeConfig.command = {};
  }
  const commands = opencodeConfig.command;
  registerCommandIfMissing(commands, SUBAGENT_POLICY_COMMAND, {
    template: '',
    description: 'Show active subagent policy and cache guidance',
  });

  for (const [command, mode] of Object.entries(SUBAGENT_POLICY_COMMAND_MODES)) {
    registerCommandIfMissing(commands, command, {
      template: '',
      description:
        SUBAGENT_POLICY_COMMAND_DESCRIPTIONS[
          command as keyof typeof SUBAGENT_POLICY_COMMAND_DESCRIPTIONS
        ],
      metadata: { subagentPolicyMode: mode },
    });
  }
}

function registerCompleteArgumentCommands(opencodeConfig: {
  command?: Record<string, unknown>;
}): void {
  if (!opencodeConfig.command) {
    opencodeConfig.command = {};
  }
  const commands = opencodeConfig.command;

  registerCommandIfMissing(commands, AUTO_CONTINUE_ON_COMMAND, {
    template: '',
    description: 'Enable auto-continuation for current session',
  });
  registerCommandIfMissing(commands, AUTO_CONTINUE_OFF_COMMAND, {
    template: '',
    description: 'Disable auto-continuation for current session',
  });

  registerCommandIfMissing(commands, CHECKPOINT_LIGHT_COMMAND, {
    template: CHECKPOINT_TEMPLATE,
    description:
      'Create light checkpoint for same-session recovery. Add goal text after command if needed.',
    argumentHint: '[goal]',
  });
  registerCommandIfMissing(commands, CHECKPOINT_HEAVY_COMMAND, {
    template: CHECKPOINT_TEMPLATE,
    description:
      'Create heavy checkpoint for cross-session handoff. Add goal text after command if needed.',
    argumentHint: '[goal]',
  });
  registerCommandIfMissing(commands, CHECKPOINT_RESUME_LATEST_COMMAND, {
    template: CHECKPOINT_RESUME_TEMPLATE,
    description: 'Resume from latest checkpoint',
  });
}

/**
 * Probe jsdom at init time so the first webfetch call doesn't fail
 * silently. Logs a warning if jsdom can't be imported or instantiated,
 * but does not throw; the plugin works without webfetch.
 */
async function probeJSDOM(): Promise<string | null> {
  try {
    const { JSDOM } = await import('jsdom');
    new JSDOM('<!DOCTYPE html><html><body>test</body></html>');
    return null;
  } catch (err) {
    return String(err);
  }
}

// Module-level runtime preset tracking. Survives plugin re-inits triggered
// by client.config.update() → Instance.dispose(). When the plugin function
// re-runs, it checks this variable and applies the runtime preset instead
// of the config file's preset. State lives in config/runtime-preset.ts.

const OhMyOpenCodeLite: Plugin = async (ctx) => {
  const sessionId = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  initLogger(sessionId);

  // Declare variables that must survive the try/catch for the return
  // closure. These are set inside the try block.
  let config: ReturnType<typeof loadPluginConfig>;
  let disabledAgents: Set<string>;
  let agentDefs: ReturnType<typeof createAgents>;
  let agents: ReturnType<typeof getAgentConfigs>;
  let mcps: ReturnType<typeof createBuiltinMcps>;
  let modelArrayMap: Record<string, Array<{ id: string; variant?: string }>>;
  let runtimeChains: Record<string, string[]>;
  let multiplexerConfig: MultiplexerConfig;
  let multiplexerEnabled: boolean;
  let depthTracker: SubagentDepthTracker;
  let multiplexerSessionManager: MultiplexerSessionManager;
  let autoUpdateChecker: ReturnType<typeof createAutoUpdateCheckerHook>;
  let phaseReminderHook: ReturnType<typeof createPhaseReminderHook>;
  let contextPressureHook: ReturnType<typeof createContextPressureHook>;
  let compactionHook: ReturnType<typeof createCompactionHook>;
  let filterAvailableSkillsHook: ReturnType<
    typeof createFilterAvailableSkillsHook
  >;
  let sessionAgentMap: Map<string, string>;
  let postFileToolNudgeHook: ReturnType<typeof createPostFileToolNudgeHook>;
  let chatHeadersHook: ReturnType<typeof createChatHeadersHook>;
  let delegateTaskRetryHook: ReturnType<typeof createDelegateTaskRetryHook>;
  let applyPatchHook: ReturnType<typeof createApplyPatchHook>;
  let deleteGuardHook: ReturnType<typeof createDeleteGuardHook>;
  let jsonErrorRecoveryHook: ReturnType<typeof createJsonErrorRecoveryHook>;
  let stormBreakerHook: ReturnType<typeof createStormBreakerHook>;
  let prefixStabilityHook: ReturnType<typeof createPrefixStabilityHook>;
  let schemaSanitizeHook: ReturnType<typeof createSchemaSanitizeHook>;
  let flashEscalationHook: ReturnType<typeof createFlashEscalationHook>;
  let foregroundFallback: ForegroundFallbackManager;
  let todoContinuationHook: ReturnType<typeof createTodoContinuationHook>;
  let taskSessionManagerHook: ReturnType<typeof createTaskSessionManagerHook>;
  let modeDetectorHook: ReturnType<typeof createModeDetectorHook>;
  let thinkingLanguageHook: ReturnType<typeof createThinkingLanguageHook>;
  let interviewManager: ReturnType<typeof createInterviewManager>;
  let presetManager: ReturnType<typeof createPresetManager>;
  let startWorkHook: ReturnType<typeof createStartWorkHook>;
  let memoryCommandsHook: ReturnType<typeof createMemoryCommandsHook>;
  let sessionGoalHook: ReturnType<typeof createSessionGoalHook>;
  let subtaskState: ReturnType<typeof createSubtaskState>;
  let councilTools: Record<string, unknown>;
  let webfetch: ReturnType<typeof createWebfetchTool>;
  let rewriteDisplayNameMentions: ReturnType<
    typeof createDisplayNameMentionRewriter
  >;
  let bioSkillsManager: BioSkillsSessionManager | null = null;
  let templateSkillsManager: TemplateSkillsSessionManager | null = null;
  let checkpointManager: CheckpointManager;
  let promptModeManager: PromptModeManager;
  let modeCommandHandler: ReturnType<typeof createModeCommandHandler>;

  // Counters for post-init health check (set inside try, checked outside)
  let toolCount = 0;

  try {
    ensureGlobalPluginConfigFile();
    config = loadPluginConfig(ctx.directory);

    // Safety net: if a runtime preset was set via /ol-preset command and
    // OpenCode ever fully re-runs the plugin function (not just the
    // config() hook), override config.preset so agents are created with
    // the correct models. Currently only the config() hook re-runs after
    // Instance.dispose(), so this is a defensive guard.
    const runtimePreset = getActiveRuntimePreset();
    if (runtimePreset && config.presets?.[runtimePreset]) {
      config.preset = runtimePreset;
      // Re-merge runtime preset into config.agents (loadPluginConfig
      // already merged the config-file preset, not the runtime one).
      // Runtime preset is override so it wins over config-file preset.
      const presetAgents = config.presets[runtimePreset];
      config.agents = deepMerge(config.agents, presetAgents);
    } else if (runtimePreset) {
      // Preset was deleted from config since last switch — clear stale state
      setActiveRuntimePreset(null);
    }

    disabledAgents = getDisabledAgents(config);
    rewriteDisplayNameMentions = createDisplayNameMentionRewriter(config);
    agentDefs = createAgents(config);
    agents = getAgentConfigs(config);

    // Build a map of agent name → priority model array for runtime
    // fallback. Populated when the user configures model as an array in
    // their plugin config.
    modelArrayMap = {} as Record<
      string,
      Array<{ id: string; variant?: string }>
    >;
    for (const agentDef of agentDefs) {
      if (agentDef._modelArray && agentDef._modelArray.length > 0) {
        modelArrayMap[agentDef.name] = agentDef._modelArray;
      }
    }
    // Build runtime fallback chains for all foreground agents. Each chain
    // is an ordered list of model strings to try when the current model is
    // rate-limited. Seeds from _modelArray entries (when the user
    // configures model as an array), then appends fallback.chains entries.
    runtimeChains = {} as Record<string, string[]>;
    for (const agentDef of agentDefs) {
      if (agentDef._modelArray?.length) {
        runtimeChains[agentDef.name] = agentDef._modelArray.map((m) => m.id);
      }
    }
    if (config.fallback?.enabled !== false) {
      const chains =
        (config.fallback?.chains as Record<string, string[] | undefined>) ?? {};
      for (const [agentName, chainModels] of Object.entries(chains)) {
        if (!chainModels?.length) continue;
        const existing = runtimeChains[agentName] ?? [];
        const seen = new Set(existing);
        for (const m of chainModels) {
          if (!seen.has(m)) {
            seen.add(m);
            existing.push(m);
          }
        }
        runtimeChains[agentName] = existing;
      }
    }

    // Parse multiplexer config with defaults
    multiplexerConfig = {
      type: config.multiplexer?.type ?? 'none',
      layout: config.multiplexer?.layout ?? 'main-vertical',
      main_pane_size: config.multiplexer?.main_pane_size ?? 60,
    };

    // Get multiplexer instance for capability checks
    const multiplexer = getMultiplexer(multiplexerConfig);
    multiplexerEnabled =
      multiplexerConfig.type !== 'none' &&
      multiplexer !== null &&
      multiplexer.isInsideSession();

    log('[plugin] initialized with multiplexer config', {
      multiplexerConfig,
      enabled: multiplexerEnabled,
      directory: ctx.directory,
    });

    // Start background availability check if enabled
    if (multiplexerEnabled) {
      startAvailabilityCheck(multiplexerConfig);
    }

    depthTracker = new SubagentDepthTracker();

    // Initialize council tools (only when council is configured)
    councilTools = config.council
      ? createCouncilTool(
          ctx,
          new CouncilManager(ctx, config, depthTracker, multiplexerEnabled),
        )
      : {};

    mcps = createBuiltinMcps(
      config.disabled_mcps,
      config.enabled_mcps,
      config.websearch,
    );
    webfetch = createWebfetchTool(ctx);

    // Initialize Checkpoint Manager
    checkpointManager = new CheckpointManager(ctx.directory);
    checkpointManager.initializeSession(
      'plugin-root',
      ctx.directory,
      ctx.directory,
      `workspace:${ctx.directory}`,
    );

    // Run checkpoint cleanup on startup
    const cleanupConfig = config.checkpoint ?? {
      enabled: true,
      maxAgeMs: 30 * 24 * 60 * 60 * 1000,
      maxCheckpointsPerSession: 50,
      maxTotalSizeMb: 100,
    };
    checkpointManager.cleanup(cleanupConfig);

    // Initialize Prompt Mode Manager
    const promptModeConfig = config.promptMode ?? {
      defaultMode: 'light' as const,
      allowModeSwitch: true,
      applyToAgents: ['orchestrator', 'bio-orchestrator', 'deep-worker'],
    };
    promptModeManager = new PromptModeManager(promptModeConfig);
    modeCommandHandler = createModeCommandHandler(promptModeManager);

    // Initialize Bio Skills — always try if repo exists
    // The load_bio_skills tool is always registered when catalog is found,
    // so bio-orchestrator can use it without requiring explicit config.
    {
      const repoPath = resolveBioSkillsRepoPath(
        config.bioSkills?.repoPath,
        ctx.directory,
      );
      const catalog = scanBioSkillsCatalog(repoPath);
      if (catalog.length > 0) {
        bioSkillsManager = new BioSkillsSessionManager(catalog);
        log('info', `Bio Skills: ${catalog.length} categories available`);
      } else {
        log('info', 'Bio Skills: no catalog found, load_bio_skills disabled');
      }
    }

    // Initialize Template Skills (HTML templates, academic tools, etc.)
    // These are NOT exposed via configSkills.paths — instead, the AI loads
    // them by category via the load_skill_template tool.
    {
      const templateCatalog = buildTemplateCatalog(packageRoot);
      if (templateCatalog.length > 0) {
        templateSkillsManager = new TemplateSkillsSessionManager(templateCatalog);
        log('info', `Template Skills: ${templateCatalog.length} categories available`);
      } else {
        log('info', 'Template Skills: no categories found');
      }
    }

    // Initialize MultiplexerSessionManager to handle OpenCode's built-in
      // Task tool sessions
      multiplexerSessionManager = new MultiplexerSessionManager(
      ctx,
      multiplexerConfig,
    );

    // Initialize auto-update checker hook
    autoUpdateChecker = createAutoUpdateCheckerHook(ctx, {
      autoUpdate: config.autoUpdate ?? true,
    });

    // Initialize phase reminder hook for workflow compliance
    phaseReminderHook = createPhaseReminderHook();

    // Initialize context pressure hook using OpenCode-native token/context stats
    contextPressureHook = createContextPressureHook(ctx, {
      enabled: config.compression?.enabled !== false,
      profiles: config.compression?.profiles,
    });

    // Initialize compaction hook to replace OpenCode's native compaction prompt
    // with our improved Chinese prompt (combining OpenCode + OpenClaude + Codex)
    // Also auto-creates checkpoint before compaction (checkpoint is compaction's reinforcement board)
    compactionHook = createCompactionHook({
      enabled: config.compression?.enabled !== false,
      checkpointManager,
    });

    // Initialize available skills filter hook
    filterAvailableSkillsHook = createFilterAvailableSkillsHook(ctx, config);

    // Track session → agent mapping for serve-mode system prompt injection
    sessionAgentMap = new Map<string, string>();

    // Initialize post-file-tool nudge hook
    postFileToolNudgeHook = createPostFileToolNudgeHook({
      shouldInject: (sessionID) =>
        sessionAgentMap.get(sessionID) === 'orchestrator',
    });

    chatHeadersHook = createChatHeadersHook(ctx);

    // Initialize delegate-task retry guidance hook
    delegateTaskRetryHook = createDelegateTaskRetryHook(ctx);

    applyPatchHook = createApplyPatchHook(ctx);
    // Initialize delete command safety guard
    deleteGuardHook = createDeleteGuardHook(ctx);
    // Initialize JSON parse error recovery hook
    jsonErrorRecoveryHook = createJsonErrorRecoveryHook(ctx);

    // Initialize storm breaker: suppress repeat-loop tool calls
    stormBreakerHook = createStormBreakerHook(ctx);

    // Initialize prefix stability: SHA-256 drift detection
    prefixStabilityHook = createPrefixStabilityHook(ctx);

    // Initialize schema sanitize: clean deep schemas
    schemaSanitizeHook = createSchemaSanitizeHook(ctx);

    // Initialize flash escalation: auto-escalate on failure
    flashEscalationHook = createFlashEscalationHook(ctx);

    // Initialize foreground fallback manager for runtime model switching
    foregroundFallback = new ForegroundFallbackManager(
      ctx.client,
      runtimeChains,
      config.fallback?.enabled !== false &&
        Object.keys(runtimeChains).length > 0,
    );

    // Initialize todo-continuation hook (opt-in auto-continue for
    // incomplete todos)
    todoContinuationHook = createTodoContinuationHook(ctx, {
      maxContinuations: config.todoContinuation?.maxContinuations ?? 100,
      autoReviewModel: config.todoContinuation?.autoReviewModel,
      cooldownMs: config.todoContinuation?.cooldownMs ?? 3000,
      autoEnable: config.todoContinuation?.autoEnable ?? false,
      autoEnableThreshold: config.todoContinuation?.autoEnableThreshold ?? 4,
      onReviewOutcome: ({ sessionID, verdict, findings }) => {
        checkpointManager.ensureSession(
          sessionID,
          ctx.directory,
          ctx.directory,
          `workspace:${ctx.directory}`,
        );
        checkpointManager.recordReviewOutcome(sessionID, verdict, findings);
      },
      onBatchSummary: ({ sessionID, summary }) => {
        checkpointManager.ensureSession(
          sessionID,
          ctx.directory,
          ctx.directory,
          `workspace:${ctx.directory}`,
        );
        checkpointManager.recordBatchSummary(sessionID, summary);
        checkpointManager.recordAutoPreferenceHint(sessionID, summary);
      },
      onAutoPause: ({ sessionID, reason, details }) => {
        checkpointManager.ensureSession(
          sessionID,
          ctx.directory,
          ctx.directory,
          `workspace:${ctx.directory}`,
        );
        checkpointManager.recordAutoPause(sessionID, reason, details);
      },
      contextPressure: {
        getState: (sessionID) => contextPressureHook.getState(sessionID),
        shouldForceCheckpoint: (sessionID) =>
          contextPressureHook.shouldForceCheckpoint(sessionID),
        getRecommendedStrategy: (sessionID) =>
          contextPressureHook.getRecommendedStrategy(sessionID),
        onForceCheckpoint: ({
          sessionID,
          level,
          ratio,
          totalTokens,
          contextLimit,
          strategy,
        }) => {
          checkpointManager.ensureSession(
            sessionID,
            ctx.directory,
            ctx.directory,
            `workspace:${ctx.directory}`,
          );
          checkpointManager.recordPressureCheckpoint(
            sessionID,
            {
              level,
              ratio,
              totalTokens,
              contextLimit,
            },
            strategy,
          );
        },
      },
    });
    taskSessionManagerHook = createTaskSessionManagerHook(ctx, {
      maxSessionsPerAgent: config.sessionManager?.maxSessionsPerAgent ?? 2,
      readContextMinLines: config.sessionManager?.readContextMinLines ?? 10,
      readContextMaxFiles: config.sessionManager?.readContextMaxFiles ?? 8,
      shouldManageSession: (sessionID) =>
        sessionAgentMap.get(sessionID) === 'orchestrator',
    });
    modeDetectorHook = createModeDetectorHook();
    thinkingLanguageHook = createThinkingLanguageHook();
    interviewManager = createInterviewManager(ctx, config);
    presetManager = createPresetManager(ctx, config);
    startWorkHook = createStartWorkHook(ctx);
    memoryCommandsHook = createMemoryCommandsHook(ctx, checkpointManager);
    sessionGoalHook = createSessionGoalHook(ctx, config, {
      getAgentName: (sessionID) => sessionAgentMap.get(sessionID),
    });
    subtaskState = createSubtaskState();

    toolCount =
      Object.keys(councilTools).length +
      Object.keys(todoContinuationHook.tool).length +
      1 + // media_inventory
      1 + // save_plan
      1 + // webfetch
      2; // ast_grep_search, ast_grep_replace
  } catch (err) {
    // Plugin init failed: log visibly before re-throwing so the user
    // sees something actionable instead of a silent "loaded but empty".
    log('[plugin] FATAL: init failed', String(err));
    await appLog(
      ctx,
      'error',
      `INIT FAILED: ${String(err)}. Report at github.com/BOHUYESHAN-APB/openagent-labforge-bio/issues`,
    );
    throw err;
  }

  // ── Health check: validate registrations ────────────────────────────
  const agentCount = Object.keys(agents).length;
  const mcpCount = Object.keys(mcps).length;
  // Skip MCP threshold when user explicitly disabled all built-in MCPs
  const mcpThreshold =
    config.disabled_mcps && config.disabled_mcps.length > 0
      ? 0
      : HEALTH_CHECK.minMcps;

  if (
    agentCount < HEALTH_CHECK.minAgents ||
    toolCount < HEALTH_CHECK.minTools ||
    mcpCount < mcpThreshold
  ) {
    const msg = [
      'Health check: registrations suspiciously low.',
      `  agents: ${agentCount} (expected >=${HEALTH_CHECK.minAgents})`,
      `  tools:  ${toolCount} (expected >=${HEALTH_CHECK.minTools})`,
      `  mcps:   ${mcpCount} (expected >=${mcpThreshold})`,
      'This usually means a dependency failed to resolve (jsdom, etc).',
      'If you recently updated opencode, see:',
      '  github.com/BOHUYESHAN-APB/openagent-labforge-bio/issues',
    ].join('\n');
    log(`[plugin] WARN: ${msg}`);
    await appLog(ctx, 'warn', msg);
  } else {
    log('[plugin] health check passed', {
      agents: agentCount,
      tools: toolCount,
      mcps: mcpCount,
    });
  }

  // ── Probe jsdom (async, non-blocking) ───────────────────────────────
  // Don't await this; we don't want to block init. The warning will
  // appear shortly after startup if jsdom is broken.
  probeJSDOM().then((err) => {
    if (err) {
      const msg = `jsdom probe failed; webfetch tool will not work: ${err}`;
      log(`[plugin] WARN: ${msg}`);
      appLog(ctx, 'warn', msg).catch(() => {});
    }
  });

  return {
    name: PACKAGE_NAME,

    agent: agents,

    tool: {
      ...councilTools,
      media_inventory: createMediaInventoryTool(ctx),
      save_plan: createSavePlanTool(ctx.directory),
      save_change: createSaveChangeTool(ctx.directory),
      save_explore: createSaveExploreTool(ctx.directory),
      save_scratch: createSaveScratchTool(ctx.directory),
      webfetch,
      ...todoContinuationHook.tool,
      ast_grep_search,
      ast_grep_replace,
      detect_bio_task: detectBioTaskTool,
      load_agent_instructions: loadAgentInstructionsTool,
      subtask: createSubtaskTool(ctx, subtaskState),
      ...(bioSkillsManager
        ? { load_bio_skills: createLoadBioSkillsTool(bioSkillsManager) }
        : {}),
      ...(templateSkillsManager
        ? { load_skill_template: createLoadSkillTemplateTool(templateSkillsManager) }
        : {}),
      mcp_toggle: createMcpToggleTool(ctx.client),
      // Team Mode tools (only registered when team_mode.enabled)
      ...(config.team_mode?.enabled ? {
        team_create: createTeamCreateTool({ config: config.team_mode, ctx }),
        team_delete: createTeamDeleteTool({ config: config.team_mode, ctx }),
        team_send_message: createTeamSendTool({ config: config.team_mode, ctx }),
        team_task_create: createTeamTaskCreateTool({ config: config.team_mode, ctx }),
        team_task_list: createTeamTaskListTool({ config: config.team_mode, ctx }),
        team_task_update: createTeamTaskUpdateTool({ config: config.team_mode, ctx }),
        team_task_get: createTeamTaskGetTool({ config: config.team_mode, ctx }),
        team_status: createTeamStatusTool({ config: config.team_mode, ctx }),
        team_list: createTeamListTool({ config: config.team_mode, ctx }),
        team_shutdown_request: createTeamShutdownRequestTool({ config: config.team_mode, ctx }),
        team_approve_shutdown: createTeamApproveShutdownTool({ config: config.team_mode, ctx }),
        team_reject_shutdown: createTeamRejectShutdownTool({ config: config.team_mode, ctx }),
      } : {}),
    },

    mcp: mcps,

    config: async (opencodeConfig: Record<string, unknown>) => {
      // Only set default_agent if not already configured by the user
      // and the plugin config doesn't explicitly disable this behavior.
      applyDefaultAgent(
        opencodeConfig,
        config.setDefaultAgent !== false,
        config.defaultAgentName || config.defaultVisibleAgent,
      );

      // Merge Agent configs — per-agent shallow merge to preserve
      // user-supplied fields (e.g. tools, permission) from opencode.json
      if (!opencodeConfig.agent) {
        opencodeConfig.agent = { ...agents };
      } else {
        for (const [name, pluginAgent] of Object.entries(agents)) {
          const existing = (opencodeConfig.agent as Record<string, unknown>)[
            name
          ] as Record<string, unknown> | undefined;
          if (existing) {
            // Shallow merge: plugin defaults first, user overrides win
            (opencodeConfig.agent as Record<string, unknown>)[name] = {
              ...pluginAgent,
              ...existing,
            };
          } else {
            (opencodeConfig.agent as Record<string, unknown>)[name] = {
              ...pluginAgent,
            };
          }
        }
      }
      const configAgent = opencodeConfig.agent as Record<string, unknown>;

      // Hide upstream OpenCode "plan" and "build" agents (configurable)
      // Default: both hidden. User can set hide_upstream_agents.plan/build to false to show.
      const hideUpstream = {
        plan: config.hide_upstream_agents?.plan ?? true,
        build: config.hide_upstream_agents?.build ?? true,
      };
      for (const name of ['plan', 'build'] as const) {
        if (hideUpstream[name] && configAgent[name]) {
          configAgent[name] = {
            ...(configAgent[name] as Record<string, unknown>),
            mode: 'subagent',
            hidden: true,
          };
        }
      }

      // Model resolution for foreground agents: combine _modelArray
      // entries with fallback.chains config, then pick the first model in
      // the effective array for startup-time selection.
      //
      // Runtime failover on API errors (e.g. rate limits
      // mid-conversation) is handled separately by
      // ForegroundFallbackManager via the event hook.
      const fallbackChainsEnabled = config.fallback?.enabled !== false;
      const fallbackChains = fallbackChainsEnabled
        ? ((config.fallback?.chains as Record<string, string[] | undefined>) ??
          {})
        : {};

      // Build effective model arrays: seed from _modelArray, then append
      // fallback.chains entries so the resolver considers the full chain
      // when picking the best available provider at startup.
      const effectiveArrays: Record<
        string,
        Array<{ id: string; variant?: string }>
      > = {};

      for (const [agentName, models] of Object.entries(modelArrayMap)) {
        effectiveArrays[agentName] = [...models];
      }

      for (const [agentName, chainModels] of Object.entries(fallbackChains)) {
        if (!chainModels || chainModels.length === 0) continue;

        if (!effectiveArrays[agentName]) {
          // Agent has no _modelArray — seed from its current string model
          // so the fallback chain appends after it rather than replacing
          // it.
          const entry = configAgent[agentName] as
            | Record<string, unknown>
            | undefined;
          const currentModel =
            typeof entry?.model === 'string' ? entry.model : undefined;
          effectiveArrays[agentName] = currentModel
            ? [{ id: currentModel }]
            : [];
        }

        const seen = new Set(effectiveArrays[agentName].map((m) => m.id));
        for (const chainModel of chainModels) {
          if (!seen.has(chainModel)) {
            seen.add(chainModel);
            effectiveArrays[agentName].push({ id: chainModel });
          }
        }
      }

      if (Object.keys(effectiveArrays).length > 0) {
        for (const [agentName, modelArray] of Object.entries(effectiveArrays)) {
          if (modelArray.length === 0) continue;

          // Use the first model in the effective array. Not all providers
          // require entries in opencodeConfig.provider — some are loaded
          // automatically by opencode (e.g. github-copilot, openrouter).
          // We cannot distinguish these from truly unconfigured providers
          // at config-hook time, so we cannot gate on the provider config
          // keys. Runtime failover is handled separately by
          // ForegroundFallbackManager.
          const chosen = modelArray[0];
          const entry = configAgent[agentName] as
            | Record<string, unknown>
            | undefined;
          if (entry) {
            entry.model = chosen.id;
            if (chosen.variant) {
              entry.variant = chosen.variant;
            }
          } else {
            // Agent exists in slim but not in opencodeConfig.agent —
            // create entry
            (configAgent as Record<string, unknown>)[agentName] = {
              model: chosen.id,
              ...(chosen.variant ? { variant: chosen.variant } : {}),
            };
          }
          log('[plugin] resolved model from array', {
            agent: agentName,
            model: chosen.id,
            variant: chosen.variant,
          });
        }
      }

      // Runtime preset override: if /ol-preset switched to a runtime preset,
      // override the model/variant/temperature from the preset's agent
      // config. This runs after the normal model resolution because the
      // config() hook re-runs with stale modelArrayMap after dispose(),
      // but the runtime preset data is in the captured `config` closure.
      const runtimePresetName = getActiveRuntimePreset();
      if (runtimePresetName && config.presets?.[runtimePresetName]) {
        const runtimePreset = config.presets[runtimePresetName];
        for (const [agentName, override] of Object.entries(runtimePreset)) {
          // Resolve legacy alias keys (e.g. "explore" → "explorer")
          // so presets using aliases work in this path.
          const resolvedName = AGENT_ALIASES[agentName] ?? agentName;
          const entry = configAgent[resolvedName] as
            | Record<string, unknown>
            | undefined;
          if (!entry) continue;

          if (typeof override.model === 'string') {
            entry.model = override.model;
          } else if (
            Array.isArray(override.model) &&
            override.model.length > 0
          ) {
            const first = override.model[0];
            entry.model = typeof first === 'string' ? first : first.id;
            // Extract inline variant from array-form model entry
            if (typeof first !== 'string' && first.variant) {
              entry.variant = first.variant;
            }
          }
          // Explicitly set or clear scalar fields so switching from
          // Preset A (which sets a field) to Preset B (which doesn't)
          // doesn't leave stale values behind.
          if (typeof override.variant === 'string') {
            entry.variant = override.variant;
          } else if ('variant' in override) {
            delete entry.variant;
          }
          if (typeof override.temperature === 'number') {
            entry.temperature = override.temperature;
          } else if ('temperature' in override) {
            delete entry.temperature;
          }
          if (
            override.options &&
            typeof override.options === 'object' &&
            !Array.isArray(override.options)
          ) {
            entry.options = override.options;
          } else if ('options' in override) {
            delete entry.options;
          }
          log('[plugin] runtime preset override', {
            preset: runtimePresetName,
            agent: agentName,
            model: entry.model as string,
          });
        }

        // Reset agents from the previous preset that aren't in the new one.
        // The stale model resolution above overwrites the reset values sent
        // by preset-manager, so we re-apply them here from config-file
        // baseline.
        const prevPresetName = getPreviousRuntimePreset();
        if (prevPresetName && config.presets?.[prevPresetName]) {
          const prevPreset = config.presets[prevPresetName];
          // Build resolved key set from new preset for correct comparison
          // (handles alias keys like "explore" → "explorer")
          const newPresetResolved = new Set(
            Object.keys(runtimePreset).map((k) => AGENT_ALIASES[k] ?? k),
          );
          for (const agentName of Object.keys(prevPreset)) {
            const resolvedName = AGENT_ALIASES[agentName] ?? agentName;
            if (newPresetResolved.has(resolvedName)) continue; // new preset handles it
            const entry = configAgent[resolvedName] as
              | Record<string, unknown>
              | undefined;
            if (!entry) continue;
            // Reset to config-file baseline. Use the previous preset's
            // override to identify which fields to clear even when the
            // baseline doesn't define them.
            const baseline = config.agents?.[resolvedName];
            const prevOverride = prevPreset[agentName] as
              | AgentOverrideConfig
              | undefined;
            if (typeof baseline?.model === 'string') {
              entry.model = baseline.model;
            }
            if (typeof baseline?.variant === 'string') {
              entry.variant = baseline.variant;
            } else if (prevOverride && 'variant' in prevOverride) {
              delete entry.variant;
            }
            if (typeof baseline?.temperature === 'number') {
              entry.temperature = baseline.temperature;
            } else if (prevOverride && 'temperature' in prevOverride) {
              delete entry.temperature;
            }
            if (
              baseline?.options &&
              typeof baseline.options === 'object' &&
              !Array.isArray(baseline.options)
            ) {
              entry.options = baseline.options;
            } else if (prevOverride && 'options' in prevOverride) {
              delete entry.options;
            }
            log('[plugin] runtime preset reset from previous', {
              previousPreset: prevPresetName,
              agent: resolvedName,
              model: entry.model as string,
            });
          }
        }
      }

      // Merge MCP configs
      const configMcp = opencodeConfig.mcp as
        | Record<string, unknown>
        | undefined;
      if (!configMcp) {
        opencodeConfig.mcp = { ...mcps };
      } else {
        Object.assign(configMcp, mcps);
      }

      // Get all MCP names from the merged config (built-in + custom)
      const mergedMcpConfig = opencodeConfig.mcp as
        | Record<string, unknown>
        | undefined;
      const allMcpNames = Object.keys(mergedMcpConfig ?? mcps);

      // For each agent, create permission rules based on their mcps list
      for (const [agentName, agentConfig] of Object.entries(agents)) {
        const agentMcps = (agentConfig as { mcps?: string[] })?.mcps;
        if (!agentMcps) continue;

        // Get or create agent permission config
        if (!configAgent[agentName]) {
          configAgent[agentName] = { ...agentConfig };
        }
        const agentConfigEntry = configAgent[agentName] as Record<
          string,
          unknown
        >;
        const agentPermission = (agentConfigEntry.permission ?? {}) as Record<
          string,
          unknown
        >;

        // Parse mcps list with wildcard and exclusion support
        const allowedMcps = parseList(agentMcps, allMcpNames);

        // Create permission rules for each MCP
        // MCP tools are named as <server>_<tool>, so we use <server>_*
        for (const mcpName of allMcpNames) {
          const sanitizedMcpName = mcpName.replace(/[^a-zA-Z0-9_-]/g, '_');
          const permissionKey = `${sanitizedMcpName}_*`;
          const action = allowedMcps.includes(mcpName) ? 'allow' : 'deny';

          // Only set if not already defined by user
          if (!(permissionKey in agentPermission)) {
            agentPermission[permissionKey] = action;
          }
        }

        // Update agent config with permissions
        agentConfigEntry.permission = agentPermission;
      }

      // Register /ol-auto-continue command so OpenCode recognizes it.
      // Actual handling is done by command.execute.before hook below
      // (no LLM round-trip — injected directly into output.parts).
      const configCommand = opencodeConfig.command as
        | Record<string, unknown>
        | undefined;
      if (!configCommand?.['ol-auto-continue']) {
        if (!opencodeConfig.command) {
          opencodeConfig.command = {};
        }
        (opencodeConfig.command as Record<string, unknown>)[
          'ol-auto-continue'
        ] = {
          template: 'Call the auto_continue tool with enabled=true',
          description:
            'Enable auto-continuation — orchestrator keeps working through incomplete todos',
          argumentHint: '[on|off]',
        };
      }

      interviewManager.registerCommand(opencodeConfig);
      presetManager.registerCommand(opencodeConfig);
      memoryCommandsHook.registerCommands(opencodeConfig);
      sessionGoalHook.registerCommand(opencodeConfig);
      registerSubagentPolicyCommand(
        opencodeConfig as { command?: Record<string, unknown> },
      );
      registerCompleteArgumentCommands(
        opencodeConfig as { command?: Record<string, unknown> },
      );

      // Register prompt mode commands (/ol-light, /ol-heavy, /ol-turbo)
      modeCommandHandler.registerCommand(opencodeConfig);

      // Register builtin skills path
      const skillsPath = join(packageRoot, 'src/skills');
      if (!opencodeConfig.skills) {
        opencodeConfig.skills = {};
      }
      const configSkills = opencodeConfig.skills as {
        paths?: string[];
        urls?: string[];
      };
      if (!configSkills.paths) {
        configSkills.paths = [];
      }
      if (!configSkills.paths.includes(skillsPath)) {
        configSkills.paths.push(skillsPath);
      }

      // NOTE: ThirdParty skills (html-anything-skills, html-ppt-skill,
      // guizang-ppt-skill) and academicSkills are NOT registered here.
      // They are loaded on-demand via the load_skill_template tool by category.
      // This keeps the user-facing skill list clean.

      // Allow reading bundled bioSkills even when OpenCode runs in another
      // project. These are plugin-owned reference files, not project files.
      if (bioSkillsManager) {
        const bioSkillsPath = resolveBioSkillsRepoPath(
          config.bioSkills?.repoPath,
          ctx.directory,
        );
        const permission = (opencodeConfig.permission ?? {}) as Record<
          string,
          unknown
        >;
        const externalDirectory =
          typeof permission.external_directory === 'object' &&
          permission.external_directory !== null
            ? (permission.external_directory as Record<string, string>)
            : {};
        externalDirectory[join(bioSkillsPath, '*')] ??= 'allow';
        externalDirectory[join(bioSkillsPath, '**', '*')] ??= 'allow';
        permission.external_directory = externalDirectory;
        opencodeConfig.permission = permission;
      }

      // Allow reading bundled academicSkills and ThirdParty skills
      // (needed by load_skill_template tool even though not in configSkills.paths)
      {
        const academicSkillsPath = join(packageRoot, 'resources/academicSkills');
        const thirdPartyPaths = [
          join(packageRoot, 'ThirdParty', 'html-anything-skills'),
          join(packageRoot, 'ThirdParty', 'html-ppt-skill'),
          join(packageRoot, 'ThirdParty', 'guizang-ppt-skill'),
        ];
        const permission2 = (opencodeConfig.permission ?? {}) as Record<
          string,
          unknown
        >;
        const externalDirectory2 =
          typeof permission2.external_directory === 'object' &&
          permission2.external_directory !== null
            ? (permission2.external_directory as Record<string, string>)
            : {};
        externalDirectory2[join(academicSkillsPath, '*')] ??= 'allow';
        externalDirectory2[join(academicSkillsPath, '**', '*')] ??= 'allow';
        for (const tpPath of thirdPartyPaths) {
          externalDirectory2[join(tpPath, '*')] ??= 'allow';
          externalDirectory2[join(tpPath, '**', '*')] ??= 'allow';
        }
        permission2.external_directory = externalDirectory2;
        opencodeConfig.permission = permission2;
      }

      // Register checkpoint commands (/ol-checkpoint, /ol-handoff, /ol-checkpoint-resume)
      if (!configCommand?.['ol-checkpoint']) {
        (opencodeConfig.command as Record<string, unknown>)['ol-checkpoint'] = {
          template: CHECKPOINT_TEMPLATE,
          description:
            'Create durable checkpoint (light: same-session recovery, heavy: cross-session handoff)',
          argumentHint: '[l|h|light|heavy] [goal]',
        };
      }
      if (!configCommand?.['ol-handoff']) {
        (opencodeConfig.command as Record<string, unknown>)['ol-handoff'] = {
          template: HANDOFF_TEMPLATE,
          description: 'Create context summary for new session',
          argumentHint: '[goal]',
        };
      }
      if (!configCommand?.['ol-checkpoint-resume']) {
        (opencodeConfig.command as Record<string, unknown>)[
          'ol-checkpoint-resume'
        ] = {
          template: CHECKPOINT_RESUME_TEMPLATE,
          description: 'Resume from checkpoint in current session',
          argumentHint: '[latest|session-id|path]',
        };
      }

      // Register workflow commands (/ol-start-work, /ol-ralph-loop, /ol-cancel-ralph, /ol-stop-continuation)
      if (!configCommand?.['ol-start-work']) {
        (opencodeConfig.command as Record<string, unknown>)['ol-start-work'] = {
          template: START_WORK_TEMPLATE,
          description: 'Start work session from planner-saved plan',
          argumentHint: '[plan-name] [--worktree <path>]',
        };
      }
      if (!configCommand?.['ol-ralph-loop']) {
        (opencodeConfig.command as Record<string, unknown>)['ol-ralph-loop'] = {
          template: RALPH_LOOP_TEMPLATE,
          description: 'Start self-referential loop until task completion',
          argumentHint: '"task description" [--max-iterations=N]',
        };
      }
      if (!configCommand?.['ol-cancel-ralph']) {
        (opencodeConfig.command as Record<string, unknown>)['ol-cancel-ralph'] =
          {
            template: CANCEL_RALPH_TEMPLATE,
            description: 'Cancel active Ralph Loop',
          };
      }
      if (!configCommand?.['ol-stop-continuation']) {
        (opencodeConfig.command as Record<string, unknown>)[
          'ol-stop-continuation'
        ] = {
          template: STOP_CONTINUATION_TEMPLATE,
          description: 'Stop all continuation mechanisms for current session',
        };
      }
      if (!configCommand?.['ol-karpathy']) {
        (opencodeConfig.command as Record<string, unknown>)['ol-karpathy'] = {
          template: KARPATHY_TEMPLATE,
          description:
            'Apply Karpathy coding guidelines: assumptions, simplicity, surgical diffs, verifiable goals',
          argumentHint: '[task-or-review-target]',
        };
      }
      if (!configCommand?.['ol-grill']) {
        (opencodeConfig.command as Record<string, unknown>)['ol-grill'] = {
          template: GRILL_TEMPLATE,
          description:
            'Get interviewed about your plan before coding — resolve all ambiguity first',
          argumentHint: '[topic]',
        };
      }
      if (!configCommand?.['ol-tdd']) {
        (opencodeConfig.command as Record<string, unknown>)['ol-tdd'] = {
          template: TDD_TEMPLATE,
          description:
            'Test-driven development: write failing test first, then implement',
          argumentHint: '[feature-description]',
        };
      }
      if (!configCommand?.['ol-diagnose']) {
        (opencodeConfig.command as Record<string, unknown>)['ol-diagnose'] = {
          template: DIAGNOSE_TEMPLATE,
          description:
            'Disciplined diagnosis loop for bugs and performance issues',
          argumentHint: '[bug-description]',
        };
      }
      if (!configCommand?.['ol-simplify']) {
        (opencodeConfig.command as Record<string, unknown>)['ol-simplify'] = {
          template: SIMPLIFY_TEMPLATE,
          description:
            'Simplify code for clarity without changing behavior',
          argumentHint: '[file-or-function]',
        };
      }
      if (!configCommand?.['ol-review']) {
        (opencodeConfig.command as Record<string, unknown>)['ol-review'] = {
          template: REVIEW_TEMPLATE,
          description:
            'Code review with severity classification (Critical/Major/Minor/Suggestion)',
          argumentHint: '[files-or-changes]',
        };
      }
    },

    event: async (input) => {
      const event = input.event as {
        type: string;
        properties?: {
          info?: { id?: string; parentID?: string; title?: string };
          sessionID?: string;
          status?: { type: string };
        };
      };

      if (event.type === 'session.created') {
        const childSessionId = event.properties?.info?.id;
        const parentSessionId = event.properties?.info?.parentID;
        if (depthTracker && childSessionId && parentSessionId) {
          depthTracker.registerChild(parentSessionId, childSessionId);
        }
        if (childSessionId) {
          checkpointManager.initializeSession(childSessionId, ctx.directory);
        }
      }

      // Runtime model fallback for foreground agents (rate-limit detection)
      await foregroundFallback.handleEvent(input.event);

      // Track real token/context usage from OpenCode message.updated events
      await contextPressureHook.handleEvent(input);

      // Todo-continuation: auto-continue orchestrator on incomplete todos
      await todoContinuationHook.handleEvent(input);

      // Handle auto-update checking
      await autoUpdateChecker.event(input);

      // Handle multiplexer pane spawning for OpenCode's Task tool sessions
      await multiplexerSessionManager.onSessionCreated(event);

      // Handle session.status events for pane cleanup
      await multiplexerSessionManager.onSessionStatus(event);

      // Handle session.deleted events for pane cleanup
      await multiplexerSessionManager.onSessionDeleted(event);

      await interviewManager.handleEvent(
        input as {
          event: { type: string; properties?: Record<string, unknown> };
        },
      );

      sessionGoalHook.handleEvent(
        input as {
          event: { type: string; properties?: Record<string, unknown> };
        },
      );

      await taskSessionManagerHook.event(
        input as {
          event: {
            type: string;
            properties?: { info?: { id?: string }; sessionID?: string };
          };
        },
      );

      if (input.event.type === 'session.deleted') {
        const props = input.event.properties as
          | { info?: { id?: string }; sessionID?: string }
          | undefined;
        const sessionID = props?.info?.id ?? props?.sessionID;

        if (depthTracker && sessionID) {
          depthTracker.cleanup(sessionID);
        }
        if (sessionID) {
          sessionAgentMap.delete(sessionID);
          checkpointManager.cleanupSession(sessionID);
        }
      }
    },

    // Best-effort rescue only for stale apply_patch input before native
    // execution
    'tool.execute.before': async (input, output) => {
      await applyPatchHook['tool.execute.before'](
        input as {
          tool: string;
          directory?: string;
        },
        output as {
          args?: { patchText?: unknown; [key: string]: unknown };
        },
      );

      await taskSessionManagerHook['tool.execute.before'](
        input as {
          tool: string;
          sessionID?: string;
          callID?: string;
        },
        output as { args?: unknown },
      );

      // Safety guard: intercept delete commands and script execution
      await deleteGuardHook['tool.execute.before'](
        input as { tool: string; callID?: string },
        output as { args?: Record<string, unknown>; [key: string]: unknown },
      );

      // Storm breaker: suppress repeat-loop tool calls
      await stormBreakerHook['tool.execute.before'](
        input as { tool: string; sessionID: string; callID: string },
        output as { args: unknown },
      );
    },

    // Direct interception of /ol-auto-continue command — bypasses LLM
    // round-trip
    'command.execute.before': async (input, output) => {
      const typedInput = input as {
        command: string;
        sessionID: string;
        arguments: string;
      };
      const typedOutput = output as {
        parts: Array<{ type: string; text?: string }>;
        message?: { agent?: string };
      };
      const effectiveInput = { ...typedInput };
      if (typedInput.command === AUTO_CONTINUE_ON_COMMAND) {
        effectiveInput.command = 'ol-auto-continue';
        effectiveInput.arguments = 'on';
      } else if (typedInput.command === AUTO_CONTINUE_OFF_COMMAND) {
        effectiveInput.command = 'ol-auto-continue';
        effectiveInput.arguments = 'off';
      } else if (typedInput.command === CHECKPOINT_LIGHT_COMMAND) {
        effectiveInput.command = 'ol-checkpoint';
        effectiveInput.arguments = `light ${typedInput.arguments}`.trim();
      } else if (typedInput.command === CHECKPOINT_HEAVY_COMMAND) {
        effectiveInput.command = 'ol-checkpoint';
        effectiveInput.arguments = `heavy ${typedInput.arguments}`.trim();
      } else if (typedInput.command === CHECKPOINT_RESUME_LATEST_COMMAND) {
        effectiveInput.command = 'ol-checkpoint-resume';
        effectiveInput.arguments = 'latest';
      }

      await todoContinuationHook.handleCommandExecuteBefore(
        effectiveInput,
        typedOutput,
      );

      await interviewManager.handleCommandExecuteBefore(
        effectiveInput,
        typedOutput,
      );

      await presetManager.handleCommandExecuteBefore(
        effectiveInput,
        typedOutput,
      );

      await memoryCommandsHook.handleCommandExecuteBefore(
        effectiveInput,
        typedOutput,
      );

      await startWorkHook.handleCommandExecuteBefore(
        effectiveInput,
        typedOutput,
      );

      await sessionGoalHook.handleCommandExecuteBefore(
        effectiveInput,
        typedOutput,
      );

      // Handle prompt mode commands (/ol-light, /ol-heavy, /ol-turbo)
      modeCommandHandler.handleCommandExecuteBefore(
        effectiveInput,
        typedOutput,
      );

      if (
        typedInput.command === SUBAGENT_POLICY_COMMAND ||
        getSubagentPolicyModeForCommand(typedInput.command)
      ) {
        const requestedMode =
          getSubagentPolicyModeForCommand(typedInput.command) ??
          parseSubagentPolicyMode(typedInput.arguments);

        // If it's a mode switch command, modify the config file
        if (
          requestedMode &&
          typedInput.command !== SUBAGENT_POLICY_COMMAND
        ) {
          // Read current config
          const currentConfig = readExtendaiConfig();

          // Modify config
          writeExtendaiConfig({
            ...currentConfig,
            subagentPolicy: {
              ...(currentConfig.subagentPolicy as Record<string, unknown>),
              mode: requestedMode,
            },
          });

          // Generate confirmation message
          const allowedAgents = getAllowedAgentsForMode(requestedMode);
          const confirmation = `✅ 已切换到 ${requestedMode} 模式

可用子 agent: ${allowedAgents.length > 0 ? allowedAgents.join(', ') : '(无)'}
生效时间: 下一轮对话

注意: 当前对话仍使用旧的 policy，新 policy 将在下一轮对话中生效`;

          typedOutput.parts.length = 0;
          typedOutput.parts.push(
            createInternalAgentTextPart(confirmation),
          );
        } else {
          // View current policy
          typedOutput.parts.length = 0;
          typedOutput.parts.push(
            createInternalAgentTextPart(
              formatSubagentPolicyStatus(config, requestedMode),
            ),
          );
        }
      }
    },

    'chat.params': async (
      input: {
        model?: { providerID?: string; id?: string };
        sessionID?: string;
      },
      _output: unknown,
    ) => {
      await thinkingLanguageHook['chat.params'](input, _output);
      // Flash escalation: count failures → switch model
      await flashEscalationHook['chat.params'](
        input as {
          sessionID: string;
          model: { id?: string; providerID?: string };
        },
        _output as {
          temperature: number;
          topP: number;
          topK: number;
          maxOutputTokens: number | undefined;
          options: Record<string, unknown>;
        },
      );
    },

    'chat.headers': chatHeadersHook['chat.headers'],

    // Track which agent each session uses (needed for serve-mode prompt
    // injection)
    'chat.message': async (
      input: { sessionID: string; agent?: string },
      output?: { message?: { agent?: string }; parts?: Array<{ type: string; text?: string }> },
    ) => {
      const rawAgent = input.agent ?? output?.message?.agent;
      const agent = rawAgent
        ? resolveRuntimeAgentName(config, rawAgent)
        : undefined;

      if (
        agent &&
        output?.message &&
        typeof output.message.agent === 'string'
      ) {
        output.message.agent = agent;
      }

      if (agent) {
        sessionAgentMap.set(input.sessionID, agent);
      }
      contextPressureHook.handleChatMessage({
        sessionID: input.sessionID,
        agent,
      });
      todoContinuationHook.handleChatMessage({
        sessionID: input.sessionID,
        agent,
      });
      await modeDetectorHook['chat.message'](
        { sessionID: input.sessionID, agent, messages: [] },
        {},
      );

      // Inject post-compaction recovery instructions if needed
      if (output?.parts) {
        compactionHook['chat.message'](
          { sessionID: input.sessionID },
          { message: output.message ?? {}, parts: output.parts },
        );
      }
    },

    // Inject orchestrator system prompt for serve-mode sessions. In serve
    // mode, the agent's prompt field may be absent from the agents
    // registry (built before plugin config hooks run). This hook injects
    // it at LLM call time. Uses the already-resolved prompt from
    // agentDefs (which has custom replacement or append prompts applied)
    // instead of rebuilding the default.
    'experimental.chat.system.transform': async (
      input: { sessionID?: string },
      output: { system: string[] },
    ): Promise<void> => {
      const agentName = input.sessionID
        ? sessionAgentMap.get(input.sessionID)
        : undefined;
      if (agentName === 'orchestrator') {
        const alreadyInjected = output.system.some(
          (s) =>
            typeof s === 'string' &&
            s.includes('<Role>') &&
            s.includes('orchestrator'),
        );
        if (!alreadyInjected) {
          // Prepend the orchestrator prompt to the system array. Use the
          // resolved prompt from the orchestrator agent definition (which
          // includes any custom replacement or append from orchestrator.md
          // / orchestrator_append.md) Fall back to
          // buildOrchestratorPrompt only if the resolved prompt is
          // missing.
          const orchestratorDef = agentDefs.find(
            (a) => a.name === 'orchestrator',
          );
          const orchestratorPrompt =
            typeof orchestratorDef?.config?.prompt === 'string'
              ? orchestratorDef.config.prompt
              : buildOrchestratorPrompt(disabledAgents);
          output.system[0] =
            orchestratorPrompt +
            (output.system[0] ? `\n\n${output.system[0]}` : '');
        }
      }

      await todoContinuationHook.handleSystemTransform(input, output);

      sessionGoalHook.handleSystemTransform(input, output);

      await phaseReminderHook['experimental.chat.system.transform'](
        input,
        output,
      );

      await taskSessionManagerHook['experimental.chat.system.transform'](
        input,
        output,
      );

      await modeDetectorHook['experimental.chat.system.transform'](
        input,
        output,
      );

      await contextPressureHook.handleSystemTransform(input, output);

      // Inject mode-specific prompt variants for primary agents
      if (input.sessionID) {
        const currentMode = promptModeManager.getCurrentMode(input.sessionID);
        const agentForMode = sessionAgentMap.get(input.sessionID);

        if (
          currentMode !== 'light' &&
          agentForMode &&
          promptModeManager.shouldApplyToAgent(agentForMode)
        ) {
          const modePrompts: Record<string, Record<string, string>> = {
            orchestrator: {
              heavy: ORCHESTRATOR_HEAVY_PROMPT,
              turbo: ORCHESTRATOR_TURBO_PROMPT,
            },
            'bio-orchestrator': {
              heavy: BIO_ORCHESTRATOR_HEAVY_PROMPT,
              turbo: BIO_ORCHESTRATOR_TURBO_PROMPT,
            },
            'deep-worker': {
              heavy: DEEP_WORKER_HEAVY_PROMPT,
              turbo: DEEP_WORKER_TURBO_PROMPT,
            },
            prometheus: {
              heavy: PROMETHEUS_HEAVY_PROMPT,
              turbo: PROMETHEUS_TURBO_PROMPT,
            },
            atlas: {
              heavy: ATLAS_HEAVY_PROMPT,
              turbo: ATLAS_TURBO_PROMPT,
            },
          };

          const agentPrompts = modePrompts[agentForMode];
          if (agentPrompts?.[currentMode]) {
            const modeTag = `[MODE: ${currentMode.toUpperCase()}]`;
            const alreadyHasMode = output.system.some(
              (s) => typeof s === 'string' && s.includes(modeTag),
            );
            if (!alreadyHasMode) {
              output.system.push(agentPrompts[currentMode]);
            }
          }
        }
      }

      // Inject Bio Skills catalog and loaded skills
      if (bioSkillsManager && input.sessionID) {
        const agentName = sessionAgentMap.get(input.sessionID);
        const allowedAgents = config.bioSkills?.allowedAgents ?? ['*'];
        const isAllowed =
          allowedAgents.includes('*') ||
          (agentName && allowedAgents.includes(agentName));

        if (isAllowed) {
          // Always show catalog
          const catalog = formatCatalogForPrompt(bioSkillsManager.getCatalog());
          if (catalog) {
            output.system.push(catalog);
          }

          // Show loaded skills if any
          const loadedSkills = bioSkillsManager.getLoadedSkills(
            input.sessionID,
          );
          if (loadedSkills.length > 0) {
            const loadedBlock = formatLoadedSkillsForPrompt(loadedSkills);
            output.system.push(loadedBlock);
          }
        }
      }

      // Inject template skills catalog (HTML templates, academic tools, etc.)
      if (templateSkillsManager) {
        const templateCatalog = formatTemplateCatalogForPrompt(
          templateSkillsManager.getCatalog(),
        );
        if (templateCatalog) {
          output.system.push(templateCatalog);
        }
      }

      // Inject thinking language preference for models that support it
      await thinkingLanguageHook['experimental.chat.system.transform'](
        input as { sessionID?: string },
        output,
      );

      // Prefix stability: fingerprint system prompt for cache-hit
      // tracking
      await prefixStabilityHook['experimental.chat.system.transform'](
        input as { sessionID?: string; model: { providerID?: string } },
        output,
      );

      // Team mode context injection for team members
      if (config.team_mode?.enabled && input.sessionID) {
        const { lookupTeamSession } = await import('./features/team-mode/team-session-registry');
        const teamEntry = lookupTeamSession(input.sessionID);
        if (teamEntry) {
          const { loadRuntimeState } = await import('./features/team-mode/team-state-store/index');
          const state = await loadRuntimeState(teamEntry.teamName);
          if (state && state.status === 'active') {
            const member = state.members.find(m => m.name === teamEntry.memberName);
            if (member) {
              const isLead = teamEntry.role === 'lead';
              const teamInfo = [
                `## Team Mode Active`,
                `You are ${isLead ? 'the lead' : 'a member'} of team "${state.teamName}".`,
                `TeamRunId: ${state.teamRunId}`,
                `### Team Members`,
                ...state.members.map(m => `- ${m.status === 'running' ? '?' : '?'} ${m.name}: ${m.status}`),
                `### Communication`,
                `Use team_send_message to communicate with team members.`,
                `Use team_task_update to report task progress.`,
              ];
              output.system.unshift(teamInfo.join('\n'));
            }
          }
        }
      }

      // Collapse to single system message for provider compatibility.
      // Some providers (e.g. Qwen via VLLM/DashScope) reject multiple
      // system messages. Sub-hooks above may push additional entries; join
      // them back into one element so OpenCode emits a single system
      // message.
      collapseSystemInPlace(output.system);
    },

    // Inject phase reminder and filter available skills before sending to
    // API (doesn't show in UI)
    'experimental.chat.messages.transform': async (
      input: Record<string, never>,
      output: { messages: unknown[] },
    ): Promise<void> => {
      // Type assertion since we know the structure matches
      // MessageWithParts[]
      const typedOutput = output as {
        messages: Array<{
          info: { role: string; agent?: string; sessionID?: string };
          parts: Array<{
            type: string;
            text?: string;
            [key: string]: unknown;
          }>;
        }>;
      };

      for (const message of typedOutput.messages) {
        if (message.info.role !== 'user') {
          continue;
        }
        for (const part of message.parts) {
          if (part.type !== 'text' || typeof part.text !== 'string') {
            continue;
          }
          part.text = rewriteDisplayNameMentions(part.text);
        }
      }

      // Strip image parts from orchestrator messages when @observer is
      // available. When the orchestrator's model doesn't support image
      // input, the API call fails before the LLM can respond. We replace
      // image bytes with a text nudge so the orchestrator delegates to
      // @observer instead.
      processImageAttachments({
        messages: typedOutput.messages,
        workDir: ctx.directory,
        disabledAgents,
        log,
      });

      await todoContinuationHook.handleMessagesTransform({
        messages: typedOutput.messages,
      });
      await filterAvailableSkillsHook['experimental.chat.messages.transform'](
        input,
        typedOutput,
      );
      await thinkingLanguageHook['experimental.chat.messages.transform'](
        input,
        typedOutput,
      );
    },

    // Post-tool hooks: retry guidance for delegation errors + file-tool
    // nudge
    'tool.execute.after': async (input, output) => {
      await delegateTaskRetryHook['tool.execute.after'](
        input as { tool: string },
        output as { output: unknown },
      );

      await jsonErrorRecoveryHook['tool.execute.after'](
        input as {
          tool: string;
          sessionID: string;
          callID: string;
        },
        output as {
          title: string;
          output: unknown;
          metadata: unknown;
        },
      );

      // Flash escalation: count failures, auto-escalate model
      await flashEscalationHook['tool.execute.after'](
        input as {
          tool: string;
          sessionID: string;
          callID: string;
          args: unknown;
        },
        output as {
          title: string;
          output: string;
          metadata: unknown;
        },
      );

      await todoContinuationHook.handleToolExecuteAfter(
        input as {
          tool: string;
          sessionID?: string;
        },
        output as { output?: unknown },
      );

      await postFileToolNudgeHook['tool.execute.after'](
        input as {
          tool: string;
          sessionID?: string;
          callID?: string;
        },
        output as {
          title: string;
          output: string;
          metadata: Record<string, unknown>;
        },
      );

      await taskSessionManagerHook['tool.execute.after'](
        input as {
          tool: string;
          sessionID?: string;
          callID?: string;
        },
        output as { output: unknown },
      );
    },

    // Schema sanitize: clean tool JSON Schemas before sending to LLM
    'tool.definition': async (
      input: { toolID: string },
      output: { description: string; parameters: unknown },
    ) => {
      await schemaSanitizeHook['tool.definition'](input, output);
    },

    // Replace OpenCode's native compaction prompt with our improved Chinese prompt
    'experimental.session.compacting': async (
      input: { sessionID?: string },
      output: { context: string[]; prompt?: string },
    ): Promise<void> => {
      compactionHook['experimental.session.compacting'](input, output);
    },

    // Auto-continue after compaction if there are incomplete todos
    'experimental.compaction.autocontinue': async (
      input: {
        sessionID: string
        agent: string
        model: unknown
        provider: unknown
        message: unknown
        overflow: boolean
      },
      output: { enabled: boolean },
    ): Promise<void> => {
      await compactionHook['experimental.compaction.autocontinue'](
        input,
        output,
      );
    },

    // Cleanup session state when plugin is disposed
    dispose: async (): Promise<void> => {
      if (bioSkillsManager) {
        // Clear all loaded bio skills sessions
        bioSkillsManager = null;
      }
      if (templateSkillsManager) {
        templateSkillsManager = null;
      }
    },
  };
};

export default {
  id: 'extendai-lab',
  server: OhMyOpenCodeLite,
};

export type {
  AgentName,
  AgentOverrideConfig,
  McpName,
  MultiplexerConfig,
  MultiplexerLayout,
  MultiplexerType,
  PluginConfig,
  TmuxConfig,
  TmuxLayout,
} from './config';
export type { RemoteMcpConfig } from './mcp';
export * from './features/team-mode/index.js';

import type { Plugin } from '@opencode-ai/plugin';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createAgents, getAgentConfigs, getDisabledAgents } from './agents';
import { buildOrchestratorPrompt } from './agents/orchestrator';
import {
  type AgentOverrideConfig,
  deepMerge,
  loadPluginConfig,
  type MultiplexerConfig,
} from './config';
import { AGENT_ALIASES } from './config/constants';
import { parseList } from './config/agent-mcps';
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
  createDelegateTaskRetryHook,
  createFilterAvailableSkillsHook,
  createJsonErrorRecoveryHook,
  createModeDetectorHook,
  createPhaseReminderHook,
  createPostFileToolNudgeHook,
  createTaskSessionManagerHook,
  createTodoContinuationHook,
  ForegroundFallbackManager,
} from './hooks';
import { createThinkingLanguageHook } from './hooks/thinking-language';
import { processImageAttachments } from './hooks/image-hook';
import { createInterviewManager } from './interview';
import { createBuiltinMcps } from './mcp';
import {
  getMultiplexer,
  MultiplexerSessionManager,
  startAvailabilityCheck,
} from './multiplexer';
import {
  BioSkillsSessionManager,
  createLoadBioSkillsTool,
  formatCatalogForPrompt,
  formatLoadedSkillsForPrompt,
  scanBioSkillsCatalog,
} from './bio-skills';
import { detectBioTaskTool } from './tools/detect-bio-task.js';
import { CheckpointManager } from './checkpoint';
import { PromptModeManager } from './prompt-mode/manager.js';
import { createModeCommandHandler } from './prompt-mode/commands.js';
import { getPackageResourceDir, getPackageRoot } from './paths/plugin-paths';
import {
  ORCHESTRATOR_HEAVY_PROMPT,
  ORCHESTRATOR_TURBO_PROMPT,
  BIO_ORCHESTRATOR_HEAVY_PROMPT,
  BIO_ORCHESTRATOR_TURBO_PROMPT,
  DEEP_WORKER_HEAVY_PROMPT,
  DEEP_WORKER_TURBO_PROMPT,
  PROMETHEUS_HEAVY_PROMPT,
  PROMETHEUS_TURBO_PROMPT,
  ATLAS_HEAVY_PROMPT,
  ATLAS_TURBO_PROMPT,
} from './agents/prompts/index.js';
import {
  CHECKPOINT_TEMPLATE,
  HANDOFF_TEMPLATE,
  CHECKPOINT_RESUME_TEMPLATE,
  START_WORK_TEMPLATE,
  RALPH_LOOP_TEMPLATE,
  CANCEL_RALPH_TEMPLATE,
  STOP_CONTINUATION_TEMPLATE,
} from './commands/index.js';
import {
  ast_grep_replace,
  ast_grep_search,
  createCouncilTool,
  createPresetManager,
  createWebfetchTool,
} from './tools';
import {
  createDisplayNameMentionRewriter,
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
      body: { service: 'openagent-labforge', level, message },
    });
  } catch {
    // client.app.log may deadlock or be unavailable; stderr is the
    // fallback
    const prefix =
      level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'INFO';
    console.error(`[openagent-labforge] ${prefix}: ${message}`);
  }
}

/** Minimum expected registrations for a healthy plugin load. */
const HEALTH_CHECK = {
  minAgents: 5,
  minTools: 5,
  minMcps: 1,
} as const;

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
  let filterAvailableSkillsHook: ReturnType<
    typeof createFilterAvailableSkillsHook
  >;
  let sessionAgentMap: Map<string, string>;
  let postFileToolNudgeHook: ReturnType<typeof createPostFileToolNudgeHook>;
  let chatHeadersHook: ReturnType<typeof createChatHeadersHook>;
  let delegateTaskRetryHook: ReturnType<typeof createDelegateTaskRetryHook>;
  let applyPatchHook: ReturnType<typeof createApplyPatchHook>;
  let jsonErrorRecoveryHook: ReturnType<typeof createJsonErrorRecoveryHook>;
  let foregroundFallback: ForegroundFallbackManager;
  let todoContinuationHook: ReturnType<typeof createTodoContinuationHook>;
  let taskSessionManagerHook: ReturnType<typeof createTaskSessionManagerHook>;
  let modeDetectorHook: ReturnType<typeof createModeDetectorHook>;
  let thinkingLanguageHook: ReturnType<typeof createThinkingLanguageHook>;
  let interviewManager: ReturnType<typeof createInterviewManager>;
  let presetManager: ReturnType<typeof createPresetManager>;
  let councilTools: Record<string, unknown>;
  let webfetch: ReturnType<typeof createWebfetchTool>;
  let rewriteDisplayNameMentions: ReturnType<
    typeof createDisplayNameMentionRewriter
  >;
  let bioSkillsManager: BioSkillsSessionManager | null = null;
  let checkpointManager: CheckpointManager;
  let promptModeManager: PromptModeManager;
  let modeCommandHandler: ReturnType<typeof createModeCommandHandler>;

  // Counters for post-init health check (set inside try, checked outside)
  let toolCount = 0;

  try {
    config = loadPluginConfig(ctx.directory);

    // Safety net: if a runtime preset was set via /preset command and
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

    mcps = createBuiltinMcps(config.disabled_mcps, config.websearch);
    webfetch = createWebfetchTool(ctx);

    // Initialize Checkpoint Manager
    checkpointManager = new CheckpointManager();

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
        log(
          'info',
          `Bio Skills: ${catalog.length} categories available`,
        );
      } else {
        log('info', 'Bio Skills: no catalog found, load_bio_skills disabled');
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
    // Initialize JSON parse error recovery hook
    jsonErrorRecoveryHook = createJsonErrorRecoveryHook(ctx);

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
      maxContinuations: config.todoContinuation?.maxContinuations ?? 5,
      cooldownMs: config.todoContinuation?.cooldownMs ?? 3000,
      autoEnable: config.todoContinuation?.autoEnable ?? false,
      autoEnableThreshold: config.todoContinuation?.autoEnableThreshold ?? 4,
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

    toolCount =
      Object.keys(councilTools).length +
      Object.keys(todoContinuationHook.tool).length +
      1 + // webfetch
      2; // ast_grep_search, ast_grep_replace
  } catch (err) {
    // Plugin init failed: log visibly before re-throwing so the user
    // sees something actionable instead of a silent "loaded but empty".
    log('[plugin] FATAL: init failed', String(err));
    await appLog(
      ctx,
      'error',
      `INIT FAILED: ${String(err)}. Report at github.com/alvinunreal/openagent-labforge/issues/310`,
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
      '  github.com/alvinunreal/openagent-labforge/issues/310',
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
    name: 'openagent-labforge',

    agent: agents,

    tool: {
      ...councilTools,
      webfetch,
      ...todoContinuationHook.tool,
      ast_grep_search,
      ast_grep_replace,
      detect_bio_task: detectBioTaskTool,
      ...(bioSkillsManager
        ? { load_bio_skills: createLoadBioSkillsTool(bioSkillsManager) }
        : {}),
    },

    mcp: mcps,

    config: async (opencodeConfig: Record<string, unknown>) => {
      // Only set default_agent if not already configured by the user
      // and the plugin config doesn't explicitly disable this behavior
      if (
        config.setDefaultAgent !== false &&
        !(opencodeConfig as { default_agent?: string }).default_agent
      ) {
        (opencodeConfig as { default_agent?: string }).default_agent =
          'orchestrator';
      }

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

      // Runtime preset override: if /preset switched to a runtime preset,
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
            Object.keys(runtimePreset).map(
              (k) => AGENT_ALIASES[k] ?? k,
            ),
          );
          for (const agentName of Object.keys(prevPreset)) {
            const resolvedName =
              AGENT_ALIASES[agentName] ?? agentName;
            if (newPresetResolved.has(resolvedName))
              continue; // new preset handles it
            const entry = configAgent[resolvedName] as
              | Record<string, unknown>
              | undefined;
            if (!entry) continue;
            // Reset to config-file baseline. Use the previous preset's
            // override to identify which fields to clear even when the
            // baseline doesn't define them.
            const baseline =
              config.agents?.[resolvedName];
            const prevOverride = prevPreset[agentName] as
              | AgentOverrideConfig
              | undefined;
            if (typeof baseline?.model === 'string') {
              entry.model = baseline.model;
            }
            if (typeof baseline?.variant === 'string') {
              entry.variant = baseline.variant;
            } else if (
              prevOverride &&
              'variant' in prevOverride
            ) {
              delete entry.variant;
            }
            if (typeof baseline?.temperature === 'number') {
              entry.temperature = baseline.temperature;
            } else if (
              prevOverride &&
              'temperature' in prevOverride
            ) {
              delete entry.temperature;
            }
            if (
              baseline?.options &&
              typeof baseline.options === 'object' &&
              !Array.isArray(baseline.options)
            ) {
              entry.options = baseline.options;
            } else if (
              prevOverride &&
              'options' in prevOverride
            ) {
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

      // Register /auto-continue command so OpenCode recognizes it.
      // Actual handling is done by command.execute.before hook below
      // (no LLM round-trip — injected directly into output.parts).
      const configCommand = opencodeConfig.command as
        | Record<string, unknown>
        | undefined;
      if (!configCommand?.['auto-continue']) {
        if (!opencodeConfig.command) {
          opencodeConfig.command = {};
        }
        (opencodeConfig.command as Record<string, unknown>)['auto-continue'] = {
          template: 'Call the auto_continue tool with enabled=true',
          description:
            'Enable auto-continuation — orchestrator keeps working through incomplete todos',
        };
      }

      interviewManager.registerCommand(opencodeConfig);
      presetManager.registerCommand(opencodeConfig);

      // Register prompt mode commands (/ol-light, /ol-heavy, /ol-turbo)
      modeCommandHandler.registerCommand(opencodeConfig);

      // Register builtin skills path
      const skillsPath = join(__dirname, '../src/skills');
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

      // Register checkpoint commands (/ol-checkpoint, /ol-handoff, /ol-checkpoint-resume)
      if (!configCommand?.['ol-checkpoint']) {
        (opencodeConfig.command as Record<string, unknown>)['ol-checkpoint'] = {
          template: CHECKPOINT_TEMPLATE,
          description: 'Create durable checkpoint (light: same-session recovery, heavy: cross-session handoff)',
          argumentHint: '[light|heavy] [goal]',
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
        (opencodeConfig.command as Record<string, unknown>)['ol-checkpoint-resume'] = {
          template: CHECKPOINT_RESUME_TEMPLATE,
          description: 'Resume from checkpoint in current session',
          argumentHint: '[latest|session-id|path]',
        };
      }

      // Register workflow commands (/start-work, /ralph-loop, /cancel-ralph, /stop-continuation)
      if (!configCommand?.['start-work']) {
        (opencodeConfig.command as Record<string, unknown>)['start-work'] = {
          template: START_WORK_TEMPLATE,
          description: 'Start work session from Prometheus plan',
          argumentHint: '[plan-name] [--worktree <path>]',
        };
      }
      if (!configCommand?.['ralph-loop']) {
        (opencodeConfig.command as Record<string, unknown>)['ralph-loop'] = {
          template: RALPH_LOOP_TEMPLATE,
          description: 'Start self-referential loop until task completion',
          argumentHint: '"task description" [--max-iterations=N]',
        };
      }
      if (!configCommand?.['cancel-ralph']) {
        (opencodeConfig.command as Record<string, unknown>)['cancel-ralph'] = {
          template: CANCEL_RALPH_TEMPLATE,
          description: 'Cancel active Ralph Loop',
        };
      }
      if (!configCommand?.['stop-continuation']) {
        (opencodeConfig.command as Record<string, unknown>)['stop-continuation'] = {
          template: STOP_CONTINUATION_TEMPLATE,
          description: 'Stop all continuation mechanisms for current session',
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
    },

    // Direct interception of /auto-continue command — bypasses LLM
    // round-trip
    'command.execute.before': async (input, output) => {
      await todoContinuationHook.handleCommandExecuteBefore(
        input as {
          command: string;
          sessionID: string;
          arguments: string;
        },
        output as { parts: Array<{ type: string; text?: string }> },
      );

      await interviewManager.handleCommandExecuteBefore(
        input as {
          command: string;
          sessionID: string;
          arguments: string;
        },
        output as { parts: Array<{ type: string; text?: string }> },
      );

      await presetManager.handleCommandExecuteBefore(
        input as {
          command: string;
          sessionID: string;
          arguments: string;
        },
        output as { parts: Array<{ type: string; text?: string }> },
      );

      // Handle prompt mode commands (/ol-light, /ol-heavy, /ol-turbo)
      modeCommandHandler.handleCommandExecuteBefore(
        input as {
          command: string;
          sessionID: string;
          arguments: string;
        },
        output as { parts: Array<{ type: string; text?: string }> },
      );
    },

    'chat.headers': chatHeadersHook['chat.headers'],

    // Track which agent each session uses (needed for serve-mode prompt
    // injection)
    'chat.message': async (
      input: { sessionID: string; agent?: string },
      output?: { message?: { agent?: string } },
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
      todoContinuationHook.handleChatMessage({
        sessionID: input.sessionID,
        agent,
      });
      await modeDetectorHook['chat.message'](
        { sessionID: input.sessionID, agent, messages: [] },
        {},
      );
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
          if (agentPrompts && agentPrompts[currentMode]) {
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
          const catalog = formatCatalogForPrompt(
            bioSkillsManager.getCatalog(),
          );
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

      // Inject thinking language preference for models that support it
      await thinkingLanguageHook['experimental.chat.system.transform'](
        input as {
          model?: string;
          messages?: Array<{
            info: { role: string };
            parts: Array<{ type: string; text?: string }>;
          }>;
        },
        output,
      );

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
  };
};

export default OhMyOpenCodeLite;

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

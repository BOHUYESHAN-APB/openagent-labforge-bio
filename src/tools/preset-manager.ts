import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PluginInput } from '@opencode-ai/plugin';
import type {
  AgentOverrideConfig,
  ModelEntry,
  PluginConfig,
  Preset,
} from '../config';
import { AGENT_ALIASES } from '../config/constants';
import {
  getActiveRuntimePreset,
  rollbackRuntimePreset,
  setActiveRuntimePresetWithPrevious,
} from '../config/runtime-preset';
import { createInternalAgentTextPart } from '../utils';

const COMMAND_NAME = 'ol-preset';
const LEGACY_COMMAND_NAME = 'preset';

// Explicit subcommands — OpenCode doesn't auto-complete params, so register
// separate command for each preset name so users can discover via tab-completion.
const PRESET_SUBCOMMANDS = {
  'ol-preset-free': 'free',
  'ol-preset-ds-first': 'ds-first',
  'ol-preset-openai': 'openai',
  'ol-preset-openai-go': 'openai-go',
  'ol-preset-ds-mimo': 'ds-mimo',
  'ol-preset-3-mix': '3-mix',
  'ol-preset-custom': 'custom',
} as const;

/**
 * Load a preset from the presets directory (src/config/presets/{name}.json).
 * Returns the preset object or null if not found.
 */
function loadPresetFromFile(presetName: string): Preset | null {
  // ESM-compatible __dirname
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // Search in multiple locations
  const searchDirs = [
    path.join(__dirname, '..', 'config', 'presets'),
    path.join(process.cwd(), '.extendai-lab', 'presets'),
    path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.extendai-lab',
      'presets',
    ),
  ];

  for (const dir of searchDirs) {
    const filePath = path.join(dir, `${presetName}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) as Preset;
      } catch {
        // Ignore parse errors
      }
    }
  }
  return null;
}

/**
 * Creates a preset manager for the /ol-preset slash command.
 *
 * Uses the OpenCode SDK's client.config.update() to change agent models
 * and temperatures without restarting. The server invalidates its agent
 * cache and re-reads config on the next prompt.
 *
 * Note: activePreset is tracked in-memory only and resets on plugin reload.
 * If the user manually edits config or another mechanism changes agents,
 * this tracker may become stale until the next /ol-preset call.
 */
export function createPresetManager(ctx: PluginInput, config: PluginConfig) {
  // Sync from module-level state in case of plugin re-init — the runtime
  // preset persists across dispose()/re-init cycles.
  let activePreset: string | null =
    getActiveRuntimePreset() ?? config.preset ?? null;

  /**
   * Handle the /ol-preset command from command.execute.before hook.
   *
   * - No arguments: list available presets
   * - With argument: switch to the named preset
   */
  async function handleCommandExecuteBefore(
    input: {
      command: string;
      sessionID: string;
      arguments: string;
    },
    output: { parts: Array<{ type: string; text?: string }> },
  ): Promise<void> {
    // Handle explicit subcommands first
    const subcommandPreset =
      PRESET_SUBCOMMANDS[input.command as keyof typeof PRESET_SUBCOMMANDS];
    if (subcommandPreset) {
      output.parts.length = 0;
      await switchPreset(subcommandPreset, config.presets ?? {});
      // Don't add anything to output.parts — the model change happens
      // silently via client.config.update(). Writing to output.parts
      // would leak as a prompt to the LLM.
      return;
    }

    if (
      input.command !== COMMAND_NAME &&
      input.command !== LEGACY_COMMAND_NAME
    ) {
      return;
    }

    // Clear the template so OpenCode doesn't send it to the LLM
    output.parts.length = 0;

    const arg = input.arguments.trim();
    const presets = config.presets ?? {};

    if (!arg) {
      // List available presets — this IS intentional user-facing output
      output.parts.push(createInternalAgentTextPart(formatPresetList(presets)));
      return;
    }

    // Guard against multi-word arguments
    if (/\s/.test(arg)) {
      const suggestion = arg.split(/\s+/)[0];
      output.parts.push(
        createInternalAgentTextPart(
          `Preset names cannot contain spaces. Did you mean: /ol-preset ${suggestion}?`,
        ),
      );
      return;
    }

    // Switch to named preset — no output to LLM, model change is silent
    await switchPreset(arg, presets);
    // Clear output.parts to prevent any leaked content
    output.parts.length = 0;
  }

  /**
   * Register the /ol-preset command in the OpenCode config.
   */
  function registerCommand(opencodeConfig: Record<string, unknown>): void {
    const configCommand = opencodeConfig.command as
      | Record<string, unknown>
      | undefined;

    const ensureCommand = (name: string, desc: string) => {
      if (!opencodeConfig.command) {
        opencodeConfig.command = {};
      }
      const commands = opencodeConfig.command as Record<string, unknown>;
      if (!commands[name]) {
        commands[name] = {
          template: '',
          description: desc,
        };
      }
    };

    // Legacy parameter form
    ensureCommand(
      COMMAND_NAME,
      'Switch agent preset (free/ds-first/openai/openai-go/custom)',
    );

    // Explicit subcommands for tab-completion discovery
    ensureCommand(
      'ol-preset-free',
      'Switch preset: free — no model binding, use current OpenCode model (default)',
    );
    ensureCommand(
      'ol-preset-ds-first',
      'Switch preset: ds-first — DeepSeek V4 via OpenCode Go subscription',
    );
    ensureCommand(
      'ol-preset-openai',
      'Switch preset: openai — GPT-5.4 / 5.5 for ChatGPT Plus/Pro subscribers',
    );
    ensureCommand(
      'ol-preset-openai-go',
      'Switch preset: openai-go — dual OpenAI + Go subscription optimal mix',
    );
    ensureCommand(
      'ol-preset-mimo',
      'Switch preset: mimo — Xiaomi MiMo V2.5 (pro + flash)',
    );
    ensureCommand(
      'ol-preset-mimo-ds',
      'Switch preset: mimo-ds — Xiaomi MiMo + DeepSeek combined',
    );
    ensureCommand(
      'ol-preset-custom',
      'Switch preset: custom — user-defined per-agent model config',
    );
  }

  /**
   * Switch to the given preset name by calling client.config.update().
   * Does NOT write to output.parts — the model change is silent.
   */
  async function switchPreset(
    presetName: string,
    presets: Record<string, Preset>,
  ): Promise<void> {
    // Try config.presets first, then load from preset files
    let preset = presets[presetName];
    if (!preset) {
      // Try loading from preset files (src/config/presets/{name}.json)
      const loadedPreset = loadPresetFromFile(presetName);
      if (loadedPreset) {
        preset = loadedPreset;
      } else {
        return;
      }
    }

    // Build the agent config overrides from the preset.
    const agentUpdates: Record<
      string,
      {
        model?: string;
        temperature?: number;
        variant?: string;
        options?: Record<string, unknown>;
      }
    > = {};
    for (const [agentName, override] of Object.entries(preset)) {
      const resolvedName = AGENT_ALIASES[agentName] ?? agentName;
      const agentConfig = mapOverrideToAgentConfig(override);
      if (Object.keys(agentConfig).length > 0) {
        agentUpdates[resolvedName] = agentConfig;
      }
    }

    // Build reset updates for agents in the old preset but not the new one.
    const currentRuntimePreset = getActiveRuntimePreset();
    const resetUpdates: Record<
      string,
      {
        model?: string;
        temperature?: number;
        variant?: string;
        options?: Record<string, unknown>;
      }
    > = {};
    if (currentRuntimePreset && config.presets?.[currentRuntimePreset]) {
      const oldPreset = config.presets[currentRuntimePreset];
      for (const rawName of Object.keys(oldPreset)) {
        const resolvedOld = AGENT_ALIASES[rawName] ?? rawName;
        if (resolvedOld in agentUpdates) continue;
        const baseline = config.agents?.[resolvedOld];
        if (baseline) {
          resetUpdates[resolvedOld] = mapOverrideToAgentConfig(baseline);
        }
      }
    }

    const hasAgentUpdates = Object.keys(agentUpdates).length > 0;
    const allUpdates = { ...resetUpdates, ...agentUpdates };
    if (!hasAgentUpdates) {
      return;
    }

    const previousPreset = activePreset;
    setActiveRuntimePresetWithPrevious(presetName);

    try {
      await ctx.client.config.update({
        body: { agent: allUpdates },
      });

      activePreset = presetName;
    } catch (err) {
      rollbackRuntimePreset(previousPreset);
    }
  }

  /**
   * Map an AgentOverrideConfig (from plugin config) to the subset of
   * SDK AgentConfig fields that client.config.update() can apply at runtime.
   *
   * Excluded fields and why:
   * - prompt, orchestratorPrompt: require restart (resolved at init by config() hook)
   * - skills, mcps: plugin-level concern, not part of SDK AgentConfig
   * - displayName: plugin-level concern, not part of SDK AgentConfig
   */
  function mapOverrideToAgentConfig(override: AgentOverrideConfig): {
    model?: string;
    temperature?: number;
    variant?: string;
    options?: Record<string, unknown>;
  } {
    const agentConfig: {
      model?: string;
      temperature?: number;
      variant?: string;
      options?: Record<string, unknown>;
    } = {};

    if (typeof override.model === 'string') {
      agentConfig.model = override.model;
    } else if (Array.isArray(override.model) && override.model.length > 0) {
      // Array-form model (fallback chain): pick the first entry.
      // The full chain resolution only happens at init time via config() hook,
      // so at runtime we use the primary model from the array.
      const first = override.model[0];
      agentConfig.model = typeof first === 'string' ? first : first.id;
      if (typeof first !== 'string' && first.variant) {
        agentConfig.variant = first.variant;
      }
    }

    if (typeof override.temperature === 'number') {
      agentConfig.temperature = override.temperature;
    }

    if (typeof override.variant === 'string') {
      agentConfig.variant = override.variant;
    }

    if (
      override.options &&
      typeof override.options === 'object' &&
      !Array.isArray(override.options)
    ) {
      agentConfig.options = override.options;
    }

    return agentConfig;
  }

  /**
   * Format the list of available presets with the active one highlighted.
   */
  function formatPresetList(presets: Record<string, Preset>): string {
    const names = Object.keys(presets);
    if (names.length === 0) {
      return 'No presets configured. Define presets in extendai-lab.jsonc under the "presets" field.';
    }

    const lines = ['Available presets:'];
    for (const name of names) {
      const marker = name === activePreset ? ' ← active' : '';
      const preset = presets[name];
      const agentNames = Object.keys(preset);
      const models = agentNames
        .map((a) => {
          const cfg = preset[a];
          const modelStr =
            typeof cfg.model === 'string'
              ? cfg.model
              : Array.isArray(cfg.model) && cfg.model.length > 0
                ? resolveFirstModel(cfg.model)
                : undefined;
          return modelStr ? `    ${a} → ${modelStr}` : `    ${a}`;
        })
        .join('\n');
      lines.push(`  ${name}${marker}`);
      lines.push(models);
    }
    lines.push('\nUsage: /ol-preset <name> to switch.');

    return lines.join('\n');
  }

  /**
   * Resolve the first model from an array-form model entry.
   */
  function resolveFirstModel(
    models: Array<string | ModelEntry>,
  ): string | undefined {
    if (models.length === 0) return undefined;
    const first = models[0];
    return typeof first === 'string' ? first : first.id;
  }

  return {
    handleCommandExecuteBefore,
    registerCommand,
  };
}

export type PresetManager = ReturnType<typeof createPresetManager>;

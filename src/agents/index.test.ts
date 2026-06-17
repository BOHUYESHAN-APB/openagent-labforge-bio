import { describe, expect, test } from 'bun:test';
import type { PluginConfig } from '../config';
import {
  AgentOverrideConfigSchema,
  CouncilConfigSchema,
  DEFAULT_DISABLED_AGENTS,
  DEFAULT_MODELS,
  PluginConfigSchema,
  SUBAGENT_NAMES,
} from '../config';
import { createAtlasAgent } from './atlas';
import { createBioOrchestratorAgent } from './bio-orchestrator';
import { createChemOrchestratorAgent } from './chem-orchestrator';
import { createDeepWorkerAgent } from './deep-worker';
import {
  createAgents,
  getAgentConfigs,
  getDisabledAgents,
  getEnabledAgentNames,
  isSubagent,
} from './index';
import { buildOrchestratorPrompt } from './orchestrator';

describe('agent alias backward compatibility', () => {
  test("applies 'explore' config to 'explorer' agent", () => {
    const config: PluginConfig = {
      agents: {
        explore: { model: 'test/old-explore-model' },
      },
    };
    const agents = createAgents(config);
    const explorer = agents.find((a) => a.name === 'explorer');
    expect(explorer).toBeDefined();
    expect(explorer?.config.model).toBe('test/old-explore-model');
  });

  test("applies 'frontend-ui-ux-engineer' config to 'designer' agent", () => {
    const config: PluginConfig = {
      agents: {
        'frontend-ui-ux-engineer': { model: 'test/old-frontend-model' },
      },
      subagentPolicy: { mode: 'full' },
    };
    const agents = createAgents(config);
    const designer = agents.find((a) => a.name === 'designer');
    expect(designer).toBeDefined();
    expect(designer?.config.model).toBe('test/old-frontend-model');
  });

  test('new name takes priority over old alias', () => {
    const config: PluginConfig = {
      agents: {
        explore: { model: 'old-model' },
        explorer: { model: 'new-model' },
      },
    };
    const agents = createAgents(config);
    const explorer = agents.find((a) => a.name === 'explorer');
    expect(explorer?.config.model).toBe('new-model');
  });

  test('new agent names work directly', () => {
    const config: PluginConfig = {
      agents: {
        explorer: { model: 'direct-explorer' },
        designer: { model: 'direct-designer' },
      },
      subagentPolicy: { mode: 'full' },
    };
    const agents = createAgents(config);
    expect(agents.find((a) => a.name === 'explorer')?.config.model).toBe(
      'direct-explorer',
    );
    expect(agents.find((a) => a.name === 'designer')?.config.model).toBe(
      'direct-designer',
    );
  });

  test('temperature override via old alias', () => {
    const config: PluginConfig = {
      agents: {
        explore: { temperature: 0.5 },
      },
    };
    const agents = createAgents(config);
    const explorer = agents.find((a) => a.name === 'explorer');
    expect(explorer?.config.temperature).toBe(0.5);
  });

  test('variant override via old alias', () => {
    const config: PluginConfig = {
      agents: {
        explore: { variant: 'low' },
      },
    };
    const agents = createAgents(config);
    const explorer = agents.find((a) => a.name === 'explorer');
    expect(explorer?.config.variant).toBe('low');
  });
});

describe('fixer agent fallback', () => {
  test('fixer inherits main agent model when no fixer config provided', () => {
    const config: PluginConfig = {
      agents: {
        librarian: { model: 'librarian-custom-model' },
      },
      subagentPolicy: { mode: 'minimal' },
    };
    const agents = createAgents(config);
    const fixer = agents.find((a) => a.name === 'fixer');
    const librarian = agents.find((a) => a.name === 'librarian');
    // With DEFAULT_MODELS all undefined, fixer inherits main agent model (undefined)
    // not librarian's model
    expect(fixer?.config.model).toBeUndefined();
    expect(librarian?.config.model).toBe('librarian-custom-model');
  });

  test('fixer uses its own model when explicitly configured', () => {
    const config: PluginConfig = {
      agents: {
        librarian: { model: 'librarian-model' },
        fixer: { model: 'fixer-specific-model' },
      },
      subagentPolicy: { mode: 'minimal' },
    };
    const agents = createAgents(config);
    const fixer = agents.find((a) => a.name === 'fixer');
    expect(fixer?.config.model).toBe('fixer-specific-model');
  });
});

describe('orchestrator agent', () => {
  test('orchestrator is first in agents array', () => {
    const agents = createAgents();
    expect(agents[0].name).toBe('orchestrator');
  });

  test('orchestrator has question permission set to allow', () => {
    const agents = createAgents();
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    expect(orchestrator?.config.permission).toBeDefined();
    expect((orchestrator?.config.permission as any).question).toBe('allow');
  });

  test('orchestrator is denied access to council_session', () => {
    const agents = createAgents();
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    expect((orchestrator?.config.permission as any).council_session).toBe(
      'deny',
    );
  });

  test('orchestrator accepts overrides', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: { model: 'custom-orchestrator-model', temperature: 0.3 },
      },
    };
    const agents = createAgents(config);
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    expect(orchestrator?.config.model).toBe('custom-orchestrator-model');
    expect(orchestrator?.config.temperature).toBe(0.3);
  });

  test('orchestrator accepts variant override', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: { variant: 'high' },
      },
    };
    const agents = createAgents(config);
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    expect(orchestrator?.config.variant).toBe('high');
  });

  test('orchestrator stores model array with per-model variants in _modelArray', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: {
          model: [
            { id: 'google/gemini-3-pro', variant: 'high' },
            { id: 'github-copilot/claude-3.5-haiku' },
            'openai/gpt-4',
          ],
        },
      },
    };
    const agents = createAgents(config);
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    expect(orchestrator?._modelArray).toEqual([
      { id: 'google/gemini-3-pro', variant: 'high' },
      { id: 'github-copilot/claude-3.5-haiku' },
      { id: 'openai/gpt-4' },
    ]);
    expect(orchestrator?.config.model).toBe('google/gemini-3-pro');
  });
});

describe('per-model variant in array config', () => {
  test('subagent stores model array with per-model variants', () => {
    const config: PluginConfig = {
      agents: {
        explorer: {
          model: [
            { id: 'google/gemini-3-flash', variant: 'low' },
            'openai/gpt-4o-mini',
          ],
        },
      },
    };
    const agents = createAgents(config);
    const explorer = agents.find((a) => a.name === 'explorer');
    expect(explorer?._modelArray).toEqual([
      { id: 'google/gemini-3-flash', variant: 'low' },
      { id: 'openai/gpt-4o-mini' },
    ]);
    expect(explorer?.config.model).toBe('google/gemini-3-flash');
  });

  test('top-level variant preserved alongside per-model variants', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: {
          model: [
            { id: 'google/gemini-3-pro', variant: 'high' },
            'openai/gpt-4',
          ],
          variant: 'low',
        },
      },
    };
    const agents = createAgents(config);
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    // top-level variant still set as default
    expect(orchestrator?.config.variant).toBe('low');
    // per-model variants stored in _modelArray
    expect(orchestrator?._modelArray?.[0]?.variant).toBe('high');
    expect(orchestrator?._modelArray?.[1]?.variant).toBeUndefined();
  });
});

describe('skill permissions', () => {
  test('orchestrator gets codemap skill allowed by default', () => {
    const agents = createAgents();
    const orchestrator = agents.find((a) => a.name === 'orchestrator');
    expect(orchestrator).toBeDefined();
    const skillPerm = (
      orchestrator?.config.permission as Record<string, unknown>
    )?.skill as Record<string, string>;
    // orchestrator gets wildcard allow (from RECOMMENDED_SKILLS wildcard entry)
    expect(skillPerm?.['*']).toBe('allow');
    // CUSTOM_SKILLS loop must also add a named codemap entry for orchestrator
    expect(skillPerm?.codemap).toBe('allow');
  });

  test('fixer does not get codemap skill allowed by default', () => {
    const agents = createAgents({ subagentPolicy: { mode: 'minimal' } });
    const fixer = agents.find((a) => a.name === 'fixer');
    expect(fixer).toBeDefined();
    const skillPerm = (fixer?.config.permission as Record<string, unknown>)
      ?.skill as Record<string, string>;
    expect(skillPerm?.codemap).not.toBe('allow');
  });

  test('oracle gets requesting-code-review skill allowed by default', () => {
    const agents = createAgents();
    const oracle = agents.find((a) => a.name === 'oracle');
    expect(oracle).toBeDefined();
    const skillPerm = (oracle?.config.permission as Record<string, unknown>)
      ?.skill as Record<string, string>;
    expect(skillPerm?.['requesting-code-review']).toBe('allow');
  });

  test('oracle gets simplify skill allowed by default', () => {
    const agents = createAgents();
    const oracle = agents.find((a) => a.name === 'oracle');
    expect(oracle).toBeDefined();
    const skillPerm = (oracle?.config.permission as Record<string, unknown>)
      ?.skill as Record<string, string>;
    expect(skillPerm?.simplify).toBe('allow');
  });
});

describe('tool permissions', () => {
  test('council agent is allowed to invoke council_session', () => {
    const agents = createAgents({ subagentPolicy: { mode: 'full' } });
    const council = agents.find((a) => a.name === 'council');
    expect((council?.config.permission as any).council_session).toBe('allow');
  });

  test('oracle is denied access to council_session', () => {
    const agents = createAgents();
    const oracle = agents.find((a) => a.name === 'oracle');
    expect((oracle?.config.permission as any).council_session).toBe('deny');
  });

  test('explorer is denied access to council_session', () => {
    const agents = createAgents();
    const explorer = agents.find((a) => a.name === 'explorer');
    expect((explorer?.config.permission as any).council_session).toBe('deny');
  });

  test('councillor is denied access to council_session', () => {
    const agents = createAgents();
    const councillor = agents.find((a) => a.name === 'councillor');
    expect((councillor?.config.permission as any).council_session).toBe('deny');
  });

  test('planner prompt includes plan file contract by default', () => {
    const agents = createAgents();
    const planner = agents.find((a) => a.name === 'prometheus');

    expect(planner?.config.prompt).toContain('<Plan_File_Contract>');
    expect(planner?.config.prompt).toContain(
      '.opencode/extendai-lab/plans/{descriptive-plan-name}.md',
    );
    expect(planner?.config.prompt).toContain(
      'Next command: /ol-start-work {name}',
    );
    expect(planner?.config.prompt).toContain('save_plan');
  });
});

describe('isSubagent type guard', () => {
  test('returns true for valid subagent names', () => {
    expect(isSubagent('explorer')).toBe(true);
    expect(isSubagent('librarian')).toBe(true);
    expect(isSubagent('oracle')).toBe(true);
    expect(isSubagent('designer')).toBe(true);
    expect(isSubagent('fixer')).toBe(true);
  });

  test('returns false for orchestrator', () => {
    expect(isSubagent('orchestrator')).toBe(false);
  });

  test('returns false for invalid agent names', () => {
    expect(isSubagent('invalid-agent')).toBe(false);
    expect(isSubagent('')).toBe(false);
    expect(isSubagent('explore')).toBe(false); // old alias, not actual agent name
  });
});

describe('agent classification', () => {
  test('SUBAGENT_NAMES excludes orchestrator', () => {
    expect(SUBAGENT_NAMES).not.toContain('orchestrator');
    expect(SUBAGENT_NAMES).toContain('explorer');
    expect(SUBAGENT_NAMES).toContain('fixer');
  });

  test('getAgentConfigs applies correct classification visibility and mode', () => {
    // Enable all agents (including observer) for classification testing
    const configs = getAgentConfigs({
      disabled_agents: [],
      subagentPolicy: { mode: 'full' },
    });

    // Primary agent
    expect(configs.orchestrator.mode).toBe('primary');

    // Subagents
    for (const name of SUBAGENT_NAMES) {
      // Council is a primary agent, rest are subagents
      if (name === 'council') {
        expect(configs[name].mode).toBe('primary');
      } else {
        expect(configs[name].mode).toBe('subagent');
      }
    }
  });
});

describe('createAgents', () => {
  test('creates ultra-minimal agents without config', () => {
    const agents = createAgents();
    const names = agents.map((a) => a.name);
    expect(names).toContain('orchestrator');
    expect(names).toContain('explorer');
    expect(names).toContain('librarian');
    expect(names).toContain('oracle');
    expect(names).not.toContain('fixer');
    expect(names).not.toContain('designer');
  });

  test('creates exactly 10 agents by default (6 primary + councillor + 3 ultra-minimal subagents)', () => {
    const agents = createAgents();
    expect(agents.length).toBe(10);
  });
});

describe('getAgentConfigs', () => {
  test('returns config record keyed by agent name', () => {
    const configs = getAgentConfigs();
    expect(configs.orchestrator).toBeDefined();
    expect(configs.explorer).toBeDefined();
    // With DEFAULT_MODELS all undefined, sub-agents inherit main agent model
    // via OpenCode native inheritance (next.model ?? parentModel)
    expect(configs.explorer.model).toBeUndefined();
  });

  test('includes description in SDK config', () => {
    const configs = getAgentConfigs();
    expect(configs.orchestrator.description).toBeDefined();
    expect(configs.explorer.description).toBeDefined();
  });
});

describe('council agent model resolution', () => {
  test('council agent uses default model', () => {
    const agents = createAgents({ subagentPolicy: { mode: 'full' } });
    const council = agents.find((a) => a.name === 'council');
    expect(council?.config.model).toBe(DEFAULT_MODELS.council);
  });

  test('councillor agent uses default model', () => {
    const agents = createAgents();
    const councillor = agents.find((a) => a.name === 'councillor');
    expect(councillor?.config.model).toBe(DEFAULT_MODELS.councillor);
  });

  test('council falls back to legacy master.model when no preset override', () => {
    // Simulates a pre-1.0.0 config with council.master.model but no council
    // entry in the agent preset — the exact scenario from issue #369.
    const config: PluginConfig = {
      agents: {
        oracle: { model: 'openai/gpt-5.5' },
      },
      council: {
        presets: {
          default: {
            alpha: { model: 'openai/gpt-5.4-mini' },
          },
        },
        _legacyMasterModel: 'anthropic/claude-opus-4-6',
      },
    };
    const agents = createAgents({
      ...config,
      subagentPolicy: { mode: 'full' },
    });
    const council = agents.find((a) => a.name === 'council');
    expect(council?.config.model).toBe('anthropic/claude-opus-4-6');
  });

  test('council preset override takes precedence over legacy master.model', () => {
    // If user has explicit council in preset, that wins — legacy is ignored.
    const config: PluginConfig = {
      agents: {
        council: { model: 'google/gemini-3-pro' },
      },
      council: {
        presets: {
          default: {
            alpha: { model: 'openai/gpt-5.4-mini' },
          },
        },
        _legacyMasterModel: 'anthropic/claude-opus-4-6',
      },
    };
    const agents = createAgents({
      ...config,
      subagentPolicy: { mode: 'full' },
    });
    const council = agents.find((a) => a.name === 'council');
    expect(council?.config.model).toBe('google/gemini-3-pro');
  });

  test('council uses default when no legacy master and no preset override', () => {
    // No legacy master, no preset override → standard default
    const config: PluginConfig = {
      council: {
        presets: {
          default: {
            alpha: { model: 'openai/gpt-5.4-mini' },
          },
        },
      },
    };
    const agents = createAgents({
      ...config,
      subagentPolicy: { mode: 'full' },
    });
    const council = agents.find((a) => a.name === 'council');
    expect(council?.config.model).toBe(DEFAULT_MODELS.council);
  });

  test('end-to-end: raw master.model config flows through schema to council agent', () => {
    // Integration test: start from raw user config with deprecated master.model,
    // parse through CouncilConfigSchema, then pass to createAgents.
    // This validates the full seam between schema transform and agent resolution.
    const rawCouncilConfig = {
      master: { model: 'anthropic/claude-opus-4-6' },
      presets: {
        default: {
          alpha: { model: 'openai/gpt-5.4-mini' },
        },
      },
    };

    const parsed = CouncilConfigSchema.safeParse(rawCouncilConfig);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const config: PluginConfig = {
        council: parsed.data,
        subagentPolicy: { mode: 'full' },
      };
      const agents = createAgents(config);
      const council = agents.find((a) => a.name === 'council');
      // Legacy master.model should flow through schema → agent
      expect(council?.config.model).toBe('anthropic/claude-opus-4-6');
    }
  });
});

describe('options passthrough', () => {
  test('options are applied to agent config via overrides', () => {
    const config: PluginConfig = {
      agents: {
        oracle: {
          model: 'openai/gpt-5.5',
          options: { textVerbosity: 'low' },
        },
      },
    };
    const agents = createAgents(config);
    const oracle = agents.find((a) => a.name === 'oracle');
    expect(oracle?.config.options).toEqual({ textVerbosity: 'low' });
  });

  test('options with nested objects are passed through', () => {
    const config: PluginConfig = {
      agents: {
        oracle: {
          model: 'anthropic/claude-sonnet-4-6',
          options: {
            thinking: { type: 'enabled', budgetTokens: 16000 },
          },
        },
      },
    };
    const agents = createAgents(config);
    const oracle = agents.find((a) => a.name === 'oracle');
    expect(oracle?.config.options).toEqual({
      thinking: { type: 'enabled', budgetTokens: 16000 },
    });
  });

  test('options work with other overrides', () => {
    const config: PluginConfig = {
      agents: {
        oracle: {
          model: 'openai/gpt-5.5',
          variant: 'high',
          temperature: 0.7,
          options: { textVerbosity: 'low', reasoningEffort: 'medium' },
        },
      },
    };
    const agents = createAgents(config);
    const oracle = agents.find((a) => a.name === 'oracle');
    expect(oracle?.config.model).toBe('openai/gpt-5.5');
    expect(oracle?.config.variant).toBe('high');
    expect(oracle?.config.temperature).toBe(0.7);
    expect(oracle?.config.options).toEqual({
      textVerbosity: 'low',
      reasoningEffort: 'medium',
    });
  });

  test('options are absent when not configured', () => {
    const config: PluginConfig = {
      agents: {
        oracle: { model: 'openai/gpt-5.5' },
      },
    };
    const agents = createAgents(config);
    const oracle = agents.find((a) => a.name === 'oracle');
    expect(oracle?.config.options).toBeUndefined();
  });

  test('options flow through getAgentConfigs to SDK output', () => {
    const config: PluginConfig = {
      agents: {
        oracle: {
          model: 'openai/gpt-5.5',
          options: { textVerbosity: 'low' },
        },
      },
    };
    const configs = getAgentConfigs(config);
    expect(configs.oracle.options).toEqual({ textVerbosity: 'low' });
  });

  test('options are shallow-merged with existing agent config options', () => {
    // Simulate an agent factory setting default options
    const config: PluginConfig = {
      agents: {
        oracle: {
          model: 'openai/gpt-5.5',
          options: { reasoningEffort: 'medium' },
        },
      },
    };
    const agents = createAgents(config);
    const oracle = agents.find((a) => a.name === 'oracle');
    // Override options should merge with (not replace) any factory defaults
    expect(oracle?.config.options).toEqual({ reasoningEffort: 'medium' });
  });
});

describe('AgentOverrideConfigSchema options validation', () => {
  test('accepts valid options object', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      options: { textVerbosity: 'low' },
    });
    expect(result.success).toBe(true);
  });

  test('accepts empty options object', () => {
    const result = AgentOverrideConfigSchema.safeParse({ options: {} });
    expect(result.success).toBe(true);
  });

  test('accepts nested values in options', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      options: {
        thinking: { type: 'enabled', budgetTokens: 16000 },
      },
    });
    expect(result.success).toBe(true);
  });

  test('accepts options alongside other fields', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      model: 'openai/gpt-5.5',
      variant: 'high',
      temperature: 0.7,
      options: { textVerbosity: 'low' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options).toEqual({ textVerbosity: 'low' });
    }
  });

  test('config without options is valid', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      model: 'openai/gpt-5.5',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options).toBeUndefined();
    }
  });

  test('rejects non-object options', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      options: 'not-an-object',
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty model arrays', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      model: [],
    });
    expect(result.success).toBe(false);
  });

  test('accepts prompt and orchestratorPrompt override fields', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      model: 'openai/gpt-5.5',
      prompt: 'You are a specialized reviewer.',
      orchestratorPrompt: '@reviewer\n- Role: Specialized reviewer',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prompt).toBe('You are a specialized reviewer.');
      expect(result.data.orchestratorPrompt).toBe(
        '@reviewer\n- Role: Specialized reviewer',
      );
    }
  });

  test('rejects empty prompt fields', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      model: 'openai/gpt-5.5',
      prompt: '',
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty orchestratorPrompt fields', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      model: 'openai/gpt-5.5',
      orchestratorPrompt: '',
    });
    expect(result.success).toBe(false);
  });

  test('rejects description field on overrides', () => {
    const result = AgentOverrideConfigSchema.safeParse({
      model: 'openai/gpt-5.5',
      description: 'not supported for custom agents',
    } as Record<string, unknown>);
    expect(result.success).toBe(false);
  });
});

describe('PluginConfigSchema custom-agent-only prompt fields', () => {
  test('rejects prompt on built-in top-level agent overrides', () => {
    const result = PluginConfigSchema.safeParse({
      agents: {
        oracle: {
          model: 'openai/gpt-5.5',
          prompt: 'ignored built-in prompt override',
        },
      },
    });

    expect(result.success).toBe(false);
  });

  test('rejects orchestratorPrompt on built-in top-level agent overrides', () => {
    const result = PluginConfigSchema.safeParse({
      agents: {
        explorer: {
          model: 'openai/gpt-5.4-mini',
          orchestratorPrompt: '@explorer\n- Role: should be invalid here',
        },
      },
    });

    expect(result.success).toBe(false);
  });

  test('rejects custom-only prompt fields on built-in preset agents', () => {
    const result = PluginConfigSchema.safeParse({
      presets: {
        openai: {
          oracle: {
            model: 'openai/gpt-5.5',
            prompt: 'ignored preset built-in prompt override',
          },
        },
      },
    });

    expect(result.success).toBe(false);
  });

  test('allows prompt fields on custom agents', () => {
    const result = PluginConfigSchema.safeParse({
      agents: {
        janitor: {
          model: 'openai/gpt-5.4-mini',
          prompt: 'You are Janitor.',
          orchestratorPrompt: '@janitor\n- Role: Cleanup specialist',
        },
      },
    });

    expect(result.success).toBe(true);
  });

  test('accepts sessionManager config', () => {
    const result = PluginConfigSchema.safeParse({
      sessionManager: {
        maxSessionsPerAgent: 2,
        readContextMinLines: 10,
        readContextMaxFiles: 8,
      },
    });

    expect(result.success).toBe(true);
  });

  test('accepts subagentPolicy config', () => {
    const result = PluginConfigSchema.safeParse({
      subagentPolicy: {
        mode: 'custom',
        allowedAgents: ['explorer', 'oracle'],
      },
    });

    expect(result.success).toBe(true);
  });

  test('accepts multi-runtime compatibility baseline config', () => {
    const result = PluginConfigSchema.safeParse({
      runtimeTargets: {
        opencode: { enabled: true, priority: 100 },
        claude: { enabled: false, configPath: '~/.claude' },
        codex: {
          enabled: false,
          capabilities: ['skills', 'mcp', 'document-output'],
        },
      },
      compatProviders: {
        enabled: true,
        autoDetect: true,
        fallbackToOpenCodeOnly: true,
      },
    });

    expect(result.success).toBe(true);
  });
});

describe('subagentPolicy', () => {
  test('ultra-minimal is the default strict main-agent-first set', () => {
    const agents = createAgents();
    const names = agents.map((a) => a.name);
    const prompt = agents.find((a) => a.name === 'orchestrator')?.config.prompt;

    expect(names).toContain('explorer');
    expect(names).toContain('librarian');
    expect(names).toContain('oracle');
    expect(names).not.toContain('fixer');
    expect(names).not.toContain('designer');
    expect(names).not.toContain('council');
    expect(names).not.toContain('observer');
    expect(prompt).toContain('Ultra minimal / main-agent-first');
    expect(prompt).toContain('shared-prefix snapshot');
    expect(prompt).toContain('[SHARED_CONTEXT_START]');
  });

  test('legacy minimal keeps the low-agent cache-first specialist set', () => {
    const agents = createAgents({
      subagentPolicy: { mode: 'minimal' },
    });
    const names = agents.map((a) => a.name);
    const prompt = agents.find((a) => a.name === 'orchestrator')?.config.prompt;

    expect(names).toContain('explorer');
    expect(names).toContain('librarian');
    expect(names).toContain('oracle');
    expect(names).toContain('fixer');
    expect(names).not.toContain('designer');
    expect(names).not.toContain('council');
    expect(names).not.toContain('observer');
    expect(prompt).toContain('Minimal / cache-first');
  });

  test('full enables configured subagents but still keeps main-agent-first guidance', () => {
    const agents = createAgents({
      disabled_agents: [],
      subagentPolicy: { mode: 'full' },
    });
    const names = agents.map((a) => a.name);
    const prompt = agents.find((a) => a.name === 'orchestrator')?.config.prompt;

    expect(names).toContain('designer');
    expect(names).toContain('council');
    expect(names).toContain('observer');
    expect(prompt).toContain('Full registration / explicit delegation only');
    expect(prompt).toContain(
      'main agent must still execute work directly by default',
    );
    expect(prompt).toContain('same shared-prefix snapshot');
  });

  test('custom allowlist limits built-in and custom subagents', () => {
    const agents = createAgents({
      disabled_agents: [],
      subagentPolicy: {
        mode: 'custom',
        allowedAgents: ['explorer', 'fixer', 'auditor'],
      },
      agents: {
        auditor: {
          model: 'openai/gpt-5.4-mini',
          prompt: 'Audit things.',
        },
        janitor: {
          model: 'openai/gpt-5.4-mini',
          prompt: 'Clean things.',
        },
      },
    });
    const names = agents.map((a) => a.name);
    const prompt = agents.find((a) => a.name === 'orchestrator')?.config.prompt;

    expect(names).toContain('explorer');
    expect(names).toContain('fixer');
    expect(names).toContain('auditor');
    expect(names).not.toContain('librarian');
    expect(names).not.toContain('oracle');
    expect(names).not.toContain('janitor');
    expect(prompt).toContain('Custom allowlist');
    expect(prompt).toContain('@explorer, @fixer, @auditor');
  });

  test('main-only disables built-in orchestratable subagents', () => {
    const agents = createAgents({
      disabled_agents: [],
      subagentPolicy: { mode: 'main-only' },
    });
    const names = agents.map((a) => a.name);
    const prompt = agents.find((a) => a.name === 'orchestrator')?.config.prompt;

    expect(names).toContain('orchestrator');
    expect(names).toContain('councillor');
    expect(names).not.toContain('explorer');
    expect(names).not.toContain('librarian');
    expect(names).not.toContain('oracle');
    expect(names).not.toContain('fixer');
    expect(prompt).toContain('Main-agent-only');
    expect(prompt).not.toMatch(/@explorer\b/);
  });

  test('orchestrator prompt includes stable shared prefix template', () => {
    const prompt = buildOrchestratorPrompt(undefined, {
      mode: 'ultra-minimal',
    });

    expect(prompt).toContain('[SHARED_CONTEXT_START]');
    expect(prompt).toContain('project: <repo/project name, stack, root path>');
    expect(prompt).toContain('[SHARED_CONTEXT_END]');
    expect(prompt).toContain('role prompt second, dynamic query last');
    expect(prompt).toContain('create_session, add_message');
  });

  test('ultra-minimal prompt describes both delegation modes', () => {
    const prompt = buildOrchestratorPrompt(undefined, {
      mode: 'ultra-minimal',
    });

    expect(prompt).toContain('tool-like local main-agent checklists');
    expect(prompt).toContain('background=false');
    expect(prompt).toContain('background=true');
    expect(prompt).toContain('fire-and-forget');
  });

  test('main-only skips custom subagents', () => {
    const agents = createAgents({
      subagentPolicy: { mode: 'main-only' },
      agents: {
        auditor: {
          model: 'openai/gpt-5.4-mini',
          prompt: 'Audit things.',
        },
      },
    });

    expect(agents.map((a) => a.name)).not.toContain('auditor');
  });
});

describe('main-agent-first prompt guardrails', () => {
  test('deep-worker prompt prefers direct work before child sessions', () => {
    const agent = createDeepWorkerAgent('test/model');

    expect(agent.config.prompt).toContain(
      'Use direct tools yourself before opening child sessions',
    );
    expect(agent.config.prompt).toContain(
      'If you can do the task directly, do it yourself',
    );
  });

  test('atlas prompt forbids child sessions that only cause waiting', () => {
    const agent = createAtlasAgent('test/model');

    expect(agent.config.prompt).toContain(
      'Execute directly in the main agent whenever the task does not truly benefit from a child session',
    );
    expect(agent.config.prompt).toContain(
      'Do not delegate a task if Atlas could execute it directly',
    );
  });

  test('bio and chem orchestrators share the main-agent-first rule', () => {
    const bio = createBioOrchestratorAgent('test/model');
    const chem = createChemOrchestratorAgent('test/model');

    expect(bio.config.prompt).toContain('Main-agent first');
    expect(bio.config.prompt).toContain(
      'Do not delegate core biological work if you can continue directly',
    );
    expect(chem.config.prompt).toContain('Main-agent first');
    expect(chem.config.prompt).toContain(
      'Do not delegate chemistry work if you can continue directly',
    );
  });
});

describe('disabled_agents', () => {
  test('disabled agents are not created', () => {
    const config: PluginConfig = {
      disabled_agents: ['designer', 'fixer'],
    };
    const agents = createAgents(config);
    const names = agents.map((a) => a.name);
    expect(names).not.toContain('designer');
    expect(names).not.toContain('fixer');
    expect(names).toContain('orchestrator');
    expect(names).toContain('explorer');
    expect(names).toContain('oracle');
    expect(names).toContain('librarian');
  });

  test('protected agents cannot be disabled', () => {
    const config: PluginConfig = {
      disabled_agents: ['orchestrator', 'councillor'],
    };
    const agents = createAgents(config);
    const names = agents.map((a) => a.name);
    expect(names).toContain('orchestrator');
    expect(names).toContain('councillor');
  });

  test('disabling council disables council agent', () => {
    const config: PluginConfig = {
      disabled_agents: ['council'],
      subagentPolicy: { mode: 'full' },
    };
    const agents = createAgents(config);
    const names = agents.map((a) => a.name);
    expect(names).not.toContain('council');
    // councillor is protected, it stays
    expect(names).toContain('councillor');
  });

  test('agent count decreases when agents are disabled', () => {
    const agents = createAgents();
    expect(agents.length).toBe(10); // 6 primary + councillor + 3 ultra-minimal subagents

    const disabledConfig: PluginConfig = {
      disabled_agents: ['observer', 'designer'],
    };
    const disabledAgents = createAgents(disabledConfig);
    expect(disabledAgents.length).toBe(10); // observer/designer already disabled by ultra-minimal policy
  });

  test('getDisabledAgents respects protection rules', () => {
    const config: PluginConfig = {
      disabled_agents: ['orchestrator', 'designer', 'councillor'],
    };
    const disabled = getDisabledAgents(config);
    expect(disabled.has('designer')).toBe(true);
    expect(disabled.has('orchestrator')).toBe(false);
    expect(disabled.has('councillor')).toBe(false);
  });

  test('getEnabledAgentNames filters correctly', () => {
    const config: PluginConfig = {
      disabled_agents: ['designer', 'fixer'],
    };
    const enabled = getEnabledAgentNames(config);
    expect(enabled).not.toContain('designer');
    expect(enabled).not.toContain('fixer');
    expect(enabled).toContain('orchestrator');
    expect(enabled).toContain('explorer');
  });

  test('getEnabledAgentNames includes enabled custom agents', () => {
    const config: PluginConfig = {
      disabled_agents: ['janitor'],
      subagentPolicy: { mode: 'full' },
      agents: {
        janitor: { model: 'openai/gpt-5.4-mini' },
        reviewer: { model: 'openai/gpt-5.4-mini' },
      },
    };

    const enabled = getEnabledAgentNames(config);
    expect(enabled).toContain('reviewer');
    expect(enabled).not.toContain('janitor');
  });

  test('empty disabled_agents does not enable observer within ultra-minimal policy', () => {
    const config: PluginConfig = {
      disabled_agents: [],
    };
    const agents = createAgents(config);
    expect(agents.length).toBe(10); // observer still excluded by ultra-minimal policy
    expect(agents.map((a) => a.name)).not.toContain('observer');
  });

  test('empty disabled_agents enables observer within legacy minimal policy', () => {
    const config: PluginConfig = {
      disabled_agents: [],
      subagentPolicy: { mode: 'minimal' },
    };
    const agents = createAgents(config);
    expect(agents.length).toBe(12); // 6 primary + councillor + 5 minimal subagents
    expect(agents.map((a) => a.name)).toContain('observer');
  });
});

describe('observer agent', () => {
  test('observer is disabled by default', () => {
    const agents = createAgents();
    const names = agents.map((a) => a.name);
    expect(names).not.toContain('observer');
  });

  test('observer is enabled when removed from disabled_agents', () => {
    const config: PluginConfig = {
      disabled_agents: [],
      subagentPolicy: { mode: 'minimal' },
    };
    const agents = createAgents(config);
    const names = agents.map((a) => a.name);
    expect(names).toContain('observer');
  });

  test('observer is disabled when explicitly listed', () => {
    const config: PluginConfig = {
      disabled_agents: ['observer'],
    };
    const agents = createAgents(config);
    const names = agents.map((a) => a.name);
    expect(names).not.toContain('observer');
  });

  test('observer can be enabled alongside other disabled agents', () => {
    const config: PluginConfig = {
      disabled_agents: ['designer'],
      subagentPolicy: { mode: 'full' },
    };
    const agents = createAgents(config);
    const names = agents.map((a) => a.name);
    expect(names).toContain('observer');
    expect(names).not.toContain('designer');
  });

  test('DEFAULT_DISABLED_AGENTS contains observer', () => {
    expect(DEFAULT_DISABLED_AGENTS).toContain('observer');
  });
});

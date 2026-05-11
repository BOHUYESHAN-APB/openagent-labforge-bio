/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { generateLiteConfig, MODEL_MAPPINGS } from './providers';

describe('providers', () => {
  test('MODEL_MAPPINGS includes supported providers', () => {
    const keys = Object.keys(MODEL_MAPPINGS);
    expect(keys.sort()).toEqual([
      'ds-first',
      'openai',
      'openai-go',
    ]);
  });

  test('generateLiteConfig defaults to free and includes all presets', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: false,
      installCustomSkills: false,
      reset: false,
    });

    expect(config.$schema).toBe(
      'https://unpkg.com/extendai-lab@latest/extendai-lab.schema.json',
    );
    // Default is free — no model binding
    expect(config.preset).toBe('free');
    expect((config.presets as any).free).toBeDefined();
    expect((config.presets as any)['ds-first']).toBeDefined();
    expect((config.presets as any).openai).toBeDefined();
    expect((config.presets as any)['openai-go']).toBeDefined();
    expect((config.presets as any).custom).toBeDefined();

    // free preset has no model assignments
    const freeAgents = (config.presets as any).free;
    expect(freeAgents.orchestrator.model).toBeUndefined();
  });

  test('generateLiteConfig uses correct ds-first models', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: false,
      installCustomSkills: false,
      reset: false,
    });

    const agents = (config.presets as any)['ds-first'];
    expect(agents.orchestrator.model).toBe(MODEL_MAPPINGS['ds-first'].orchestrator.model);
    expect(agents.orchestrator.variant).toBe('max');
    expect(agents.oracle.model).toBe('opencode-go/deepseek-v4-pro');
    expect(agents.oracle.variant).toBe('high');
    expect(agents.explorer.model).toBe('opencode-go/deepseek-v4-flash');
    expect(agents.fixer.model).toBe('opencode-go/deepseek-v4-flash');
    expect(agents.designer.model).toBe('opencode-go/mimo-v2.5');
  });

  test('generateLiteConfig uses correct openai models', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: false,
      installCustomSkills: false,
      reset: false,
    });

    const agents = (config.presets as any).openai;
    // orchestrator uses gpt-5.4 (not 5.5)
    expect(agents.orchestrator.model).toBe('openai/gpt-5.4');
    expect(agents.orchestrator.variant).toBe('high');
    // oracle uses gpt-5.5 for review quality
    expect(agents.oracle.model).toBe('openai/gpt-5.5');
    expect(agents.oracle.variant).toBe('xhigh');
    // light agents use gpt-5.4-mini
    expect(agents.explorer.model).toBe('openai/gpt-5.4-mini');
    expect(agents.fixer.model).toBe('openai/gpt-5.4-mini');
    expect(agents.designer.model).toBe('openai/gpt-5.4-mini');
  });

  test('generateLiteConfig can set ds-first as active preset', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: false,
      installCustomSkills: false,
      preset: 'ds-first',
      reset: false,
    });

    expect(config.preset).toBe('ds-first');
    const agents = (config.presets as any)['ds-first'];
    expect(agents.orchestrator.model).toBe('opencode-go/deepseek-v4-pro');
  });

  test('generateLiteConfig rejects unsupported preset', () => {
    expect(() =>
      generateLiteConfig({
        hasTmux: false,
        installSkills: false,
        installCustomSkills: false,
        preset: 'not-real',
        reset: false,
      }),
    ).toThrow('Unsupported preset "not-real"');
  });

  test('generateLiteConfig enables tmux when requested', () => {
    const config = generateLiteConfig({
      hasTmux: true,
      installSkills: false,
      installCustomSkills: false,
      reset: false,
    });

    expect(config.tmux).toBeDefined();
    expect((config.tmux as any).enabled).toBe(true);
    expect((config.tmux as any).layout).toBe('main-vertical');
  });

  test('generateLiteConfig includes default skills', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: true,
      installCustomSkills: false,
      reset: false,
    });

    const agents = (config.presets as any).free;
    expect(agents.orchestrator.skills).toEqual(['*']);
    expect(agents.oracle.skills).toContain('simplify');
    expect(agents.designer.skills).toContain('agent-browser');
    expect(agents.explorer.skills).toEqual([]);
    expect(agents.fixer.skills).toEqual(['karpathy-guidelines']);
  });

  test('generateLiteConfig includes mcps field', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: false,
      installCustomSkills: false,
      reset: false,
    });

    const agents = (config.presets as any).free;
    expect(agents.orchestrator.mcps).toBeDefined();
    expect(Array.isArray(agents.orchestrator.mcps)).toBe(true);
    expect(agents.orchestrator.mcps).toEqual(['*', '!context7']);
    expect(agents.librarian.mcps).toContain('websearch');
    expect(agents.librarian.mcps).toContain('context7');
    expect(agents.librarian.mcps).toContain('grep_app');
  });
});

import { describe, expect, test } from 'bun:test';
import { detectEnvironment, isFeatureEnabled } from './environment-detect';

describe('detectEnvironment', () => {
  test('original OpenCode: no MiMo signals', () => {
    const env = detectEnvironment({}, '/tmp/nonexistent');
    expect(env.isMimoCode).toBe(false);
    expect(env.duplicateFeatures).toEqual([]);
  });

  test('detects via config fields (dream)', () => {
    const env = detectEnvironment({ dream: { auto: true } }, '/tmp/nonexistent');
    expect(env.isMimoCode).toBe(true);
    expect(env.detectionMethod).toBe('config');
    expect(env.duplicateFeatures).toContain('dream');
  });

  test('detects via config fields (distill)', () => {
    const env = detectEnvironment({ distill: { auto: true } }, '/tmp/nonexistent');
    expect(env.isMimoCode).toBe(true);
    expect(env.detectionMethod).toBe('config');
  });

  test('detects via config fields (voice)', () => {
    const env = detectEnvironment({ voice: {} }, '/tmp/nonexistent');
    expect(env.isMimoCode).toBe(true);
    expect(env.detectionMethod).toBe('config');
  });

  test('detects via config fields (model_groups)', () => {
    const env = detectEnvironment({ model_groups: {} }, '/tmp/nonexistent');
    expect(env.isMimoCode).toBe(true);
    expect(env.detectionMethod).toBe('config');
  });

  test('detects via env var MIMOCODE_CLIENT', () => {
    const original = process.env.MIMOCODE_CLIENT;
    process.env.MIMOCODE_CLIENT = 'cli';
    try {
      const env = detectEnvironment({}, '/tmp/nonexistent');
      expect(env.isMimoCode).toBe(true);
      expect(env.detectionMethod).toBe('env');
    } finally {
      if (original === undefined) delete process.env.MIMOCODE_CLIENT;
      else process.env.MIMOCODE_CLIENT = original;
    }
  });

  test('config detection takes precedence over env', () => {
    const original = process.env.MIMOCODE_CLIENT;
    process.env.MIMOCODE_CLIENT = 'cli';
    try {
      const env = detectEnvironment({ dream: {} }, '/tmp/nonexistent');
      expect(env.detectionMethod).toBe('config');
    } finally {
      if (original === undefined) delete process.env.MIMOCODE_CLIENT;
      else process.env.MIMOCODE_CLIENT = original;
    }
  });
});

describe('isFeatureEnabled', () => {
  test('original OpenCode: all features enabled', () => {
    const env = detectEnvironment({}, '/tmp/nonexistent');
    expect(isFeatureEnabled(env, 'dream')).toBe(true);
    expect(isFeatureEnabled(env, 'goal')).toBe(true);
    expect(isFeatureEnabled(env, 'memory')).toBe(true);
    expect(isFeatureEnabled(env, 'custom-feature')).toBe(true);
  });

  test('MiMo Code: duplicate features disabled', () => {
    const env = detectEnvironment({ dream: {} }, '/tmp/nonexistent');
    expect(isFeatureEnabled(env, 'dream')).toBe(false);
    expect(isFeatureEnabled(env, 'distill')).toBe(false);
    expect(isFeatureEnabled(env, 'memory')).toBe(false);
    expect(isFeatureEnabled(env, 'goal')).toBe(false);
    expect(isFeatureEnabled(env, 'voice')).toBe(false);
  });

  test('MiMo Code: non-duplicate features enabled', () => {
    const env = detectEnvironment({ dream: {} }, '/tmp/nonexistent');
    expect(isFeatureEnabled(env, 'auto-continue')).toBe(true);
    expect(isFeatureEnabled(env, 'auto-review')).toBe(true);
    expect(isFeatureEnabled(env, 'plan-mode')).toBe(true);
    expect(isFeatureEnabled(env, 'loop')).toBe(true);
    expect(isFeatureEnabled(env, 'team-mode')).toBe(true);
    expect(isFeatureEnabled(env, 'council')).toBe(true);
  });
});

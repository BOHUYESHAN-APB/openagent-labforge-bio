/**
 * LoopStateMachine 测试
 *
 * 注意：FSM 使用文件系统持久化，通过临时目录隔离测试。
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  classifyTaskExecutor,
  createLoop,
  deleteLoop,
  getLoop,
  isLoopActive,
  resetLoopModule,
  routeVerdict,
} from './index';

const TEST_LOOP_DIR = '.opencode/loops';
const originalCwd = process.cwd;
let testDir = '';

beforeEach(() => {
  testDir = join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '.opencode',
    'test-tmp',
    `loop-test-${Date.now()}`,
  );
  mkdirSync(join(testDir, TEST_LOOP_DIR), { recursive: true });
  process.cwd = () => testDir;
  resetLoopModule();
});

afterEach(() => {
  process.cwd = originalCwd;
  resetLoopModule();
});

// ──────────────────────────────────────────
// FSM: createLoop / getLoop / transition
// ──────────────────────────────────────────

describe('LoopStateMachine: create / get / transition', () => {
  test('createLoop returns FSM in interview phase', () => {
    const fsm = createLoop('Fix auth module', 'engineer', 'engineer');

    expect(fsm.state.loop_id).toMatch(/^loop_/);
    expect(fsm.state.description).toBe('Fix auth module');
    expect(fsm.state.executor_type).toBe('engineer');
    expect(fsm.state.return_agent).toBe('engineer');
    expect(fsm.state.phase).toBe('interview');
    expect(fsm.state.iteration).toBe(1);
    expect(fsm.state.max_iterations).toBe(12);
    expect(fsm.state.transition_seq).toBe(1); // idle→interview
    expect(fsm.effectiveAgent).toBe('prometheus');
  });

  test('persists state to file', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer');
    const statePath = join(testDir, TEST_LOOP_DIR, 'active.json');
    expect(existsSync(statePath)).toBe(true);
    const saved = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(saved.loop_id).toBe(fsm.state.loop_id);
    expect(saved.phase).toBe('interview');
    expect(saved.needs_kickstart).toBe(false);
    expect(saved.pending_switch.phase).toBe('interview');
  });

  test('getLoop returns null when no loop exists', () => {
    expect(getLoop()).toBeNull();
  });

  test('getLoop recovers from disk after creation', () => {
    createLoop('RNA-seq analysis', 'bio-orchestrator', 'atlas');
    const fsm = getLoop();
    expect(fsm).not.toBeNull();
    expect(fsm!.state.description).toBe('RNA-seq analysis');
    expect(fsm!.state.executor_type).toBe('bio-orchestrator');
  });

  test('getLoop returns null when state file is corrupted', () => {
    const statePath = join(testDir, TEST_LOOP_DIR, 'active.json');
    writeFileSync(statePath, 'not valid json', 'utf-8');
    expect(getLoop()).toBeNull();
  });

  test('valid transitions enforced', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer');
    expect(fsm.state.phase).toBe('interview');

    // interview → execute ✓
    expect(fsm.transition('execute')).toBe(true);
    expect(fsm.state.phase).toBe('execute');

    // execute → review ✓
    expect(fsm.transition('review')).toBe(true);
    expect(fsm.state.phase).toBe('review');

    // review → interview ✗ (invalid)
    expect(fsm.transition('interview')).toBe(false);
    expect(fsm.state.phase).toBe('review'); // unchanged

    // review → redesign ✓
    expect(fsm.transition('redesign')).toBe(true);
    expect(fsm.state.phase).toBe('redesign');
  });

  test('transition auto-sets needs_kickstart for execute/redesign', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer');
    // interview: needs_kickstart was false initially
    expect(fsm.state.needs_kickstart).toBe(false);

    // interview → execute: auto-sets needs_kickstart
    fsm.transition('execute');
    expect(fsm.state.needs_kickstart).toBe(true);

    // consume
    const kickstart = fsm.consumeKickstart();
    expect(kickstart).not.toBeNull();
    expect(fsm.state.needs_kickstart).toBe(false);
  });

  test('transition_seq increments on each transition', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer');
    expect(fsm.state.transition_seq).toBe(1); // idle→interview

    fsm.transition('execute');
    expect(fsm.state.transition_seq).toBe(2);

    fsm.transition('review');
    expect(fsm.state.transition_seq).toBe(3);
  });
});

// ──────────────────────────────────────────
// Kickstart
// ──────────────────────────────────────────

describe('LoopStateMachine: kickstart', () => {
  test('consumeKickstart returns execute prompt', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer');
    fsm.transition('execute');
    const prompt = fsm.consumeKickstart();
    expect(prompt).toContain('Execute Phase');
    expect(prompt).toContain('engineer');
  });

  test('consumeKickstart is idempotent (same seq only once)', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer');
    fsm.transition('execute');
    expect(fsm.consumeKickstart()).not.toBeNull(); // first call
    expect(fsm.consumeKickstart()).toBeNull(); // second call → null
  });

  test('consumeKickstart returns redesign prompt', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer');
    // Follow valid transition path: idle → interview → execute → review → redesign
    fsm.transition('execute');
    fsm.transition('review');
    fsm.transition('redesign');
    const prompt = fsm.consumeKickstart();
    expect(prompt).toContain('Redesign Phase');
    expect(prompt).toContain('autonomous');
  });

  test('needsKickstart getter works correctly', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer');
    // interview: auto-set to false initially, no kickstart consumed
    expect(fsm.needsKickstart).toBe(false);

    fsm.transition('execute');
    expect(fsm.needsKickstart).toBe(true);

    fsm.consumeKickstart();
    expect(fsm.needsKickstart).toBe(false);
  });
});

// ──────────────────────────────────────────
// deleteLoop / isLoopActive
// ──────────────────────────────────────────

describe('deleteLoop / isLoopActive', () => {
  test('isLoopActive: false with no loop, true with loop, false after delete', () => {
    expect(isLoopActive()).toBe(false);

    createLoop('Test', 'engineer', 'engineer');
    expect(isLoopActive()).toBe(true);

    deleteLoop();
    expect(isLoopActive()).toBe(false);
  });

  test('deleteLoop is safe to call with no loop', () => {
    deleteLoop();
    expect(true).toBe(true);
  });

  test('isLoopActive: false when phase is done', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer');
    fsm.state.phase = 'done';
    fsm.persist();
    expect(isLoopActive()).toBe(false);
  });
});

// ──────────────────────────────────────────
// Verdict routing (compat routeVerdict)
// ──────────────────────────────────────────

describe('routeVerdict', () => {
  test('approve → done', () => {
    createLoop('Test', 'engineer', 'engineer');
    const result = routeVerdict('approve');
    expect(result).not.toBeNull();
    expect(result!.phase).toBe('done');
    expect(result!.agent).toBe('engineer');
  });

  test('reject scope=planner → redesign, increments iteration', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer');
    // Must be in review phase to reject to redesign
    fsm.transition('execute');
    fsm.transition('review');
    const result = routeVerdict('reject', 'planner', 'design needs work');
    const fsm2 = getLoop();
    expect(result!.phase).toBe('redesign');
    expect(result!.agent).toBe('prometheus');

    expect(fsm2.state.phase).toBe('redesign');
    expect(fsm2.state.iteration).toBe(2);
  });

  test('reject scope=executor → execute', () => {
    createLoop('Test', 'engineer', 'engineer');
    const result = routeVerdict('reject', 'executor', 'fix null check');
    expect(result!.phase).toBe('execute');
    expect(result!.agent).toBe('engineer');
    expect(result!.fixInstructions).toBe('fix null check');
  });

  test('reject no scope → execute default', () => {
    createLoop('Test', 'engineer', 'engineer');
    const result = routeVerdict('reject');
    expect(result!.phase).toBe('execute');
  });

  test('reject scope=planner beyond max_iterations → done', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer');
    fsm.state.iteration = 12;
    fsm.persist();

    const result = routeVerdict('reject', 'planner', 'still not good');
    expect(result!.phase).toBe('done');
  });

  test('returns null when no loop active', () => {
    expect(routeVerdict('approve')).toBeNull();
  });
});

// ──────────────────────────────────────────
// classifyTaskExecutor
// ──────────────────────────────────────────

describe('classifyTaskExecutor', () => {
  test.each([
    'RNA-seq differential expression',
    '基因表达分析',
    '蛋白质结构预测',
    'genome assembly',
  ])('bio: %s', (desc) => {
    expect(classifyTaskExecutor(desc)).toBe('bio-orchestrator');
  });

  test.each([
    '化学分子模拟',
    'material synthesis',
    'reaction mechanism',
  ])('chem: %s', (desc) => {
    expect(classifyTaskExecutor(desc)).toBe('chem-orchestrator');
  });

  test.each([
    'Fix login page',
    'Refactor API routes',
    '任意自由文本',
  ])('engineer: %s', (desc) => {
    expect(classifyTaskExecutor(desc)).toBe('engineer');
  });
});

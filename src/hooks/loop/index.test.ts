/**
 * Loop 状态管理器测试
 *
 * 注意：createLoop/getLoop/updateLoop/deleteLoop 使用文件系统，
 * 通过临时目录隔离测试。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  classifyTaskExecutor,
  createLoop,
  deleteLoop,
  getLoop,
  isLoopActive,
  routeVerdict,
  updateLoop,
} from './index';

// ──────────────────────────────────────────
// 测试辅助：劫持 cwd 到临时目录
// ──────────────────────────────────────────

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
});

afterEach(() => {
  process.cwd = originalCwd;
});

// ──────────────────────────────────────────
// createLoop / getLoop
// ──────────────────────────────────────────

describe('createLoop / getLoop', () => {
  test('creates loop state file with default values', () => {
    const loop = createLoop('Fix auth module', 'engineer', 'engineer');

    // Validate returned object
    expect(loop.loop_id).toBeDefined();
    expect(loop.loop_id).toMatch(/^loop_/);
    expect(loop.description).toBe('Fix auth module');
    expect(loop.executor_type).toBe('engineer');
    expect(loop.return_agent).toBe('engineer');
    expect(loop.phase).toBe('interview');
    expect(loop.iteration).toBe(1);
    expect(loop.max_iterations).toBe(3);
    expect(loop.verdict_history).toEqual([]);
    expect(loop.created_at).toBeGreaterThan(0);
    expect(loop.updated_at).toBeGreaterThan(0);

    // Validate persisted file
    const statePath = join(testDir, TEST_LOOP_DIR, 'active.json');
    expect(existsSync(statePath)).toBe(true);
    const saved = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(saved.loop_id).toBe(loop.loop_id);
    expect(saved.description).toBe('Fix auth module');
  });

  test('getLoop returns null when no loop exists', () => {
    expect(getLoop()).toBeNull();
  });

  test('getLoop returns the active loop after creation', () => {
    createLoop('RNA-seq analysis', 'bio-orchestrator', 'atlas');
    const loop = getLoop();
    expect(loop).not.toBeNull();
    expect(loop!.description).toBe('RNA-seq analysis');
    expect(loop!.executor_type).toBe('bio-orchestrator');
  });

  test('getLoop returns null when state file is corrupted', () => {
    const statePath = join(testDir, TEST_LOOP_DIR, 'active.json');
    writeFileSync(statePath, 'not valid json', 'utf-8');
    expect(getLoop()).toBeNull();
  });
});

// ──────────────────────────────────────────
// updateLoop
// ──────────────────────────────────────────

describe('updateLoop', () => {
  test('updates fields and sets updated_at', async () => {
    const created = createLoop('Test', 'engineer', 'engineer');
    const originalUpdated = created.updated_at;

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 5));
    const updated = updateLoop({ phase: 'execute', iteration: 2 });
    expect(updated).not.toBeNull();
    expect(updated!.phase).toBe('execute');
    expect(updated!.iteration).toBe(2);
    expect(updated!.updated_at).toBeGreaterThan(originalUpdated);
  });

  test('returns null when no loop exists', () => {
    const result = updateLoop({ phase: 'execute' });
    expect(result).toBeNull();
  });

  test('persists changes to file', () => {
    createLoop('Test', 'engineer', 'engineer');
    updateLoop({ phase: 'review' });

    const loop = getLoop();
    expect(loop!.phase).toBe('review');

    const statePath = join(testDir, TEST_LOOP_DIR, 'active.json');
    const saved = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(saved.phase).toBe('review');
  });
});

// ──────────────────────────────────────────
// deleteLoop / isLoopActive
// ──────────────────────────────────────────

describe('deleteLoop / isLoopActive', () => {
  test('isLoopActive returns false with no loop', () => {
    expect(isLoopActive()).toBe(false);
  });

  test('isLoopActive returns true when loop exists', () => {
    createLoop('Test', 'engineer', 'engineer');
    expect(isLoopActive()).toBe(true);
  });

  test('deleteLoop removes state file', () => {
    createLoop('Test', 'engineer', 'engineer');
    expect(isLoopActive()).toBe(true);

    deleteLoop();

    expect(isLoopActive()).toBe(false);
    expect(getLoop()).toBeNull();
  });

  test('deleteLoop is safe to call with no loop', () => {
    // Should not throw
    deleteLoop();
    expect(true).toBe(true);
  });
});

// ──────────────────────────────────────────
// routeVerdict
// ──────────────────────────────────────────

describe('routeVerdict', () => {
  test('approve → done, deletes loop', () => {
    createLoop('Test', 'engineer', 'engineer');
    const result = routeVerdict('approve');

    expect(result).not.toBeNull();
    expect(result!.phase).toBe('done');
    expect(result!.agent).toBe('engineer');
    // Loop should be deleted
    expect(isLoopActive()).toBe(false);
  });

  test('reject with scope=planner → redesign, increments iteration', () => {
    createLoop('Test', 'engineer', 'engineer');
    const result = routeVerdict('reject', 'planner', 'design needs work');

    expect(result).not.toBeNull();
    expect(result!.phase).toBe('redesign');
    expect(result!.agent).toBe('prometheus');

    // Loop state should be updated
    const loop = getLoop();
    expect(loop!.phase).toBe('redesign');
    expect(loop!.iteration).toBe(2);
  });

  test('reject with scope=executor → execute, includes fix instructions', () => {
    createLoop('Test', 'engineer', 'engineer');
    const result = routeVerdict('reject', 'executor', 'fix the null check');

    expect(result).not.toBeNull();
    expect(result!.phase).toBe('execute');
    expect(result!.agent).toBe('engineer');
    expect(result!.fixInstructions).toBe('fix the null check');
  });

  test('reject with no scope → execute (default)', () => {
    createLoop('Test', 'engineer', 'engineer');
    const result = routeVerdict('reject');

    expect(result!.phase).toBe('execute');
    expect(result!.agent).toBe('engineer');
  });

  test('reject with scope=planner exceeding max_iterations → done', () => {
    createLoop('Test', 'engineer', 'engineer');
    // Manually set iteration to 3 (max)
    updateLoop({ iteration: 3 });

    const result = routeVerdict('reject', 'planner', 'still not good');
    expect(result).not.toBeNull();
    expect(result!.phase).toBe('done');
    // Loop should be deleted
    expect(isLoopActive()).toBe(false);
  });

  test('needs_user → execute with pause message', () => {
    createLoop('Test', 'engineer', 'engineer');
    const result = routeVerdict('needs_user');

    expect(result).not.toBeNull();
    expect(result!.phase).toBe('execute');
    expect(result!.agent).toBe('engineer');
    expect(result!.fixInstructions).toContain('Loop paused');
  });

  test('returns null when no loop is active', () => {
    const result = routeVerdict('approve');
    expect(result).toBeNull();
  });
});

// ──────────────────────────────────────────
// classifyTaskExecutor
// ──────────────────────────────────────────

describe('classifyTaskExecutor', () => {
  // Bio keywords
  test.each([
    'RNA-seq differential expression',
    '基因表达分析',
    'DNA methylation calling',
    '蛋白质结构预测',
    '生物信息学流程',
    'genome assembly pipeline',
    'ChIP-seq peak calling',
    '转录组数据分析',
    'PCA and clustering',
  ])('detects bio task: %s', (desc) => {
    expect(classifyTaskExecutor(desc)).toBe('bio-orchestrator');
  });

  // Chem keywords
  test.each([
    '化学分子模拟',
    'material synthesis design',
    'reaction mechanism analysis',
    '化学反应路径',
  ])('detects chem task: %s', (desc) => {
    expect(classifyTaskExecutor(desc)).toBe('chem-orchestrator');
  });

  // Default to engineer
  test.each([
    'Fix login page styling',
    'Refactor API routes',
    'Add dark mode toggle',
    'Implement caching layer',
    '任意自由文本',
    'Build frontend component',
  ])('defaults to engineer: %s', (desc) => {
    expect(classifyTaskExecutor(desc)).toBe('engineer');
  });
});

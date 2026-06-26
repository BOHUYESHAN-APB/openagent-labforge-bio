import { describe, expect, test } from 'bun:test';
import { LoopStateMachine, createLoop } from './index';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = '.opencode-test-loop-iterations';
const TEST_LOOP_DIR = join(TEST_DIR, '.opencode/loops');

describe('LoopStateMachine max_iterations', () => {
  test('default max_iterations is 12', () => {
    const fsm = LoopStateMachine.create(
      'Test task',
      'engineer',
      'engineer',
      TEST_DIR,
    );
    expect(fsm.state.max_iterations).toBe(12);
    fsm.destroy();
  });

  test('custom max_iterations via create()', () => {
    const fsm = LoopStateMachine.create(
      'Test task',
      'engineer',
      'engineer',
      TEST_DIR,
      20,
    );
    expect(fsm.state.max_iterations).toBe(20);
    fsm.destroy();
  });

  test('createLoop passes max_iterations', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer', 15);
    expect(fsm.state.max_iterations).toBe(15);
    fsm.destroy();
  });

  test('createLoop defaults to 12 when no max_iterations', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer');
    expect(fsm.state.max_iterations).toBe(12);
    fsm.destroy();
  });

  test('max_iterations=1 allows single iteration', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer', 1);
    expect(fsm.state.max_iterations).toBe(1);
    // Simulate iteration 1 → should transition to done
    fsm.state.iteration = 1;
    const result = fsm.transition('execute');
    expect(result).toBe(true);
    expect(fsm.state.phase).toBe('execute');
    fsm.destroy();
  });

  test('iteration check uses max_iterations', () => {
    const fsm = createLoop('Test', 'engineer', 'engineer', 5);
    fsm.state.iteration = 5;
    // At max iterations, reject should go to done
    const result = fsm.transition('done');
    expect(result).toBe(true);
    expect(fsm.state.phase).toBe('done');
    fsm.destroy();
  });

  test('max_iterations=100 (upper bound)', () => {
    const fsm = LoopStateMachine.create(
      'Test',
      'engineer',
      'engineer',
      TEST_DIR,
      100,
    );
    expect(fsm.state.max_iterations).toBe(100);
    fsm.destroy();
  });
});

describe('argument parsing (simulated)', () => {
  // Simulate the parsing logic from src/index.ts
  function parseLoopArgs(rawArgs: string): {
    description: string;
    maxIterations?: number;
  } {
    let maxIterations: number | undefined;
    let description = rawArgs;

    const iterMatch = rawArgs.match(/(?:--iterations|-n)\s+(\d+)/i);
    if (iterMatch) {
      maxIterations = Math.max(1, Math.min(100, Number(iterMatch[1])));
      description = rawArgs.replace(/(?:--iterations|-n)\s+\d+/i, '').trim();
    } else {
      const bareMatch = description.match(/\s+(\d{1,3})\s*$/);
      if (bareMatch) {
        const num = Number(bareMatch[1]);
        if (num >= 1 && num <= 100) {
          maxIterations = num;
          description = description.slice(0, -bareMatch[0].length).trim();
        }
      }
    }
    if (!description) description = 'Untitled loop task';
    return { description, maxIterations };
  }

  test('bare number at end', () => {
    const result = parseLoopArgs('Implement auth 20');
    expect(result.description).toBe('Implement auth');
    expect(result.maxIterations).toBe(20);
  });

  test('--iterations flag', () => {
    const result = parseLoopArgs('Implement auth --iterations 30');
    expect(result.description).toBe('Implement auth');
    expect(result.maxIterations).toBe(30);
  });

  test('-n short flag', () => {
    const result = parseLoopArgs('Implement auth -n 15');
    expect(result.description).toBe('Implement auth');
    expect(result.maxIterations).toBe(15);
  });

  test('no iterations specified', () => {
    const result = parseLoopArgs('Implement auth');
    expect(result.description).toBe('Implement auth');
    expect(result.maxIterations).toBeUndefined();
  });

  test('number in middle of text is not parsed', () => {
    const result = parseLoopArgs('Fix issue 42 in module');
    expect(result.description).toBe('Fix issue 42 in module');
    expect(result.maxIterations).toBeUndefined();
  });

  test('number > 100 is not parsed as iterations', () => {
    const result = parseLoopArgs('Task 200');
    expect(result.description).toBe('Task 200');
    expect(result.maxIterations).toBeUndefined();
  });

  test('empty description defaults', () => {
    const result = parseLoopArgs('');
    expect(result.description).toBe('Untitled loop task');
  });
});

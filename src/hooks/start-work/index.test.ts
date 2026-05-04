import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createBoulderState,
  ensureProjectPlansDir,
  readBoulderState,
  writeBoulderState,
} from '../../boulder';
import {
  getProjectBoulderFile,
  getProjectPlansDir,
} from '../../paths/plugin-paths';
import { createStartWorkHook } from '../start-work/index';

describe('start work hook', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'start-work-hook-test-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('noPlanMessage when no plans exist', async () => {
    const hook = createStartWorkHook({
      directory: workspaceRoot,
    } as Parameters<typeof createStartWorkHook>[0]);
    const output = { parts: [] as Array<{ type: string; text?: string }> };

    await hook.handleCommandExecuteBefore(
      {
        command: 'ol-start-work',
        sessionID: 's1',
        arguments: '',
      },
      output,
    );

    const text = output.parts[0]?.text ?? '';

    expect(text).toContain('No matching Prometheus plan found');
    expect(text).toContain(getProjectPlansDir(workspaceRoot));
    expect(text).not.toContain('/start-work');
  });

  test('selects single plan and creates boulder state', async () => {
    const plansDir = ensureProjectPlansDir(workspaceRoot);
    const planPath = join(plansDir, 'test-plan.md');
    writeFileSync(
      planPath,
      '- [ ] 1. First task\n- [ ] 2. Second task\n- [ ] F1. Review\n',
    );

    const hook = createStartWorkHook({
      directory: workspaceRoot,
    } as Parameters<typeof createStartWorkHook>[0]);
    const output = { parts: [] as Array<{ type: string; text?: string }> };

    await hook.handleCommandExecuteBefore(
      {
        command: 'ol-start-work',
        sessionID: 's1',
        arguments: 'test-plan',
      },
      output,
    );

    const text = output.parts[0]?.text ?? '';

    expect(text).toContain('@atlas');
    expect(text).toContain('test-plan');
    expect(text).toContain('s1');
    expect(text).not.toContain('/start-work');
    expect(existsSync(getProjectBoulderFile(workspaceRoot))).toBe(true);

    const state = readBoulderState(workspaceRoot);
    expect(state?.plan_name).toBe('test-plan');
    expect(state?.session_ids).toContain('s1');
    expect(state?.agent).toBe('atlas');
  });

  test('resumes active incomplete boulder', async () => {
    const plansDir = ensureProjectPlansDir(workspaceRoot);
    const planPath = join(plansDir, 'test-plan.md');
    writeFileSync(
      planPath,
      '- [x] 1. First task\n- [ ] 2. Second task\n- [ ] F1. Review\n',
    );

    const state = createBoulderState({
      planPath,
      sessionID: 's1',
      agent: 'atlas',
    });
    writeBoulderState(workspaceRoot, state);

    const hook = createStartWorkHook({
      directory: workspaceRoot,
    } as Parameters<typeof createStartWorkHook>[0]);
    const output = { parts: [] as Array<{ type: string; text?: string }> };

    await hook.handleCommandExecuteBefore(
      {
        command: 'ol-start-work',
        sessionID: 's2',
        arguments: 'test-plan',
      },
      output,
    );

    const text = output.parts[0]?.text ?? '';
    expect(text).toContain('1/3');
    expect(text).toContain('2 remaining');

    const nextState = readBoulderState(workspaceRoot);
    expect(nextState?.session_ids).toContain('s1');
    expect(nextState?.session_ids).toContain('s2');
  });

  test('sets output.message.agent to atlas', async () => {
    const plansDir = ensureProjectPlansDir(workspaceRoot);
    writeFileSync(
      join(plansDir, 'test-plan.md'),
      '- [ ] 1. First task\n- [ ] 2. Second task\n- [ ] F1. Review\n',
    );

    const hook = createStartWorkHook({
      directory: workspaceRoot,
    } as Parameters<typeof createStartWorkHook>[0]);
    const output: {
      parts: Array<{ type: string; text?: string }>;
      message: { agent?: string };
    } = {
      parts: [],
      message: {},
    };

    await hook.handleCommandExecuteBefore(
      {
        command: 'ol-start-work',
        sessionID: 's1',
        arguments: 'test-plan',
      },
      output,
    );

    expect(output.message.agent).toBe('atlas');
  });

  test('handles --worktree argument', async () => {
    const plansDir = ensureProjectPlansDir(workspaceRoot);
    writeFileSync(
      join(plansDir, 'test-plan.md'),
      '- [ ] 1. First task\n- [ ] 2. Second task\n- [ ] F1. Review\n',
    );

    const hook = createStartWorkHook({
      directory: workspaceRoot,
    } as Parameters<typeof createStartWorkHook>[0]);
    const output = { parts: [] as Array<{ type: string; text?: string }> };

    await hook.handleCommandExecuteBefore(
      {
        command: 'ol-start-work',
        sessionID: 's1',
        arguments: 'test-plan --worktree /tmp/wt',
      },
      output,
    );

    const state = readBoulderState(workspaceRoot);
    expect(state?.worktree_path).toBe('/tmp/wt');
  });

  test('handles --worktree=path argument', async () => {
    const plansDir = ensureProjectPlansDir(workspaceRoot);
    writeFileSync(
      join(plansDir, 'test-plan.md'),
      '- [ ] 1. First task\n- [ ] 2. Second task\n- [ ] F1. Review\n',
    );

    const hook = createStartWorkHook({
      directory: workspaceRoot,
    } as Parameters<typeof createStartWorkHook>[0]);
    const output = { parts: [] as Array<{ type: string; text?: string }> };

    await hook.handleCommandExecuteBefore(
      {
        command: 'ol-start-work',
        sessionID: 's1',
        arguments: 'test-plan --worktree=/tmp/wt2',
      },
      output,
    );

    const state = readBoulderState(workspaceRoot);
    expect(state?.worktree_path).toBe('/tmp/wt2');
  });

  test('active complete boulder does not corrupt new plan', async () => {
    // Create old completed plan and its boulder state
    const plansDir = ensureProjectPlansDir(workspaceRoot);
    writeFileSync(
      join(plansDir, 'old-plan.md'),
      '- [x] 1. Done\n- [x] F1. Review\n',
    );
    writeBoulderState(
      workspaceRoot,
      createBoulderState({
        planPath: join(plansDir, 'old-plan.md'),
        sessionID: 's-old',
      }),
    );

    // Create new plan
    writeFileSync(
      join(plansDir, 'new-plan.md'),
      '- [ ] 1. Fresh task\n- [ ] F1. Review\n',
    );

    const hook = createStartWorkHook({
      directory: workspaceRoot,
    } as Parameters<typeof createStartWorkHook>[0]);
    const output = { parts: [] as Array<{ type: string; text?: string }> };

    await hook.handleCommandExecuteBefore(
      {
        command: 'ol-start-work',
        sessionID: 's-new',
        arguments: 'new-plan',
      },
      output,
    );

    const boulderState = readBoulderState(workspaceRoot);
    expect(boulderState?.plan_name).toBe('new-plan');
    expect(boulderState?.session_ids).toEqual(['s-new']);
    expect(output.parts[0].text).toContain('new-plan');
    expect(output.parts[0].text).not.toContain('old-plan');
  });
});

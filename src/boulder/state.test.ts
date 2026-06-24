import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendSessionId,
  createBoulderState,
  ensureProjectPlansDir,
  findPlanFile,
  getLegacyPlansDir,
  getPlanProgress,
  listPlanFiles,
  readBoulderState,
  writeBoulderState,
} from './state';

describe('boulder state', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'boulder-state-test-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('getPlanProgress counts top-level structured checkboxes', () => {
    const progress = getPlanProgress(
      '- [ ] 1. First task\n- [x] 2. Second task\n- [ ] F1. Review\n',
    );

    expect(progress).toEqual({
      total: 3,
      completed: 1,
      remaining: 2,
      percent: 33,
      isComplete: false,
      nextTaskLabel: '1. First task',
    });
  });

  test('getPlanProgress ignores indented checkboxes', () => {
    const progress = getPlanProgress(
      '  - [ ] 1. Nested task\n- [ ] 1. Real task\n',
    );

    expect(progress.total).toBe(1);
    expect(progress.completed).toBe(0);
    expect(progress.remaining).toBe(1);
    expect(progress.percent).toBe(0);
    expect(progress.isComplete).toBe(false);
  });

  test('getPlanProgress detects full completion', () => {
    const progress = getPlanProgress(
      '- [x] 1. First task\n- [X] 2. Second task\n- [x] F1. Review\n',
    );

    expect(progress.isComplete).toBe(true);
    expect(progress.total).toBe(3);
    expect(progress.completed).toBe(3);
    expect(progress.remaining).toBe(0);
    expect(progress.percent).toBe(100);
  });

  test('getPlanProgress returns zeros for empty content', () => {
    expect(getPlanProgress('')).toEqual({
      total: 0,
      completed: 0,
      remaining: 0,
      percent: 0,
      isComplete: false,
    });
  });

  test('listPlanFiles finds plans in project and legacy dirs', () => {
    const projectPlansDir = ensureProjectPlansDir(workspaceRoot);
    const legacyPlansDir = getLegacyPlansDir(workspaceRoot);
    mkdirSync(legacyPlansDir, { recursive: true });

    const projectPlanPath = join(projectPlansDir, 'project-plan.md');
    const legacyPlanPath = join(legacyPlansDir, 'legacy-plan.md');
    writeFileSync(projectPlanPath, '- [ ] 1. Project task\n');
    writeFileSync(legacyPlanPath, '- [x] 1. Legacy task\n');

    const plans = listPlanFiles(workspaceRoot);
    const paths = plans.map((plan) => plan.path);

    expect(paths).toContain(projectPlanPath);
    expect(paths).toContain(legacyPlanPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  test('writeBoulderState and readBoulderState roundtrip', () => {
    const state = createBoulderState({
      planPath: join(workspaceRoot, 'plan.md'),
      sessionID: 'session-1',
      agent: 'atlas',
      worktreePath: join(workspaceRoot, 'worktree'),
    });

    writeBoulderState(workspaceRoot, state);

    expect(readBoulderState(workspaceRoot)).toEqual(state);
    expect(
      readFileSync(
        join(workspaceRoot, '.opencode', 'extendai-lab', 'boulder.json'),
        'utf8',
      ),
    ).toContain('session-1');
  });

  test('createBoulderState creates with defaults', () => {
    const state = createBoulderState({
      planPath: join(workspaceRoot, 'plan.md'),
      sessionID: 'session-1',
    });

    expect(state.active_plan).toBe(join(workspaceRoot, 'plan.md'));
    expect(state.plan_name).toBe('plan');
    expect(state.session_ids).toEqual(['session-1']);
    expect(state.agent).toBe('atlas');
    expect(state.worktree_path).toBeUndefined();
    expect(state.started_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  test('appendSessionId appends only new IDs', () => {
    const state = createBoulderState({
      planPath: join(workspaceRoot, 'plan.md'),
      sessionID: 'session-1',
    });

    const withNewId = appendSessionId(state, 'session-2');
    expect(withNewId.session_ids).toEqual(['session-1', 'session-2']);

    const withDuplicateId = appendSessionId(withNewId, 'session-2');
    expect(withDuplicateId.session_ids).toEqual(['session-1', 'session-2']);
  });

  test('findPlanFile matches exact name', () => {
    const plansDir = ensureProjectPlansDir(workspaceRoot);
    writeFileSync(join(plansDir, 'alpha.md'), '- [ ] 1. Alpha task\n');
    writeFileSync(join(plansDir, 'beta.md'), '- [ ] 1. Beta task\n');

    const found = findPlanFile(workspaceRoot, 'beta');

    expect(found?.name).toBe('beta');
    expect(found?.path).toBe(join(plansDir, 'beta.md'));
  });

  test('findPlanFile returns null with no plans', () => {
    expect(findPlanFile(workspaceRoot)).toBeNull();
    expect(findPlanFile(workspaceRoot, 'missing')).toBeNull();
  });
});

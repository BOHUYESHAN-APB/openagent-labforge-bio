import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureProjectPlansDir, readBoulderState } from '../../boulder';
import { getProjectBoulderFile } from '../../paths/plugin-paths';
import { EffectiveAgentOverlayManager } from '../../utils';
import { createCheckpointResumeHook } from './index';

function makeCheckpointWithPlan(
  planName: string,
  planPath: string,
  remaining = '2',
): string {
  return `CHECKPOINT CONTEXT

RESUME INSTRUCTIONS
-------------------
Active execution plan name: ${planName}
Active execution plan path: ${planPath}
Top-level plan tasks remaining: ${remaining}
`;
}

describe('checkpoint resume hook', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'checkpoint-resume-hook-test-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function writeSessionCheckpoint(sessionID: string, content: string): void {
    const dir = join(
      workspaceRoot,
      '.opencode',
      'extendai-lab',
      'checkpoints',
      'by-session',
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${sessionID}.md`), content);
  }

  function writeLatestCheckpoint(content: string): void {
    const dir = join(workspaceRoot, '.opencode', 'extendai-lab', 'checkpoints');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'latest.md'), content);
  }

  function writePlan(name: string, content: string): string {
    const plansDir = ensureProjectPlansDir(workspaceRoot);
    const path = join(plansDir, `${name}.md`);
    writeFileSync(path, content);
    return path;
  }

  test('restores executor overlay and boulder state from current session checkpoint', async () => {
    const plansDir = ensureProjectPlansDir(workspaceRoot);
    const planPath = join(plansDir, 'restored-plan.md');
    writeFileSync(
      planPath,
      '- [x] 1. First task\n- [ ] 2. Continue execution\n- [ ] F1. Review\n',
    );
    writeSessionCheckpoint(
      's1',
      makeCheckpointWithPlan('restored-plan', planPath),
    );

    const overlayManager = new EffectiveAgentOverlayManager();
    const hook = createCheckpointResumeHook(
      { directory: workspaceRoot } as Parameters<
        typeof createCheckpointResumeHook
      >[0],
      {
        overlayManager,
        getCurrentAgent: () => 'orchestrator',
      },
    );
    const output: {
      parts: Array<{ type: string; text?: string }>;
      message: { agent?: string };
    } = {
      parts: [],
      message: {},
    };

    await hook.handleCommandExecuteBefore(
      { command: 'ol-checkpoint-resume', sessionID: 's1', arguments: '' },
      output,
    );

    expect(output.message.agent).toBe('atlas');
    expect(output.parts[0]?.text).toContain('@executor (internal id: atlas)');
    expect(output.parts[0]?.text).toContain(`Restored plan file: ${planPath}`);
    expect(output.parts[0]?.text).toContain('Control returns to: orchestrator');
    expect(existsSync(getProjectBoulderFile(workspaceRoot))).toBe(true);
    expect(readBoulderState(workspaceRoot)?.plan_name).toBe('restored-plan');
    expect(readBoulderState(workspaceRoot)?.session_ids).toContain('s1');

    const overlay = overlayManager.getCurrent('s1');
    expect(overlay?.phase).toBe('execute');
    expect(overlay?.agent).toBe('atlas');
    expect(overlay?.returnAgent).toBe('orchestrator');
  });

  test('reads latest checkpoint with explicit latest argument', async () => {
    const plansDir = ensureProjectPlansDir(workspaceRoot);
    const planPath = join(plansDir, 'fallback-plan.md');
    writeFileSync(planPath, '- [ ] 1. Continue\n- [ ] F1. Review\n');
    writeLatestCheckpoint(makeCheckpointWithPlan('fallback-plan', planPath));

    const hook = createCheckpointResumeHook({
      directory: workspaceRoot,
    } as Parameters<typeof createCheckpointResumeHook>[0]);
    const output: {
      parts: Array<{ type: string; text?: string }>;
      message: { agent?: string };
    } = {
      parts: [],
      message: {},
    };

    await hook.handleCommandExecuteBefore(
      {
        command: 'ol-checkpoint-resume',
        sessionID: 'missing-session',
        arguments: 'latest',
      },
      output,
    );

    expect(output.parts[0]?.text).toContain('fallback-plan');
    expect(output.message.agent).toBe('atlas');
    expect(readBoulderState(workspaceRoot)?.plan_name).toBe('fallback-plan');
  });

  test('does nothing when checkpoint has no active execution plan', async () => {
    writeSessionCheckpoint('s1', 'CHECKPOINT CONTEXT\n');

    const overlayManager = new EffectiveAgentOverlayManager();
    const hook = createCheckpointResumeHook(
      { directory: workspaceRoot } as Parameters<
        typeof createCheckpointResumeHook
      >[0],
      { overlayManager },
    );
    const output: {
      parts: Array<{ type: string; text?: string }>;
      message: { agent?: string };
    } = {
      parts: [],
      message: {},
    };

    await hook.handleCommandExecuteBefore(
      { command: 'ol-checkpoint-resume', sessionID: 's1', arguments: '' },
      output,
    );

    expect(output.parts).toHaveLength(0);
    expect(output.message.agent).toBeUndefined();
    expect(overlayManager.getCurrent('s1')).toBeUndefined();
    expect(existsSync(getProjectBoulderFile(workspaceRoot))).toBe(false);
  });

  // ── New tests ──────────────────────────────────────────────────────

  test('1. session isolation: reading checkpoint from session A does NOT read session B checkpoint', async () => {
    const planA = writePlan('plan-a', '- [ ] 1. Task A\n');
    const planB = writePlan('plan-b', '- [ ] 1. Task B\n');
    writeSessionCheckpoint('A', makeCheckpointWithPlan('plan-a', planA));
    writeSessionCheckpoint('B', makeCheckpointWithPlan('plan-b', planB));

    const overlayManager = new EffectiveAgentOverlayManager();
    const hook = createCheckpointResumeHook(
      { directory: workspaceRoot } as Parameters<
        typeof createCheckpointResumeHook
      >[0],
      { overlayManager },
    );
    const output: {
      parts: Array<{ type: string; text?: string }>;
      message: { agent?: string };
    } = {
      parts: [],
      message: {},
    };

    await hook.handleCommandExecuteBefore(
      { command: 'ol-checkpoint-resume', sessionID: 'A', arguments: '' },
      output,
    );

    expect(output.parts[0]?.text).toContain('plan-a');
    expect(output.parts[0]?.text).not.toContain('plan-b');
    expect(readBoulderState(workspaceRoot)?.plan_name).toBe('plan-a');
  });

  test('2. session isolation: reading checkpoint from session A does NOT fall back to latest.md', async () => {
    const planLatest = writePlan('plan-latest', '- [ ] 1. Latest task\n');
    writeLatestCheckpoint(makeCheckpointWithPlan('plan-latest', planLatest));

    // Session A checkpoint has NO plan info — only generic text
    writeSessionCheckpoint('A', 'CHECKPOINT CONTEXT\nSome generic text\n');

    const overlayManager = new EffectiveAgentOverlayManager();
    const hook = createCheckpointResumeHook(
      { directory: workspaceRoot } as Parameters<
        typeof createCheckpointResumeHook
      >[0],
      { overlayManager },
    );
    const output: {
      parts: Array<{ type: string; text?: string }>;
      message: { agent?: string };
    } = {
      parts: [],
      message: {},
    };

    await hook.handleCommandExecuteBefore(
      { command: 'ol-checkpoint-resume', sessionID: 'A', arguments: '' },
      output,
    );

    // Should NOT fall back to latest.md — returns early (no plan info found)
    expect(output.parts).toHaveLength(0);
    expect(output.message.agent).toBeUndefined();
    expect(overlayManager.getCurrent('A')).toBeUndefined();
    expect(existsSync(getProjectBoulderFile(workspaceRoot))).toBe(false);
  });

  test('3. explicit session ID reads that session by-session checkpoint', async () => {
    const planExplicit = writePlan('plan-explicit', '- [ ] 1. Explicit task\n');
    writeSessionCheckpoint(
      'ses_abc123',
      makeCheckpointWithPlan('plan-explicit', planExplicit),
    );

    const overlayManager = new EffectiveAgentOverlayManager();
    const hook = createCheckpointResumeHook(
      { directory: workspaceRoot } as Parameters<
        typeof createCheckpointResumeHook
      >[0],
      { overlayManager },
    );
    const output: {
      parts: Array<{ type: string; text?: string }>;
      message: { agent?: string };
    } = {
      parts: [],
      message: {},
    };

    await hook.handleCommandExecuteBefore(
      {
        command: 'ol-checkpoint-resume',
        sessionID: 'current-session',
        arguments: 'ses_abc123',
      },
      output,
    );

    expect(output.parts[0]?.text).toContain('plan-explicit');
    expect(output.message.agent).toBe('atlas');
    expect(readBoulderState(workspaceRoot)?.plan_name).toBe('plan-explicit');
    // Checkpoint source argument should mention the explicit session ID
    expect(output.parts[0]?.text).toContain('ses_abc123');
  });

  test('4. explicit "latest" reads latest.md', async () => {
    const planLatest = writePlan('plan-latest-2', '- [ ] 1. Latest task\n');
    writeLatestCheckpoint(makeCheckpointWithPlan('plan-latest-2', planLatest));

    const hook = createCheckpointResumeHook({
      directory: workspaceRoot,
    } as Parameters<typeof createCheckpointResumeHook>[0]);
    const output: {
      parts: Array<{ type: string; text?: string }>;
      message: { agent?: string };
    } = {
      parts: [],
      message: {},
    };

    await hook.handleCommandExecuteBefore(
      {
        command: 'ol-checkpoint-resume',
        sessionID: 'any-session',
        arguments: 'latest',
      },
      output,
    );

    expect(output.parts[0]?.text).toContain('plan-latest-2');
    expect(output.message.agent).toBe('atlas');
    expect(readBoulderState(workspaceRoot)?.plan_name).toBe('plan-latest-2');
  });

  test('5. no argument reads current session by-session checkpoint only', async () => {
    const planCurrent = writePlan('plan-current', '- [ ] 1. Current task\n');
    const planOther = writePlan('plan-other', '- [ ] 1. Other task\n');
    const planLatestOnly = writePlan(
      'plan-latest-only',
      '- [ ] 1. Latest task\n',
    );

    // Write all three sources
    writeSessionCheckpoint(
      's1',
      makeCheckpointWithPlan('plan-current', planCurrent),
    );
    writeSessionCheckpoint(
      's2',
      makeCheckpointWithPlan('plan-other', planOther),
    );
    writeLatestCheckpoint(
      makeCheckpointWithPlan('plan-latest-only', planLatestOnly),
    );

    const overlayManager = new EffectiveAgentOverlayManager();
    const hook = createCheckpointResumeHook(
      { directory: workspaceRoot } as Parameters<
        typeof createCheckpointResumeHook
      >[0],
      { overlayManager },
    );
    const output: {
      parts: Array<{ type: string; text?: string }>;
      message: { agent?: string };
    } = {
      parts: [],
      message: {},
    };

    await hook.handleCommandExecuteBefore(
      { command: 'ol-checkpoint-resume', sessionID: 's1', arguments: '' },
      output,
    );

    // Should use s1's plan only
    expect(output.parts[0]?.text).toContain('plan-current');
    expect(output.parts[0]?.text).not.toContain('plan-other');
    expect(output.parts[0]?.text).not.toContain('plan-latest-only');
    expect(readBoulderState(workspaceRoot)?.plan_name).toBe('plan-current');
  });

  test('6. missing checkpoint with no argument returns early without crashing', async () => {
    // No checkpoint files created at all
    const hook = createCheckpointResumeHook({
      directory: workspaceRoot,
    } as Parameters<typeof createCheckpointResumeHook>[0]);
    const output: {
      parts: Array<{ type: string; text?: string }>;
      message: { agent?: string };
    } = {
      parts: [],
      message: {},
    };

    await expect(
      hook.handleCommandExecuteBefore(
        {
          command: 'ol-checkpoint-resume',
          sessionID: 'nonexistent',
          arguments: '',
        },
        output,
      ),
    ).resolves.toBeUndefined();

    expect(output.parts).toHaveLength(0);
    expect(output.message.agent).toBeUndefined();
    expect(existsSync(getProjectBoulderFile(workspaceRoot))).toBe(false);
  });

  test('7. loop FSM state in checkpoint is included in resume context', async () => {
    const planPath = writePlan('loop-plan', '- [ ] 1. Loop task\n');
    writeSessionCheckpoint(
      'loop-session',
      `CHECKPOINT CONTEXT

RESUME INSTRUCTIONS
-------------------
Active execution plan name: loop-plan
Active execution plan path: ${planPath}
Top-level plan tasks remaining: 2

Active Loop: loop_abc123
Loop phase: review
`,
    );

    const overlayManager = new EffectiveAgentOverlayManager();
    const hook = createCheckpointResumeHook(
      { directory: workspaceRoot } as Parameters<
        typeof createCheckpointResumeHook
      >[0],
      { overlayManager },
    );
    const output: {
      parts: Array<{ type: string; text?: string }>;
      message: { agent?: string };
    } = {
      parts: [],
      message: {},
    };

    await hook.handleCommandExecuteBefore(
      {
        command: 'ol-checkpoint-resume',
        sessionID: 'loop-session',
        arguments: '',
      },
      output,
    );

    const text = output.parts[0]?.text ?? '';
    expect(text).toContain('Loop ID: loop_abc123');
    expect(text).toContain('Loop phase: review');
    expect(text).toContain('iteration 1/3');
    expect(text).toContain('Active Loop FSM file: .opencode/loops/active.json');
    // Should also contain execution state
    expect(text).toContain('Restored plan name: loop-plan');
    expect(text).toContain('Restored execution state');
  });

  test('8. loop FSM without execution plan still recovers gracefully', async () => {
    // Checkpoint with loop info but NO execution plan path/name
    writeSessionCheckpoint(
      'loop-only',
      `CHECKPOINT CONTEXT
Prior phase: plan

Active Loop: loop_def456
Loop phase: design
`,
    );

    const overlayManager = new EffectiveAgentOverlayManager();
    const hook = createCheckpointResumeHook(
      { directory: workspaceRoot } as Parameters<
        typeof createCheckpointResumeHook
      >[0],
      {
        overlayManager,
        getCurrentAgent: () => 'orchestrator',
      },
    );
    const output: {
      parts: Array<{ type: string; text?: string }>;
      message: { agent?: string };
    } = {
      parts: [],
      message: {},
    };

    await hook.handleCommandExecuteBefore(
      {
        command: 'ol-checkpoint-resume',
        sessionID: 'loop-only',
        arguments: '',
      },
      output,
    );

    const text = output.parts[0]?.text ?? '';
    // Loop state is present
    expect(text).toContain('Loop ID: loop_def456');
    expect(text).toContain('Loop phase: design');

    // Execution state is NOT present
    expect(text).not.toContain('Restored execution state');
    expect(text).not.toContain('Restored plan name');

    // Prior phase is 'plan' → resume agent should be prometheus
    expect(output.message.agent).toBe('prometheus');
    expect(text).toContain('planner');
    expect(text).toContain('prometheus');

    // No boulder state since no execution plan
    expect(existsSync(getProjectBoulderFile(workspaceRoot))).toBe(false);
  });
});

/// <reference types="bun-types" />

import { describe, expect, mock, test } from 'bun:test';
import { createTaskSessionManagerHook } from './index';

function createHook(options?: {
  shouldManageSession?: (sessionID: string) => boolean;
  readContextMinLines?: number;
  readContextMaxFiles?: number;
}) {
  const hook = createTaskSessionManagerHook(
    {
      client: { session: { status: mock(async () => ({ data: {} })) } },
      directory: '/tmp',
      worktree: '/tmp',
    } as never,
    {
      maxSessionsPerAgent: 2,
      readContextMinLines: options?.readContextMinLines,
      readContextMaxFiles: options?.readContextMaxFiles,
      shouldManageSession: options?.shouldManageSession ?? (() => true),
    },
  );

  return { hook };
}

function createMessages(sessionID: string, text = 'user message') {
  return {
    messages: [
      {
        info: { role: 'user', agent: 'orchestrator', sessionID },
        parts: [{ type: 'text', text }],
      },
    ],
  };
}

function createInjectedCompletionMessages(
  sessionID: string,
  text: string,
  id = 'msg-1',
) {
  return {
    messages: [
      {
        info: { id, role: 'user', agent: 'orchestrator', sessionID },
        parts: [
          { type: 'text', text },
          {
            id: 'part-1',
            synthetic: true,
            type: 'text',
            text: [
              '<task id="ses_bg_789" state="completed">',
              '<summary>Background task completed: Search auth flow</summary>',
              '<task_result>',
              'Mapped auth flow.',
              '</task_result>',
              '</task>',
            ].join('\n'),
          },
        ],
      },
    ],
  };
}

describe('task-session-manager hook', () => {
  test('stores task sessions and injects resumable-session block into user message', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'config schema',
          prompt: 'inspect config schema',
        },
      },
    );

    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );

    const prompt = systemOutput.system.join('\n');
    expect(prompt).toContain('<resumable_sessions>');
    expect(prompt).toContain('### Resumable Sessions');
    expect(prompt).toContain('explorer: exp-1 config schema');
    expect(prompt).toContain('</resumable_sessions>');
  });

  test('registers background task launches and shows background job board', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'Search auth flow',
          background: true,
        },
      },
    );

    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output: [
          '<task id="ses_bg_123" state="running">',
          '<summary>Background task started</summary>',
          '<task_result>',
          'The task is working in the background.',
          '</task_result>',
          '</task>',
        ].join('\n'),
      },
    );

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );

    const prompt = systemOutput.system.join('\n');
    expect(prompt).toContain('### Background Job Board');
    expect(prompt).toContain('SENTINEL: background-job-board-v2');
    expect(prompt).toContain('exp-1 / ses_bg_123 / explorer / running');
    expect(prompt).toContain('Objective: Search auth flow');
  });

  test('updates background job board when terminal task output arrives', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'oracle',
          description: 'Review architecture',
          background: true,
        },
      },
    );

    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output: [
          '<task id="ses_bg_456" state="running">',
          '<summary>Background task started</summary>',
          '<task_result>',
          'Background started',
          '</task_result>',
          '</task>',
        ].join('\n'),
      },
    );

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        args: {
          subagent_type: 'oracle',
          description: 'Review architecture',
        },
      },
    );

    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        output: [
          '<task id="ses_bg_456" state="completed">',
          '<summary>Background task completed: Review architecture</summary>',
          '<task_result>',
          'Use a lane-specific overlay.',
          '</task_result>',
          '</task>',
        ].join('\n'),
      },
    );

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );

    const prompt = systemOutput.system.join('\n');
    expect(prompt).toContain(
      'ora-1 / ses_bg_456 / oracle / completed, unreconciled',
    );
    expect(prompt).toContain('Result: Use a lane-specific overlay.');
  });

  test('appends background job board to user messages via messages transform', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      {
        args: {
          subagent_type: 'explorer',
          description: 'Search auth flow',
          background: true,
        },
      },
    );
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      {
        output: [
          '<task id="ses_bg_123" state="running">',
          '<summary>Background task started</summary>',
          '<task_result>',
          'The task is working in the background.',
          '</task_result>',
          '</task>',
        ].join('\n'),
      },
    );

    const messages = createMessages('parent-1', 'continue implementation');
    await hook['experimental.chat.messages.transform']({}, messages);

    expect(messages.messages[0].parts[0].text).toContain(
      '### Background Job Board',
    );
    expect(messages.messages[0].parts[0].text).toContain(
      'SENTINEL: background-job-board-v2',
    );
  });

  test('reconciles injected terminal background jobs on idle', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      {
        args: {
          subagent_type: 'explorer',
          description: 'Search auth flow',
          background: true,
        },
      },
    );
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      {
        output: [
          '<task id="ses_bg_789" state="running">',
          '<summary>Background task started</summary>',
          '<task_result>',
          'The task is working in the background.',
          '</task_result>',
          '</task>',
        ].join('\n'),
      },
    );

    const messages = createInjectedCompletionMessages(
      'parent-1',
      'continue implementation',
    );
    await hook['experimental.chat.messages.transform']({}, messages);

    let systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );
    expect(systemOutput.system.join('\n')).toContain('completed, unreconciled');

    await hook.event({
      event: {
        type: 'session.idle',
        properties: { sessionID: 'parent-1' },
      },
    });

    systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );
    expect(systemOutput.system.join('\n')).toContain('#### Reusable Sessions');
    expect(systemOutput.system.join('\n')).toContain('reconciled');
    expect(systemOutput.system.join('\n')).not.toContain(
      'completed, unreconciled',
    );
  });

  test('exposes a system transform for resumable sessions', async () => {
    const { hook } = createHook();
    expect('experimental.chat.system.transform' in hook).toBe(true);
  });

  test('resolves remembered aliases to real task ids before execution', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'config schema',
          prompt: 'inspect config schema',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const next = {
      args: {
        subagent_type: 'explorer',
        description: 'continue schema work',
        task_id: 'exp-1',
      },
    };
    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      next,
    );

    expect(next.args.task_id).toBe('child-1');
  });

  test('tracks files read by child sessions in resumable message context', async () => {
    const { hook } = createHook();

    await hook.event({
      event: {
        type: 'session.created',
        properties: { info: { id: 'child-1', parentID: 'parent-1' } },
      },
    });

    await hook['tool.execute.after'](
      {
        tool: 'read',
        sessionID: 'child-1',
        callID: 'read-1',
      },
      {
        output: [
          '<path>/tmp/src/index.ts</path>',
          '<type>file</type>',
          '<content>',
          ...Array.from({ length: 12 }, (_, index) => `${index + 1}: line`),
          '</content>',
        ].join('\n'),
        metadata: {
          loaded: ['/tmp/AGENTS.md'],
        },
      },
    );

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'session files',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );

    const prompt = systemOutput.system.join('\n');
    expect(prompt).toContain('exp-1 session files');
    expect(prompt).toMatch(
      /Context read by exp-1: src[\\/]index\.ts \(12 lines\)/,
    );
  });

  test('accumulates multiple reads and hides tiny read context', async () => {
    const { hook } = createHook();

    await hook.event({
      event: {
        type: 'session.created',
        properties: { info: { id: 'child-1', parentID: 'parent-1' } },
      },
    });

    await hook['tool.execute.after'](
      { tool: 'read', sessionID: 'child-1', callID: 'read-1' },
      {
        output: [
          '<path>/tmp/src/small.ts</path>',
          '<content>',
          ...Array.from({ length: 4 }, (_, index) => `${index + 1}: line`),
          '</content>',
        ].join('\n'),
      },
    );
    await hook['tool.execute.after'](
      { tool: 'read', sessionID: 'child-1', callID: 'read-2' },
      {
        output: [
          '<path>/tmp/src/large.ts</path>',
          '<content>',
          ...Array.from({ length: 7 }, (_, index) => `${index + 1}: line`),
          '</content>',
        ].join('\n'),
      },
    );
    await hook['tool.execute.after'](
      { tool: 'read', sessionID: 'child-1', callID: 'read-3' },
      {
        output: [
          '<path>/tmp/src/large.ts</path>',
          '<content>',
          ...Array.from({ length: 5 }, (_, index) => `${index + 8}: line`),
          '</content>',
        ].join('\n'),
      },
    );

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'line counts' } },
    );
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );

    const prompt = systemOutput.system.join('\n');
    expect(prompt).not.toContain('small.ts');
    expect(prompt).toMatch(/src[\\/]large\.ts \(12 lines\)/);
  });

  test('counts overlapping repeated reads once per unique line', async () => {
    const { hook } = createHook();

    await hook.event({
      event: {
        type: 'session.created',
        properties: { info: { id: 'child-1', parentID: 'parent-1' } },
      },
    });
    for (const call of ['read-1', 'read-2']) {
      await hook['tool.execute.after'](
        { tool: 'read', sessionID: 'child-1', callID: call },
        {
          output: [
            '<path>/tmp/src/repeat.ts</path>',
            '<content>',
            ...Array.from({ length: 12 }, (_, index) => `${index + 1}: line`),
            '</content>',
          ].join('\n'),
        },
      );
    }

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'repeat reads' } },
    );
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );

    const prompt = systemOutput.system.join('\n');
    expect(prompt).toMatch(/src[\\/]repeat\.ts \(12 lines\)/);
    expect(prompt).not.toContain('src/repeat.ts (24 lines)');
  });

  test('uses configured read context thresholds', async () => {
    const { hook } = createHook({
      readContextMinLines: 5,
      readContextMaxFiles: 1,
    });

    await hook.event({
      event: {
        type: 'session.created',
        properties: { info: { id: 'child-1', parentID: 'parent-1' } },
      },
    });
    for (const [file, lines] of [
      ['small.ts', 4],
      ['medium.ts', 5],
      ['large.ts', 12],
    ] as const) {
      await hook['tool.execute.after'](
        { tool: 'read', sessionID: 'child-1', callID: `read-${file}` },
        {
          output: [
            `<path>/tmp/src/${file}</path>`,
            '<content>',
            ...Array.from({ length: lines }, (_, line) => `${line + 1}: line`),
            '</content>',
          ].join('\n'),
        },
      );
    }

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'configured caps' } },
    );
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );

    const prompt = systemOutput.system.join('\n');
    expect(prompt).not.toContain('small.ts');
    expect(prompt).toContain('Context read by exp-1:');
    expect(prompt).toContain('(+1 more)');
  });

  test('ignores reads from unmanaged child sessions', async () => {
    const { hook } = createHook({
      shouldManageSession: (sessionID) => sessionID === 'parent-1',
    });

    await hook.event({
      event: {
        type: 'session.created',
        properties: { info: { id: 'child-1', parentID: 'other-parent' } },
      },
    });
    await hook['tool.execute.after'](
      { tool: 'read', sessionID: 'child-1', callID: 'read-1' },
      {
        output: [
          '<path>/tmp/src/index.ts</path>',
          '<content>',
          ...Array.from({ length: 12 }, (_, index) => `${index + 1}: line`),
          '</content>',
        ].join('\n'),
      },
    );

    await hook['tool.execute.before'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      { args: { subagent_type: 'explorer', description: 'unmanaged read' } },
    );
    await hook['tool.execute.after'](
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );

    const prompt = systemOutput.system.join('\n');
    expect(prompt).toContain('exp-1 unmanaged read');
    expect(prompt).not.toContain('Context read by exp-1');
  });

  test('prunes read context when remembered sessions are evicted', async () => {
    const { hook } = createHook();

    for (const index of [1, 2, 3]) {
      await hook.event({
        event: {
          type: 'session.created',
          properties: {
            info: { id: `child-${index}`, parentID: 'parent-1' },
          },
        },
      });
      await hook['tool.execute.after'](
        { tool: 'read', sessionID: `child-${index}`, callID: `read-${index}` },
        {
          output: [
            `<path>/tmp/src/file-${index}.ts</path>`,
            '<content>',
            ...Array.from({ length: 12 }, (_, line) => `${line + 1}: line`),
            '</content>',
          ].join('\n'),
        },
      );
      await hook['tool.execute.before'](
        { tool: 'task', sessionID: 'parent-1', callID: `call-${index}` },
        { args: { subagent_type: 'explorer', description: `thread ${index}` } },
      );
      await hook['tool.execute.after'](
        { tool: 'task', sessionID: 'parent-1', callID: `call-${index}` },
        {
          output: `task_id: child-${index} (for resuming to continue this task if needed)`,
        },
      );
    }

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );

    const prompt = systemOutput.system.join('\n');
    expect(prompt).not.toContain('exp-1 thread 1');
    expect(prompt).not.toContain('file-1.ts');
    expect(prompt).toContain('exp-2 thread 2');
    expect(prompt).toContain('file-2.ts (12 lines)');
    expect(prompt).toContain('exp-3 thread 3');
    expect(prompt).toContain('file-3.ts (12 lines)');
  });

  test('drops stale remembered sessions and falls back to fresh', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'config schema',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const next = {
      args: {
        subagent_type: 'explorer',
        description: 'continue schema work',
        task_id: 'exp-1',
      },
    };
    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      next,
    );

    expect(next.args.task_id).toBe('child-1');

    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        output: '[ERROR] Session not found',
      },
    );

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );
    expect(systemOutput.system.join('\n')).not.toContain('exp-1');
  });

  test('drops resumed predecessor when success returns a new task id', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'config schema',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'continue schema work',
          task_id: 'exp-1',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        output:
          'task_id: child-2 (for resuming to continue this task if needed)',
      },
    );

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );

    const prompt = systemOutput.system.join('\n');
    expect(prompt).toContain('continue schema work');
    expect(prompt).not.toContain('config schema');
  });

  test('does not drop remembered session on non-runtime session text', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'config schema',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'continue schema work',
          task_id: 'exp-1',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        output: 'Found no session cookies in fixtures, continuing analysis.',
      },
    );

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );

    expect(systemOutput.system.join('\n')).toContain('exp-1 config schema');
  });

  test('ignores sessions that are not orchestrator-managed', async () => {
    const { hook } = createHook({ shouldManageSession: () => false });

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'manual-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'config schema',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'manual-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'manual-1' },
      systemOutput,
    );

    // System should remain unchanged
    expect(systemOutput.system).toEqual(['base']);
  });

  test('cleans up remembered sessions when parent or child is deleted', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'oracle',
          description: 'architecture review',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    await hook.event({
      event: {
        type: 'session.deleted',
        properties: { sessionID: 'child-1' },
      },
    });

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );
    // System should remain unchanged since session was deleted
    expect(systemOutput.system).toEqual(['base']);
  });

  test('cleans pending calls when parent session is deleted', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'oracle',
          description: 'architecture review',
        },
      },
    );

    await hook.event({
      event: {
        type: 'session.deleted',
        properties: { sessionID: 'parent-1' },
      },
    });

    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );

    // System should remain unchanged since session was deleted
    expect(systemOutput.system).toEqual(['base']);
  });

  test('deduplicates pending call order when a resume call is recorded twice', async () => {
    const { hook } = createHook();

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'config schema',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-1',
      },
      {
        output:
          'task_id: child-1 (for resuming to continue this task if needed)',
      },
    );

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        args: {
          subagent_type: 'explorer',
          description: 'continue schema work',
          task_id: 'exp-1',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-2',
      },
      {
        output: '[ERROR] Session not found',
      },
    );

    await hook['tool.execute.before'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-3',
      },
      {
        args: {
          subagent_type: 'oracle',
          description: 'architecture review',
        },
      },
    );
    await hook['tool.execute.after'](
      {
        tool: 'task',
        sessionID: 'parent-1',
        callID: 'call-3',
      },
      {
        output:
          'task_id: child-3 (for resuming to continue this task if needed)',
      },
    );

    const systemOutput = { system: ['base'] };
    await hook['experimental.chat.system.transform'](
      { sessionID: 'parent-1' },
      systemOutput,
    );

    expect(systemOutput.system.join('\n')).toContain(
      'oracle: ora-1 architecture review',
    );
  });
});

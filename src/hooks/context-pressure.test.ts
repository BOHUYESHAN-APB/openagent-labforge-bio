import { describe, expect, mock, test } from 'bun:test';
import { createContextPressureHook } from './context-pressure';

function createCtx() {
  return {
    directory: 'D:/workspace/project',
    client: {
      config: {
        providers: mock(async () => ({
          data: {
            providers: [
              {
                id: 'openai',
                models: {
                  'gpt-5.5': { limit: { context: 200_000 } },
                },
              },
              {
                id: 'anthropic',
                models: {
                  'claude-opus-4-5': { limit: { context: 400_000 } },
                },
              },
            ],
          },
        })),
      },
    },
  };
}

describe('createContextPressureHook', () => {
  test('tracks engineering pressure from message.updated and injects L1 prompt', async () => {
    const ctx = createCtx();
    const hook = createContextPressureHook(ctx as never);

    hook.handleChatMessage({ sessionID: 's1', agent: 'orchestrator' });
    await hook.handleEvent({
      event: {
        type: 'message.updated',
        properties: {
          info: {
            role: 'assistant',
            sessionID: 's1',
            providerID: 'openai',
            modelID: 'gpt-5.5',
            tokens: {
              input: 100_000,
              output: 20_000,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
        },
      },
    });

    const state = hook.getState('s1');
    expect(state?.level).toBe(1);
    expect(Math.round((state?.ratio ?? 0) * 100)).toBe(60);

    const output = { system: [] as string[] };
    await hook.handleSystemTransform({ sessionID: 's1' }, output);
    expect(output.system).toHaveLength(1);
    expect(output.system[0]).toContain('[Context pressure: L1');
    expect(output.system[0]).toContain('60%');
    expect(output.system[0]).toContain('l1-micro-prune');
    expect(output.system[0]).toContain('preserving important facts');
    expect(output.system[0]).toContain('Before any pruning');
  });

  test('uses bio thresholds for bio-orchestrator sessions', async () => {
    const ctx = createCtx();
    const hook = createContextPressureHook(ctx as never);

    hook.handleChatMessage({ sessionID: 'bio1', agent: 'bio-orchestrator' });
    await hook.handleEvent({
      event: {
        type: 'message.updated',
        properties: {
          info: {
            role: 'assistant',
            sessionID: 'bio1',
            providerID: 'openai',
            modelID: 'gpt-5.5',
            tokens: {
              input: 130_000,
              output: 4_000,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
        },
      },
    });

    const state = hook.getState('bio1');
    expect(Math.round((state?.ratio ?? 0) * 100)).toBe(67);
    expect(state?.level).toBe(1);
  });

  test('uses bio thresholds for chem-orchestrator sessions', async () => {
    const ctx = createCtx();
    const hook = createContextPressureHook(ctx as never);

    hook.handleChatMessage({ sessionID: 'chem1', agent: 'chem-orchestrator' });
    await hook.handleEvent({
      event: {
        type: 'message.updated',
        properties: {
          info: {
            role: 'assistant',
            sessionID: 'chem1',
            providerID: 'openai',
            modelID: 'gpt-5.5',
            tokens: {
              input: 130_000,
              output: 4_000,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
        },
      },
    });

    const state = hook.getState('chem1');
    expect(Math.round((state?.ratio ?? 0) * 100)).toBe(67);
    expect(state?.level).toBe(1);
  });

  test('respects configured threshold overrides', async () => {
    const ctx = createCtx();
    const hook = createContextPressureHook(ctx as never, {
      profiles: {
        engineering: { l1: 0.4, l2: 0.55, l3: 0.7 },
      },
    });

    hook.handleChatMessage({ sessionID: 's3', agent: 'orchestrator' });
    await hook.handleEvent({
      event: {
        type: 'message.updated',
        properties: {
          info: {
            role: 'assistant',
            sessionID: 's3',
            providerID: 'openai',
            modelID: 'gpt-5.5',
            tokens: {
              input: 110_000,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
        },
      },
    });

    expect(hook.getState('s3')?.level).toBe(2);
    expect(hook.shouldForceCheckpoint('s3')).toBe(true);
    expect(hook.getRecommendedStrategy('s3')).toBe('l2-checkpoint-light');

    const output = { system: [] as string[] };
    await hook.handleSystemTransform({ sessionID: 's3' }, output);
    expect(output.system[0]).toContain('handle context pressure first');
    expect(output.system[0]).toContain(
      'whatever context-management path is actually available',
    );
    expect(output.system[0]).toContain('Slow down compression enough');
    expect(output.system[0]).toContain('information-dense summary/checkpoint');
  });

  test('injects tool-agnostic L2 context pressure guidance', async () => {
    const ctx = createCtx();
    const hook = createContextPressureHook(ctx as never);

    hook.handleChatMessage({ sessionID: 's4', agent: 'orchestrator' });
    await hook.handleEvent({
      event: {
        type: 'message.updated',
        properties: {
          info: {
            role: 'assistant',
            sessionID: 's4',
            providerID: 'openai',
            modelID: 'gpt-5.5',
            tokens: {
              input: 150_000,
              output: 10_000,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
        },
      },
    });

    const output = { system: [] as string[] };
    await hook.handleSystemTransform({ sessionID: 's4' }, output);
    expect(output.system[0]).toContain('[Context pressure: L2');
    expect(output.system[0]).toContain('handle context pressure first');
    expect(output.system[0]).toContain(
      'whatever context-management path is actually available',
    );
    expect(output.system[0]).toContain('Slow down compression enough to preserve key decisions');
    expect(output.system[0]).toContain('summary/checkpoint for the next turn or a fresh session');
  });

  test('clears pressure state on session.deleted', async () => {
    const ctx = createCtx();
    const hook = createContextPressureHook(ctx as never);

    hook.handleChatMessage({ sessionID: 's2', agent: 'orchestrator' });
    await hook.handleEvent({
      event: {
        type: 'message.updated',
        properties: {
          info: {
            role: 'assistant',
            sessionID: 's2',
            providerID: 'openai',
            modelID: 'gpt-5.5',
            tokens: {
              input: 150_000,
              output: 10_000,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
        },
      },
    });
    expect(hook.getState('s2')?.level).toBe(2);

    await hook.handleEvent({
      event: {
        type: 'session.deleted',
        properties: { sessionID: 's2' },
      },
    });

    expect(hook.getState('s2')).toBeUndefined();
  });
});

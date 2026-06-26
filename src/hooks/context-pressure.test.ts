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

  test('adaptive thresholds for bio-orchestrator sessions', async () => {
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
              // 200K context → L1=min(350K,100K)=100K, L2=min(450K,130K)=130K
              // 100K tokens → below L2, level 1
              input: 96_000,
              output: 4_000,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
        },
      },
    });

    const state = hook.getState('bio1');
    expect(Math.round((state?.ratio ?? 0) * 100)).toBe(50);
    expect(state?.level).toBe(1);
  });

  test('adaptive thresholds for chem-orchestrator sessions', async () => {
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
              // 200K context → L1=100K, L2=130K, L3=160K
              // 95K tokens → below L1=100K (just under), level 0
              input: 91_000,
              output: 4_000,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
        },
      },
    });

    const state = hook.getState('chem1');
    expect(Math.round((state?.ratio ?? 0) * 100)).toBe(48);
    expect(state?.level).toBe(0);
  });

  test('adaptive thresholds: L2 at 140K in 200K context', async () => {
    const ctx = createCtx();
    const hook = createContextPressureHook(ctx as never);

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
              // 200K context → L2=130K, L3=160K
              // 140K tokens → between L2 and L3, level 2
              input: 140_000,
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
    expect(output.system[0]).toContain('[Context pressure: L2');
    expect(output.system[0]).toContain('handle context pressure first');
    expect(output.system[0]).toContain(
      'whatever context-management path is actually available',
    );
    expect(output.system[0]).toContain('Slow down compression enough');
    expect(output.system[0]).toContain('information-dense summary/checkpoint');
  });

  test('L3 at 160K in 200K context (80% threshold)', async () => {
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
              // 200K context → L3=min(550K,200K*0.80=160K)=160K
              // 160K tokens → at L3 threshold, level 3
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
    expect(output.system[0]).toContain('[Context pressure: L3');
    expect(output.system[0]).toContain('立即使用 /compact 命令');
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
              // 200K context → L2=130K, L3=160K
              // 140K tokens → level 2
              input: 140_000,
              output: 0,
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

/**
 * Chat.message hook 贯通测试
 *
 * 验证: injectPhaseSwitch → chat.message hook → 合成消息 prepend
 * 这个测试独立于 index.ts 中的实际挂载点，直接测试逻辑链
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import {
  buildPhaseSwitchText,
  injectPhaseSwitch,
  tryConsumePhaseSwitch,
} from './index';

describe('chat.message integration (synthetic message prepend)', () => {
  beforeEach(() => {
    // Clear any stale state
    tryConsumePhaseSwitch('test-session');
    tryConsumePhaseSwitch('test-session-2');
  });

  test('inject + consume produces correct synthetic message text', () => {
    injectPhaseSwitch('test-session', {
      phase: 'redesign',
      agent: 'prometheus',
      think: 'max',
      extras: { returnAgent: 'engineer' },
    });

    const msg = tryConsumePhaseSwitch('test-session');
    expect(msg).toBeDefined();

    const text = buildPhaseSwitchText(msg!);
    expect(text).toContain('phase:redesign');
    expect(text).toContain('agent:prometheus');
    expect(text).toContain('think:max');
    expect(text).toContain('return:engineer');
  });

  test('synthetic message is prepended to user text (simulating chat.message)', () => {
    injectPhaseSwitch('test-session', {
      phase: 'interview',
      agent: 'prometheus',
      think: 'max',
    });

    const msg = tryConsumePhaseSwitch('test-session');
    const switchText = buildPhaseSwitchText(msg!);

    // Simulate what chat.message hook does:
    // prepend switchText to the user's first text part
    const userText = 'I want to analyze the RNA-seq data';
    const modifiedText = `${switchText}\n\n${userText}`;

    expect(modifiedText).toContain(
      '[phase:interview|agent:prometheus|think:max]',
    );
    expect(modifiedText).toContain('I want to analyze the RNA-seq data');
    // The synthetic message comes first
    expect(
      modifiedText.startsWith('[phase:interview|agent:prometheus|think:max]'),
    ).toBe(true);
  });

  test('no pending switch means no modification', () => {
    const msg = tryConsumePhaseSwitch('test-session-2');
    expect(msg).toBeUndefined();

    const userText = 'Normal user message';
    expect(userText).toBe('Normal user message');
  });

  test('multiple injections before consume only keeps latest', () => {
    injectPhaseSwitch('test-session-2', {
      phase: 'interview',
      agent: 'prometheus',
    });
    injectPhaseSwitch('test-session-2', {
      phase: 'execute',
      agent: 'engineer',
    });

    const msg = tryConsumePhaseSwitch('test-session-2');
    expect(msg!.phase).toBe('execute');
    expect(msg!.agent).toBe('engineer');
  });

  test('consume is idempotent — second read returns undefined', () => {
    injectPhaseSwitch('test-session', {
      phase: 'review',
      agent: 'reviewer',
      think: 'high',
    });

    const first = tryConsumePhaseSwitch('test-session');
    expect(first).toBeDefined();

    const second = tryConsumePhaseSwitch('test-session');
    expect(second).toBeUndefined();
  });
});

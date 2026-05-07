import { describe, expect, test } from 'bun:test';
import {
  classifyAutoPreference,
  validatePreferenceContent,
} from './preference-rules';

describe('preference rules', () => {
  test('rejects emotional or personality judgments', () => {
    expect(
      validatePreferenceContent('User gets angry easily when tests fail'),
    ).toEqual({ ok: false, reason: 'emotional-or-personality' });
  });

  test('accepts neutral workflow/tooling preference content', () => {
    expect(
      validatePreferenceContent('Prefer test -> build -> deploy order'),
    ).toEqual({ ok: true });
  });

  test('classifies supported auto preference hints only', () => {
    expect(
      classifyAutoPreference('Prefer test -> build -> deploy order'),
    ).toEqual({ kind: 'workflow', scope: 'repository' });
    expect(classifyAutoPreference('Prefer uv for Python tooling setup')).toEqual({
      kind: 'tooling',
      scope: 'repository',
    });
    expect(
      classifyAutoPreference('Need a better explanation of the mechanism'),
    ).toBeNull();
  });
});

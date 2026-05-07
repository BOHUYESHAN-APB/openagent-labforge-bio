import type { PreferenceMemoryEntry } from './types';

export const EMOTIONAL_PATTERN =
  /\b(angry|anger|furious|upset|annoyed|frustrated|frustrating|mad|rage|rude|emotional|emotion|愤怒|生气|恼火|暴躁|情绪化|容易生气|容易愤怒)\b/i;

const ALLOWED_AUTO_PATTERNS: Array<{
  kind: PreferenceMemoryEntry['kind'];
  scope: PreferenceMemoryEntry['scope'];
  pattern: RegExp;
}> = [
  {
    kind: 'workflow',
    scope: 'repository',
    pattern:
      /\bprefer(?:s|red)?(?:\s+(?:to\s+)?(?:run|do|follow|keep))?\s+tests?\s*(?:->|before)\s*build\s*(?:->|before)\s*deploy\b/i,
  },
  {
    kind: 'workflow',
    scope: 'repository',
    pattern:
      /\bprefer(?:s|red)?(?:\s+(?:to\s+)?(?:run|do|keep))?\s+typecheck\s*(?:->|before)\s*build\b/i,
  },
  {
    kind: 'tooling',
    scope: 'repository',
    pattern: /\bprefer(?:s|red)?\s+uv\b/i,
  },
  {
    kind: 'tooling',
    scope: 'repository',
    pattern: /\bprefer(?:s|red)?\s+bun\b/i,
  },
  {
    kind: 'tooling',
    scope: 'repository',
    pattern: /\bprefer(?:s|red)?\s+node(?:\.js)?\b/i,
  },
  {
    kind: 'preference',
    scope: 'workspace',
    pattern:
      /\bprefer(?:s|red)?\s+(?:focused|targeted)\s+(?:tests|validation|checks)\s+before\s+(?:full|broad)\s+suite\b/i,
  },
];

export function validatePreferenceContent(content: string): {
  ok: boolean;
  reason?: string;
} {
  const normalized = content.trim();
  if (!normalized) {
    return { ok: false, reason: 'empty' };
  }
  if (EMOTIONAL_PATTERN.test(normalized)) {
    return { ok: false, reason: 'emotional-or-personality' };
  }
  return { ok: true };
}

export function classifyAutoPreference(content: string): {
  kind: PreferenceMemoryEntry['kind'];
  scope: PreferenceMemoryEntry['scope'];
} | null {
  const normalized = content.trim();
  const validation = validatePreferenceContent(normalized);
  if (!validation.ok) {
    return null;
  }

  for (const rule of ALLOWED_AUTO_PATTERNS) {
    if (rule.pattern.test(normalized)) {
      return { kind: rule.kind, scope: rule.scope };
    }
  }

  return null;
}

export type TerminalCommandPolicy =
  | 'short-sync'
  | 'pty-recommended'
  | 'pty-required';

const SHORT_SYNC_PATTERNS = [
  /^git\s+(status|diff|log|show|branch|remote|tag)\b/i,
  /^(bun|node|npm|pnpm|yarn|python|python3|gh|cargo|go)\s+--?version\b/i,
  /^(pwd|whoami|uname|env|printenv)\b/i,
  /^(gh\s+(release|pr|api|issue)\b|curl\b)/i,
  /^bun\s+test\b.*(\.test\.|\.spec\.|\s-t\s|\s--test-name-pattern\s)/i,
  /^python(?:3)?\s+-c\b/i,
];

const PTY_REQUIRED_PATTERNS = [
  /^bun\s+run\s+build(?::\S+)?\b/i,
  /^(npm|pnpm|yarn)\s+(run\s+)?build\b/i,
  /^(vite|next|nuxt|webpack|rollup|tsc|make|cmake\s+--build|cargo\s+build|go\s+build)\b/i,
  /^(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve|watch)\b/i,
  /^(vite|next|nuxt)\s+(dev|start|preview)\b/i,
  /\s(--watch|-w)\b/i,
  /^(tail\s+-f|docker\s+compose\s+up\b|kubectl\s+logs\s+-f\b)/i,
  /^(python|python3|node|irb|R)\s*$/i,
];

const PTY_RECOMMENDED_PATTERNS = [
  /^bun\s+test\b/i,
  /^(npm|pnpm|yarn)\s+(run\s+)?test\b/i,
  /^(pytest|python\s+-m\s+pytest|cargo\s+test|go\s+test|playwright\s+test)\b/i,
  /^(python|python3)\s+[^-][^\n]*\.py\b/i,
  /^(bash|sh|zsh|pwsh)\s+[^\n]+\.(sh|ps1)\b/i,
  /^(Rscript)\b/i,
  /^(uv\s+run|poetry\s+run)\b/i,
  /^(docker\s+build|docker\s+compose\s+build|terraform\s+(plan|apply)|ansible-playbook)\b/i,
];

export function classifyTerminalCommand(
  command: string,
): TerminalCommandPolicy {
  const normalized = command.trim();

  if (SHORT_SYNC_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'short-sync';
  }

  if (PTY_REQUIRED_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'pty-required';
  }

  if (PTY_RECOMMENDED_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'pty-recommended';
  }

  return 'short-sync';
}

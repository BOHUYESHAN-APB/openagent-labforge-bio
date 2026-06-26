import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  getProjectBoulderFile,
  getProjectPlansDir,
} from '../paths/plugin-paths';
import { normalizePlanName } from '../plans/paths';

export interface BoulderState {
  active_plan: string;
  plan_name: string;
  started_at: string;
  session_ids: string[];
  agent: string;
  worktree_path?: string;
}

export interface PlanFile {
  name: string;
  path: string;
  modifiedAt: string;
  progress: PlanProgress;
  /** Brief one-line description extracted from plan file content */
  description?: string;
}

export interface PlanProgress {
  total: number;
  completed: number;
  remaining: number;
  percent: number;
  isComplete: boolean;
  /** Label of the first unchecked task (e.g. "1. Implement baseline") */
  nextTaskLabel?: string;
}

const CHECKBOX_PATTERN = /^- \[( |x|X)\] (.+)$/;
const STRUCTURED_TASK_PATTERN = /^(?:\d+\.|F\d+\.)\s+/;

/** Heading patterns that demarcate counted sections (OMO-compatible) */
const COUNTED_SECTIONS = /^##\s+(?:TODOs|Final\s+Verification\s+Wave)\s*$/;
const ANY_HEADING = /^##\s+/;

export function getLegacyPlansDir(workspaceRoot: string): string {
  return join(workspaceRoot, '.sisyphus', 'plans');
}

export function getLegacyBoulderFile(workspaceRoot: string): string {
  return join(workspaceRoot, '.sisyphus', 'boulder.json');
}

export function ensureProjectPlansDir(workspaceRoot: string): string {
  const plansDir = getProjectPlansDir(workspaceRoot);
  mkdirSync(plansDir, { recursive: true });
  return plansDir;
}

export function readBoulderState(workspaceRoot: string): BoulderState | null {
  for (const filePath of [
    getProjectBoulderFile(workspaceRoot),
    getLegacyBoulderFile(workspaceRoot),
  ]) {
    if (!existsSync(filePath)) continue;
    return JSON.parse(readFileSync(filePath, 'utf8')) as BoulderState;
  }

  return null;
}

export function writeBoulderState(
  workspaceRoot: string,
  state: BoulderState,
): void {
  const filePath = getProjectBoulderFile(workspaceRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function createBoulderState(input: {
  planPath: string;
  sessionID: string;
  agent?: string;
  worktreePath?: string;
}): BoulderState {
  return {
    active_plan: resolve(input.planPath),
    plan_name: planNameFromPath(input.planPath),
    started_at: new Date().toISOString(),
    session_ids: [input.sessionID],
    agent: input.agent ?? 'atlas',
    ...(input.worktreePath ? { worktree_path: input.worktreePath } : {}),
  };
}

export function appendSessionId(
  state: BoulderState,
  sessionID: string,
): BoulderState {
  if (state.session_ids.includes(sessionID)) return state;
  return { ...state, session_ids: [...state.session_ids, sessionID] };
}

export function listPlanFiles(workspaceRoot: string): PlanFile[] {
  const dirs = [
    getProjectPlansDir(workspaceRoot),
    getLegacyPlansDir(workspaceRoot),
  ];
  const seen = new Set<string>();
  const plans: PlanFile[] = [];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const filePath = resolve(dir, entry.name);
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      const stats = statSync(filePath);
      const content = readFileSync(filePath, 'utf8');
      plans.push({
        name: planNameFromPath(filePath),
        path: filePath,
        modifiedAt: stats.mtime.toISOString(),
        progress: getPlanProgress(content),
        description: extractPlanDescription(content),
      });
    }
  }

  return plans.sort((a, b) => {
    const mtimeDiff = b.modifiedAt.localeCompare(a.modifiedAt);
    if (mtimeDiff !== 0) return mtimeDiff;
    return normalizePlanName(a.name).localeCompare(normalizePlanName(b.name));
  });
}

export function findPlanFile(
  workspaceRoot: string,
  query?: string,
): PlanFile | null {
  const plans = listPlanFiles(workspaceRoot);
  if (plans.length === 0) return null;
  const normalizedQuery = normalizePlanName(query ?? '');
  if (!normalizedQuery)
    return plans.find((plan) => !plan.progress.isComplete) ?? plans[0];

  return (
    plans.find((plan) => normalizePlanName(plan.name) === normalizedQuery) ??
    plans.find((plan) =>
      normalizePlanName(plan.name).includes(normalizedQuery),
    ) ??
    null
  );
}

/**
 * Parse plan content into progress stats.
 *
 * **Dual-mode** (matching OMO's upstream approach):
 * 1. Structured — if plan has `## TODOs` or `## Final Verification Wave`
 *    sections, only count column-zero checkboxes inside those sections
 *    that match STRUCTURED_TASK_PATTERN (`1.` / `F1.` prefix).
 * 2. Simple — otherwise count ALL column-zero checkboxes (no prefix filter).
 *
 * Also extracts `nextTaskLabel` — the label of the first unchecked task.
 */
export function getPlanProgress(content: string): PlanProgress {
  const lines = content.split(/\r?\n/);
  const hasCountedSections = lines.some((line) => COUNTED_SECTIONS.test(line));

  let tasks: RegExpMatchArray[];

  if (hasCountedSections) {
    // Structured mode: only checkboxes inside ## TODOs / ## Final Verification Wave
    let inCountedSection = false;
    tasks = [];
    for (const line of lines) {
      if (ANY_HEADING.test(line)) {
        inCountedSection = COUNTED_SECTIONS.test(line);
        continue;
      }
      if (!inCountedSection) continue;
      const match = line.match(CHECKBOX_PATTERN);
      if (match && STRUCTURED_TASK_PATTERN.test(match[2]?.trim() ?? '')) {
        tasks.push(match);
      }
    }
  } else {
    // Simple mode: count all column-zero checkboxes, no prefix filter
    tasks = lines
      .map((line) => line.match(CHECKBOX_PATTERN))
      .filter((m): m is RegExpMatchArray => Boolean(m));
  }

  const completed = tasks.filter((m) => /^[xX]$/.test(m[1] ?? '')).length;
  const total = tasks.length;
  const remaining = Math.max(total - completed, 0);

  // First unchecked task label (for "next task" display)
  const nextUnchecked = tasks.find((m) => m[1] === ' ');

  return {
    total,
    completed,
    remaining,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    isComplete: total > 0 && remaining === 0,
    nextTaskLabel: nextUnchecked
      ? (nextUnchecked[2]?.trim() ?? undefined)
      : undefined,
  };
}

/**
 * Extract a brief one-line description from a plan file.
 * Looks for the first non-title heading, then a short paragraph.
 */
export function extractPlanDescription(content: string): string | undefined {
  const lines = content.split(/\r?\n/);
  let foundTitle = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip the first `# Title` line (it's the plan name, redundant)
    if (trimmed.startsWith('# ') && !foundTitle) {
      foundTitle = true;
      continue;
    }

    // Take the first `## Section` or `### Task` heading after the title
    if (/^#{2,3}\s+/.test(trimmed)) {
      return trimmed
        .replace(/^#+\s+/, '')
        .trim()
        .slice(0, 120);
    }

    // Or take the first non-empty paragraph sentence
    if (
      foundTitle &&
      trimmed.length > 10 &&
      !trimmed.startsWith('-') &&
      !trimmed.startsWith('>') &&
      !trimmed.startsWith('```')
    ) {
      const sentence = trimmed
        .replace(/^[#*\s]+/, '')
        .split(/[.。]/)[0]
        ?.trim();
      if (sentence && sentence.length > 10) {
        return sentence.slice(0, 120);
      }
    }
  }

  return undefined;
}

export function planNameFromPath(filePath: string): string {
  return basename(filePath).replace(/\.md$/i, '');
}

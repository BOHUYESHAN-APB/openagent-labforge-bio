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
}

export interface PlanProgress {
  total: number;
  completed: number;
  remaining: number;
  percent: number;
  isComplete: boolean;
}

const CHECKBOX_PATTERN = /^- \[( |x|X)\] (.+)$/;
const STRUCTURED_TASK_PATTERN = /^(?:\d+\.|F\d+\.)\s+/;

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

export function getPlanProgress(content: string): PlanProgress {
  const tasks = content
    .split(/\r?\n/)
    .map((line) => line.match(CHECKBOX_PATTERN))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .filter((match) => {
      const label = match[2]?.trim() ?? '';
      return STRUCTURED_TASK_PATTERN.test(label);
    });

  const completed = tasks.filter((match) =>
    /^[xX]$/.test(match[1] ?? ''),
  ).length;
  const total = tasks.length;
  const remaining = Math.max(total - completed, 0);
  return {
    total,
    completed,
    remaining,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    isComplete: total > 0 && remaining === 0,
  };
}

export function planNameFromPath(filePath: string): string {
  return basename(filePath).replace(/\.md$/i, '');
}

function normalizePlanName(name: string): string {
  return name
    .trim()
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

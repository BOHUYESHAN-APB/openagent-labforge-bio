/**
 * Memory System
 *
 * Dynamic memory injection via system.transform hook.
 * Optimized for token efficiency:
 * - First turn: always inject
 * - Subsequent turns: inject every N turns (default 5)
 * - Cache file reads to avoid redundant I/O
 *
 * Three memory tiers:
 * 1. User Preferences — coding style, workflow habits (per-project)
 * 2. Project Memory — architecture decisions, rules, durable knowledge (per-project)
 * 3. Global Memory — cross-project user preferences (per-user)
 *
 * Storage paths are environment-aware:
 * - OpenCode: .opencode/extendai-lab/
 * - MiMo Code: .mimocode/extendai-lab/
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { log as baseLog } from '../../utils/logger';

const HOOK_NAME = 'memory';
const log = (...args: unknown[]) => baseLog(`[${HOOK_NAME}]`, ...args);

// ── Configuration ────────────────────────────────────────────────

/** How many turns between memory re-injections */
export const REINJECTION_INTERVAL = 5;

/** Maximum age (ms) for cached file content before re-reading */
const CACHE_TTL_MS = 30_000; // 30 seconds

// ── Path Resolution ──────────────────────────────────────────────

export function getStorageDir(workspaceRoot: string, isMimoCode: boolean): string {
  const configDir = isMimoCode ? '.mimocode' : '.opencode';
  return join(workspaceRoot, configDir, 'extendai-lab');
}

export function getPreferencesPath(
  workspaceRoot: string,
  isMimoCode: boolean,
): string {
  return join(getStorageDir(workspaceRoot, isMimoCode), 'preferences.md');
}

export function getProjectMemoryPath(
  workspaceRoot: string,
  isMimoCode: boolean,
): string {
  return join(getStorageDir(workspaceRoot, isMimoCode), 'MEMORY.md');
}

export function getGlobalMemoryPath(dataDir: string): string {
  return join(dataDir, 'memory', 'global', 'MEMORY.md');
}

// ── Cached File Reading ──────────────────────────────────────────

interface CachedFile {
  content: string | null;
  mtime: number;
  lastRead: number;
}

const fileCache = new Map<string, CachedFile>();

/**
 * Clear the file cache (for testing).
 */
export function clearFileCache(): void {
  fileCache.clear();
}

function readFileCached(path: string): string | null {
  const now = Date.now();
  const cached = fileCache.get(path);

  // Check cache validity
  if (cached && now - cached.lastRead < CACHE_TTL_MS) {
    return cached.content;
  }

  // Read from disk
  try {
    if (existsSync(path)) {
      const stat = statSync(path);
      const content = readFileSync(path, 'utf-8');
      fileCache.set(path, { content, mtime: stat.mtimeMs, lastRead: now });
      return content;
    }
  } catch (err) {
    log('Error reading file', { path, error: String(err) });
  }

  fileCache.set(path, { content: null, mtime: 0, lastRead: now });
  return null;
}

function hasUserContent(content: string): boolean {
  return content
    .split('\n')
    .some(
      (line) =>
        (line.startsWith('-') || line.startsWith('*')) &&
        !line.startsWith('##'),
    );
}

function truncateToBudget(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + '\n\n[truncated]';
}

// ── Turn Counter ─────────────────────────────────────────────────

const turnCount = new Map<string, number>();
const lastInjectionTurn = new Map<string, number>();

/**
 * Check if memory should be injected for this turn.
 * Returns true on first turn or every REINJECTION_INTERVAL turns.
 */
export function shouldInjectMemory(sessionID: string): boolean {
  const turns = (turnCount.get(sessionID) ?? 0) + 1;
  turnCount.set(sessionID, turns);

  const last = lastInjectionTurn.get(sessionID) ?? 0;
  const gap = turns - last;

  if (gap >= REINJECTION_INTERVAL) {
    lastInjectionTurn.set(sessionID, turns);
    return true;
  }

  return false;
}

/**
 * Reset turn counter for a session (e.g., on session deleted).
 */
export function resetTurnCounter(sessionID: string): void {
  turnCount.delete(sessionID);
  lastInjectionTurn.delete(sessionID);
}

// ── Memory Injection ─────────────────────────────────────────────

export interface MemoryInjectionConfig {
  workspaceRoot: string;
  dataDir: string;
  isMimoCode: boolean;
  sessionID?: string;
  prefsBudget?: number;
  projectMemoryBudget?: number;
  globalMemoryBudget?: number;
}

export interface MemoryInjectionResult {
  sections: string[];
  totalChars: number;
  injected: boolean;
}

/**
 * Build memory sections for system prompt injection.
 * Only injects on first turn or every REINJECTION_INTERVAL turns.
 */
export function buildMemoryInjection(
  config: MemoryInjectionConfig,
): MemoryInjectionResult {
  const sections: string[] = [];
  let totalChars = 0;

  // Check if we should inject this turn
  if (config.sessionID && !shouldInjectMemory(config.sessionID)) {
    return { sections: [], totalChars: 0, injected: false };
  }

  const prefsBudget = config.prefsBudget ?? 4000;
  const projectBudget = config.projectMemoryBudget ?? 6000;
  const globalBudget = config.globalMemoryBudget ?? 4000;

  // 1. User Preferences
  const prefsPath = getPreferencesPath(
    config.workspaceRoot,
    config.isMimoCode,
  );
  const prefsContent = readFileCached(prefsPath);
  if (prefsContent && hasUserContent(prefsContent)) {
    const truncated = truncateToBudget(prefsContent, prefsBudget);
    sections.push(
      `## User Preferences\nLoaded from preferences.md:\n${truncated}`,
    );
    totalChars += truncated.length;
  }

  // 2. Project Memory
  const projectPath = getProjectMemoryPath(
    config.workspaceRoot,
    config.isMimoCode,
  );
  const projectContent = readFileCached(projectPath);
  if (projectContent && hasUserContent(projectContent)) {
    const truncated = truncateToBudget(projectContent, projectBudget);
    sections.push(
      `## Project Memory\nLoaded from MEMORY.md:\n${truncated}`,
    );
    totalChars += truncated.length;
  }

  // 3. Global Memory
  const globalPath = getGlobalMemoryPath(config.dataDir);
  const globalContent = readFileCached(globalPath);
  if (globalContent && hasUserContent(globalContent)) {
    const truncated = truncateToBudget(globalContent, globalBudget);
    sections.push(
      `## Global Memory\nCross-project user preferences:\n${truncated}`,
    );
    totalChars += truncated.length;
  }

  if (sections.length > 0) {
    log('Memory injected', {
      sections: sections.length,
      totalChars,
      sessionID: config.sessionID,
    });
  }

  return { sections, totalChars, injected: sections.length > 0 };
}

// ── Templates ────────────────────────────────────────────────────

export const PREFS_TEMPLATE = `# User Preferences
_Long-term memory for coding style, workflow habits, and tool preferences._

## Coding Style
_Preferences about code formatting, naming, patterns._

## Workflow Preferences
_How you like to work: review frequency, commit style, testing approach._

## Tool Preferences
_Preferred tools, MCP servers, model choices._

## Communication Style
_How you want the agent to communicate: terse/verbose, language, detail level._

## Lessons Learned
_Things that worked well or poorly in past sessions._
`;

export const PROJECT_MEMORY_TEMPLATE = `# Project Memory
_Durable project-level knowledge. Persists across all sessions._

## Project context
_What is this project? Goals, identity._

## Rules
_Hard constraints that every session must respect._

## Architecture decisions
_Major design choices with rationale._

## Discovered durable knowledge
_Cross-task facts that survive across sessions._
`;

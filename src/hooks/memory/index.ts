/**
 * Memory System
 *
 * Dynamic memory injection via system.transform hook.
 * No restart required — reads files on every LLM request.
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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { log as baseLog } from '../../utils/logger';

const HOOK_NAME = 'memory';
const log = (...args: unknown[]) => baseLog(`[${HOOK_NAME}]`, ...args);

// ── Path Resolution ──────────────────────────────────────────────

/**
 * Get the base directory for plugin storage.
 * Detects MiMo Code vs OpenCode and uses the correct path.
 */
export function getStorageDir(workspaceRoot: string, isMimoCode: boolean): string {
  const configDir = isMimoCode ? '.mimocode' : '.opencode';
  return join(workspaceRoot, configDir, 'extendai-lab');
}

/**
 * Get user preferences file path.
 */
export function getPreferencesPath(
  workspaceRoot: string,
  isMimoCode: boolean,
): string {
  return join(getStorageDir(workspaceRoot, isMimoCode), 'preferences.md');
}

/**
 * Get project memory file path.
 */
export function getProjectMemoryPath(
  workspaceRoot: string,
  isMimoCode: boolean,
): string {
  return join(getStorageDir(workspaceRoot, isMimoCode), 'MEMORY.md');
}

/**
 * Get global memory file path (user-level, not project-level).
 * Uses the same path regardless of OpenCode/MiMo since it's user-level.
 */
export function getGlobalMemoryPath(dataDir: string): string {
  return join(dataDir, 'memory', 'global', 'MEMORY.md');
}

// ── File Reading ─────────────────────────────────────────────────

function readFileSafe(path: string): string | null {
  try {
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8');
    }
  } catch (err) {
    log('Error reading file', { path, error: String(err) });
  }
  return null;
}

/**
 * Check if content has actual user-written entries (not just template headers).
 */
function hasUserContent(content: string): boolean {
  return content
    .split('\n')
    .some(
      (line) =>
        line.startsWith('-') || line.startsWith('*') || line.match(/^\w+:/),
    );
}

/**
 * Truncate content to a token budget (rough estimate: 4 chars per token).
 */
function truncateToBudget(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + '\n\n[truncated]';
}

// ── Memory Injection ─────────────────────────────────────────────

export interface MemoryInjectionConfig {
  workspaceRoot: string;
  dataDir: string;
  isMimoCode: boolean;
  /** Maximum characters for each memory section */
  prefsBudget?: number;
  projectMemoryBudget?: number;
  globalMemoryBudget?: number;
}

export interface MemoryInjectionResult {
  sections: string[];
  totalChars: number;
}

/**
 * Build all memory sections for system prompt injection.
 * Called on every LLM request via system.transform hook.
 */
export function buildMemoryInjection(
  config: MemoryInjectionConfig,
): MemoryInjectionResult {
  const sections: string[] = [];
  let totalChars = 0;

  const prefsBudget = config.prefsBudget ?? 4000;
  const projectBudget = config.projectMemoryBudget ?? 6000;
  const globalBudget = config.globalMemoryBudget ?? 4000;

  // 1. User Preferences
  const prefsPath = getPreferencesPath(
    config.workspaceRoot,
    config.isMimoCode,
  );
  const prefsContent = readFileSafe(prefsPath);
  if (prefsContent && hasUserContent(prefsContent)) {
    const truncated = truncateToBudget(prefsContent, prefsBudget);
    sections.push(
      `## User Preferences\nLoaded from preferences.md:\n${truncated}`,
    );
    totalChars += truncated.length;
    log('Injected user preferences', { chars: truncated.length });
  }

  // 2. Project Memory
  const projectPath = getProjectMemoryPath(
    config.workspaceRoot,
    config.isMimoCode,
  );
  const projectContent = readFileSafe(projectPath);
  if (projectContent && hasUserContent(projectContent)) {
    const truncated = truncateToBudget(projectContent, projectBudget);
    sections.push(
      `## Project Memory\nLoaded from MEMORY.md:\n${truncated}`,
    );
    totalChars += truncated.length;
    log('Injected project memory', { chars: truncated.length });
  }

  // 3. Global Memory
  const globalPath = getGlobalMemoryPath(config.dataDir);
  const globalContent = readFileSafe(globalPath);
  if (globalContent && hasUserContent(globalContent)) {
    const truncated = truncateToBudget(globalContent, globalBudget);
    sections.push(
      `## Global Memory\nCross-project user preferences:\n${truncated}`,
    );
    totalChars += truncated.length;
    log('Injected global memory', { chars: truncated.length });
  }

  return { sections, totalChars };
}

// ── Preferences Template ─────────────────────────────────────────

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

/**
 * Environment Detection
 *
 * Detects whether the plugin is running on MiMo Code (Xiaomi's OpenCode fork)
 * or original OpenCode. This allows the plugin to:
 * - Disable duplicate features (dream, distill, memory, goal)
 * - Enable features unique to each runtime
 * - Adjust behavior based on the host environment
 *
 * Detection methods (ranked by reliability):
 * 1. Build-time global: typeof MIMOCODE_VERSION !== "undefined"
 * 2. Config fields: dream, distill, voice, checkpoint (MiMo-exclusive)
 * 3. Filesystem: .mimocode/ directory
 * 4. Environment: MIMOCODE_CLIENT, MIMOCODE_* vars
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

declare const MIMOCODE_VERSION: string | undefined;
declare const MIMOCODE_CHANNEL: string | undefined;

export interface RuntimeEnvironment {
  /** Whether running on MiMo Code */
  isMimoCode: boolean;
  /** Detection method used */
  detectionMethod: 'build-global' | 'config' | 'filesystem' | 'env' | 'unknown';
  /** MiMo Code version (if detected) */
  mimoVersion?: string;
  /** Which features are duplicates (should be disabled) */
  duplicateFeatures: string[];
}

/**
 * Detect if running on MiMo Code using build-time globals.
 * Most reliable — these globals are injected only in MiMo Code builds.
 */
function detectViaBuildGlobal(): boolean {
  try {
    return typeof MIMOCODE_VERSION !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Detect via config fields that only exist in MiMo Code.
 */
function detectViaConfig(config: Record<string, unknown>): boolean {
  const mimoExclusiveFields = ['dream', 'distill', 'voice', 'model_groups'];
  return mimoExclusiveFields.some((field) => field in config);
}

/**
 * Detect via filesystem (.mimocode/ directory).
 */
function detectViaFilesystem(workspaceRoot: string): boolean {
  return existsSync(join(workspaceRoot, '.mimocode'));
}

/**
 * Detect via environment variables.
 */
function detectViaEnv(): boolean {
  return !!(
    process.env.MIMOCODE_CLIENT ||
    process.env.MIMOCODE_VERSION ||
    process.env.MIMOCODE_HOME
  );
}

/**
 * Features that MiMo Code already provides.
 * When running on MiMo Code, these should be disabled to avoid conflicts.
 */
const MIMO_DUPLICATE_FEATURES = [
  'dream',      // MiMo has auto-dream
  'distill',    // MiMo has auto-distill
  'memory',     // MiMo has FTS5 memory system
  'goal',       // MiMo has /goal with judge
  'checkpoint', // MiMo has enhanced checkpoint
  'voice',      // MiMo has voice input
  'workflow',   // MiMo has workflow runtime
];

/**
 * Detect the runtime environment.
 */
export function detectEnvironment(
  config: Record<string, unknown> = {},
  workspaceRoot: string = process.cwd(),
): RuntimeEnvironment {
  // Tier 1: Build-time globals (most reliable)
  if (detectViaBuildGlobal()) {
    return {
      isMimoCode: true,
      detectionMethod: 'build-global',
      mimoVersion: typeof MIMOCODE_VERSION !== 'undefined' ? MIMOCODE_VERSION : undefined,
      duplicateFeatures: MIMO_DUPLICATE_FEATURES,
    };
  }

  // Tier 2: Config fields
  if (detectViaConfig(config)) {
    return {
      isMimoCode: true,
      detectionMethod: 'config',
      duplicateFeatures: MIMO_DUPLICATE_FEATURES,
    };
  }

  // Tier 3: Filesystem
  if (detectViaFilesystem(workspaceRoot)) {
    return {
      isMimoCode: true,
      detectionMethod: 'filesystem',
      duplicateFeatures: MIMO_DUPLICATE_FEATURES,
    };
  }

  // Tier 4: Environment variables
  if (detectViaEnv()) {
    return {
      isMimoCode: true,
      detectionMethod: 'env',
      duplicateFeatures: MIMO_DUPLICATE_FEATURES,
    };
  }

  // Not MiMo Code — original OpenCode
  return {
    isMimoCode: false,
    detectionMethod: 'unknown',
    duplicateFeatures: [],
  };
}

/**
 * Check if a specific feature should be enabled.
 * Returns false if the feature is a duplicate on MiMo Code.
 */
export function isFeatureEnabled(
  env: RuntimeEnvironment,
  feature: string,
): boolean {
  if (!env.isMimoCode) return true; // Original OpenCode — all features enabled
  return !env.duplicateFeatures.includes(feature);
}

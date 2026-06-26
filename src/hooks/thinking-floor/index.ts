/**
 * Thinking Floor Hook
 *
 * Enforces a minimum reasoning effort level in chat.params to ensure
 * models always operate with sufficient thinking depth.
 *
 * Problem: When the plugin injects messages (auto-continue, auto-review,
 * compaction), the model's thinking intensity may be ignored or reset.
 * Different models support different thinking levels:
 * - GPT-5: none/minimal/low/medium/high/xhigh/max
 * - DeepSeek: high/max (aliases: low/medium→high, xhigh→max)
 * - Anthropic: thinking { type, budgetTokens }
 * - Others: low/medium/high variants
 *
 * Solution: Enforce a minimum reasoning effort in chat.params based on
 * model family capabilities. Default floor is "high".
 */

import { detectHeuristicModelFamily } from '../../shared/model-core/model-capability-heuristics';
import { resolveCompatibleModelSettings } from '../../shared/model-core/model-settings-compatibility';
import { log } from '../../utils/logger';

const HOOK_NAME = 'thinking-floor';

/** Reasoning effort ladder from lowest to highest */
const REASONING_LADDER = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

type ReasoningEffort = (typeof REASONING_LADDER)[number];

/** Minimum thinking floor levels */
export const THINKING_FLOOR_LEVELS = [
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export type ThinkingFloorLevel = (typeof THINKING_FLOOR_LEVELS)[number];

/** Default minimum thinking floor */
const DEFAULT_FLOOR: ThinkingFloorLevel = 'high';

/** Minimum budgetTokens for Anthropic thinking when floor is active */
const MIN_THINKING_BUDGET = 10000;

/**
 * Get the index of a reasoning effort in the ladder
 */
function getEffortIndex(effort: string): number {
  const normalized = effort.toLowerCase();
  const index = REASONING_LADDER.indexOf(normalized as ReasoningEffort);
  return index >= 0 ? index : -1;
}

/**
 * Check if a reasoning effort meets the minimum floor
 */
function meetsFloor(current: string, floor: string): boolean {
  const currentIndex = getEffortIndex(current);
  const floorIndex = getEffortIndex(floor);
  if (currentIndex < 0 || floorIndex < 0) return true;
  return currentIndex >= floorIndex;
}

/**
 * Get the best available reasoning effort for a model family
 * that meets the minimum floor
 */
function resolveFloorForModel(
  modelID: string,
  floor: string,
):
  | { reasoningEffort?: string; thinking?: Record<string, unknown> }
  | undefined {
  const family = detectHeuristicModelFamily(modelID);

  // If we can't detect the family, try to apply the floor directly
  if (!family) {
    return { reasoningEffort: floor };
  }

  // For Anthropic models, use thinking config instead of reasoningEffort
  if (family.supportsThinking && family.family.startsWith('claude')) {
    return {
      thinking: {
        type: 'enabled',
        budgetTokens: MIN_THINKING_BUDGET,
      },
    };
  }

  // For models that support reasoningEffort, find the best available level
  if (family.reasoningEfforts && family.reasoningEfforts.length > 0) {
    const floorIndex = getEffortIndex(floor);
    if (floorIndex < 0) return undefined;

    // Find the LOWEST available effort that's at or above the floor
    // (not the highest - we want minimum enforcement, not maximum)
    let bestEffort: string | undefined;
    for (let i = floorIndex; i < REASONING_LADDER.length; i++) {
      const candidate = REASONING_LADDER[i];
      if (family.reasoningEfforts.includes(candidate)) {
        bestEffort = candidate;
        break;
      }
    }

    // If no effort meets the floor, use the highest available
    if (!bestEffort) {
      bestEffort = family.reasoningEfforts[family.reasoningEfforts.length - 1];
    }

    return { reasoningEffort: bestEffort };
  }

  // For models that only support variants (not reasoningEffort),
  // we can't directly control thinking depth via reasoningEffort
  // But we can try setting it and let compatibility resolution handle it
  if (family.variants && family.variants.length > 0) {
    // Map floor to variant
    const variantMap: Record<string, string> = {
      none: 'low',
      minimal: 'low',
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'high',
      max: 'high',
    };
    const targetVariant = variantMap[floor] || 'high';
    if (family.variants.includes(targetVariant)) {
      // We can't set variant via chat.params options,
      // but we can try reasoningEffort which some models accept
      return { reasoningEffort: floor };
    }
  }

  return undefined;
}

export interface ThinkingFloorOptions {
  /** Whether the thinking floor is enabled (default: true) */
  enabled?: boolean;
  /** Minimum thinking floor level (default: "high") */
  floor?: ThinkingFloorLevel;
  /** Minimum budgetTokens for Anthropic thinking (default: 10000) */
  minBudgetTokens?: number;
}

/**
 * Create the thinking floor hook
 */
export function createThinkingFloorHook(options?: ThinkingFloorOptions): {
  'chat.params': (
    input: {
      model?: { providerID?: string; id?: string };
      sessionID?: string;
    },
    output: {
      temperature: number;
      topP: number;
      topK: number;
      maxOutputTokens: number | undefined;
      options: Record<string, unknown>;
    },
  ) => void;
} {
  const enabled = options?.enabled !== false;
  const floor = options?.floor ?? DEFAULT_FLOOR;
  const minBudgetTokens = options?.minBudgetTokens ?? MIN_THINKING_BUDGET;

  // Cache resolved floors per model to avoid repeated lookups
  const resolvedFloorCache = new Map<
    string,
    { reasoningEffort?: string; thinking?: Record<string, unknown> }
  >();

  function getResolvedFloor(
    modelID: string,
  ):
    | { reasoningEffort?: string; thinking?: Record<string, unknown> }
    | undefined {
    const cached = resolvedFloorCache.get(modelID);
    if (cached) return cached;

    const resolved = resolveFloorForModel(modelID, floor);
    if (resolved) {
      resolvedFloorCache.set(modelID, resolved);
    }
    return resolved;
  }

  return {
    'chat.params': (
      input: {
        model?: { providerID?: string; id?: string };
        sessionID?: string;
      },
      output: {
        temperature: number;
        topP: number;
        topK: number;
        maxOutputTokens: number | undefined;
        options: Record<string, unknown>;
      },
    ): void => {
      if (!enabled) return;

      const modelID = input.model?.id || input.model?.providerID;
      if (!modelID) return;

      const resolved = getResolvedFloor(modelID);
      if (!resolved) return;

      const options = output.options as Record<string, unknown>;

      // Handle reasoningEffort floor
      if (resolved.reasoningEffort) {
        const currentEffort =
          typeof options.reasoningEffort === 'string'
            ? options.reasoningEffort
            : undefined;

        if (!currentEffort || !meetsFloor(currentEffort, floor)) {
          const previousEffort = currentEffort || '(not set)';
          options.reasoningEffort = resolved.reasoningEffort;

          log(
            `[${HOOK_NAME}] Enforced thinking floor: ${previousEffort} → ${resolved.reasoningEffort}`,
            {
              sessionID: input.sessionID,
              modelID,
              floor,
              previousEffort,
              newEffort: resolved.reasoningEffort,
            },
          );
        }
      }

      // Handle Anthropic thinking config floor
      if (resolved.thinking) {
        const currentThinking = options.thinking as
          | Record<string, unknown>
          | undefined;

        const needsUpgrade =
          !currentThinking ||
          currentThinking.type !== 'enabled' ||
          (typeof currentThinking.budgetTokens === 'number' &&
            currentThinking.budgetTokens < minBudgetTokens);

        if (needsUpgrade) {
          const previousThinking = currentThinking
            ? JSON.stringify(currentThinking)
            : '(not set)';
          options.thinking = {
            type: 'enabled',
            budgetTokens: minBudgetTokens,
          };

          log(`[${HOOK_NAME}] Enforced Anthropic thinking floor`, {
            sessionID: input.sessionID,
            modelID,
            floor,
            previousThinking,
            newThinking: JSON.stringify(options.thinking),
          });
        }
      }
    },
  };
}

/**
 * Context pressure monitor - track context usage and trigger L0/L1/L2/L3 strategies
 *
 * Thresholds are adaptive to model context size:
 * - For models ≥ 700K context: absolute caps (350K/450K/550K)
 * - For models < 700K: proportional to context (50%/65%/80%)
 * - Hysteresis: proportional min(50K, 10% of context)
 *
 * This handles all model sizes: 100K, 128K, 200K, 256K, 400K, 500K, 1M.
 */

/** Maximum (cap) thresholds — never exceed these regardless of model size */
export const MAX_THRESHOLDS = {
  /** L1 trigger: suggest compaction/checkpoint planning */
  L1: 350_000,
  /** L2 trigger: warning, must compress */
  L2: 450_000,
  /** L3 trigger: force compaction immediately */
  L3: 550_000,
} as const;

/** Ratio thresholds used when model context is smaller than caps */
export const RATIO_THRESHOLDS = {
  L1: 0.50,
  L2: 0.65,
  L3: 0.80,
} as const;

/**
 * Compute effective thresholds for a given context limit.
 * For large models (≥700K), caps dominate.
 * For small models (≤400K), ratios dominate.
 * For mid-range, a blend applies.
 */
export function computeThresholds(
  contextLimit: number,
): {
  L1: number;
  L2: number;
  L3: number;
  L1_CLEAR: number;
  L2_CLEAR: number;
  L3_CLEAR: number;
} {
  if (contextLimit <= 0) {
    return {
      L1: MAX_THRESHOLDS.L1,
      L2: MAX_THRESHOLDS.L2,
      L3: MAX_THRESHOLDS.L3,
      L1_CLEAR: MAX_THRESHOLDS.L1 - 50_000,
      L2_CLEAR: MAX_THRESHOLDS.L2 - 50_000,
      L3_CLEAR: MAX_THRESHOLDS.L3 - 50_000,
    };
  }

  // Proportional hysteresis: min(50K, 10% of context)
  const hysteresis = Math.min(50_000, Math.round(contextLimit * 0.1));

  // Effective thresholds: cap at max, scale by ratio for smaller models
  const L1 = Math.min(MAX_THRESHOLDS.L1, Math.round(contextLimit * RATIO_THRESHOLDS.L1));
  const L2 = Math.min(MAX_THRESHOLDS.L2, Math.round(contextLimit * RATIO_THRESHOLDS.L2));
  const L3 = Math.min(MAX_THRESHOLDS.L3, Math.round(contextLimit * RATIO_THRESHOLDS.L3));

  return {
    L1,
    L2,
    L3,
    L1_CLEAR: Math.max(0, L1 - hysteresis),
    L2_CLEAR: Math.max(0, L2 - hysteresis),
    L3_CLEAR: Math.max(0, L3 - hysteresis),
  };
}

export interface ContextPressureState {
  /** Current context usage ratio (0.0 - 1.0) */
  ratio: number;

  /** Total input tokens */
  totalTokens: number;

  /** Context limit */
  contextLimit: number;

  /** Current pressure level (0-3) */
  level: number;

  /** Last update timestamp */
  lastUpdated: number;
}

export interface ContextPressureThresholds {
  /** L1 threshold (micro-pruning) - default 0.5 */
  l1: number;

  /** L2 threshold (checkpoint + capsule) - default 0.65 */
  l2: number;

  /** L3 threshold (strong compression + cross-session prep) - default 0.8 */
  l3: number;
}

export interface ContextPressureProfile {
  name: string;
  thresholds: ContextPressureThresholds;
  /** Keep recent N messages in L1 micro-prune */
  keepRecentMessages: number;
}

const DEFAULT_THRESHOLDS: ContextPressureThresholds = {
  l1: 0.5,
  l2: 0.65,
  l3: 0.9,
};

const ENGINEERING_PROFILE: ContextPressureProfile = {
  name: 'engineering',
  thresholds: DEFAULT_THRESHOLDS,
  keepRecentMessages: 10,
};

const BIO_PROFILE: ContextPressureProfile = {
  name: 'bio',
  thresholds: {
    l1: 0.55,
    l2: 0.7,
    l3: 0.85,
  },
  keepRecentMessages: 12,
};

function normalizeThresholds(
  thresholds?: Partial<ContextPressureThresholds>,
  fallback: ContextPressureThresholds = DEFAULT_THRESHOLDS,
): ContextPressureThresholds {
  const l1 = thresholds?.l1 ?? fallback.l1;
  const l2 = thresholds?.l2 ?? fallback.l2;
  const l3 = thresholds?.l3 ?? fallback.l3;
  if (!(l1 > 0 && l1 < l2 && l2 < l3 && l3 < 1)) {
    return fallback;
  }
  return { l1, l2, l3 };
}

export function buildPressureProfiles(config?: {
  engineering?: Partial<ContextPressureThresholds>;
  bio?: Partial<ContextPressureThresholds>;
}): {
  engineering: ContextPressureProfile;
  bio: ContextPressureProfile;
} {
  return {
    engineering: {
      ...ENGINEERING_PROFILE,
      thresholds: normalizeThresholds(
        config?.engineering,
        ENGINEERING_PROFILE.thresholds,
      ),
    },
    bio: {
      ...BIO_PROFILE,
      thresholds: normalizeThresholds(config?.bio, BIO_PROFILE.thresholds),
    },
  };
}

export class ContextPressureMonitor {
  private stateBySession = new Map<string, ContextPressureState>();
  private profileBySession = new Map<string, ContextPressureProfile>();

  /**
   * Update context pressure state for a session
   *
   * Thresholds adapt to model context size:
   * - Large models (≥700K): capped at 350K/450K/550K
   * - Small models (≤400K): proportional (50%/65%/80% of context)
   * - Mid-range: blend
   */
  updatePressure(
    sessionID: string,
    totalTokens: number,
    contextLimit: number,
  ): ContextPressureState {
    const ratio = contextLimit > 0 ? totalTokens / contextLimit : 0;
    const prevState = this.stateBySession.get(sessionID);
    const prevLevel = prevState?.level ?? 0;
    const level = this.calculateLevel(totalTokens, prevLevel, contextLimit);

    const state: ContextPressureState = {
      ratio,
      totalTokens,
      contextLimit,
      level,
      lastUpdated: Date.now(),
    };

    this.stateBySession.set(sessionID, state);
    return state;
  }

  /**
   * Get current pressure state for a session
   */
  getState(sessionID: string): ContextPressureState | undefined {
    return this.stateBySession.get(sessionID);
  }

  /**
   * Set profile for a session (engineering or bio)
   */
  setProfile(sessionID: string, profile: ContextPressureProfile): void {
    this.profileBySession.set(sessionID, profile);
  }

  /**
   * Get profile for a session (defaults to engineering)
   */
  getProfile(sessionID: string): ContextPressureProfile {
    return this.profileBySession.get(sessionID) ?? ENGINEERING_PROFILE;
  }

  /**
   * Clear session state
   */
  clearSession(sessionID: string): void {
    this.stateBySession.delete(sessionID);
    this.profileBySession.delete(sessionID);
  }

  /**
   * Calculate pressure level with adaptive thresholds + hysteresis.
   *
   * Thresholds adapt to model context size via computeThresholds().
   * - Large models (1M): capped at 350K/450K/550K
   * - Small models (100K): proportional 50K/65K/80K
   *
   * Hysteresis: going up immediate, going down needs 10% of context clearance.
   *
   * @param totalTokens - Current total tokens
   * @param prevLevel - Previous level (for hysteresis demotion)
   * @param contextLimit - Model context limit (for adaptive thresholds)
   */
  private calculateLevel(
    totalTokens: number,
    prevLevel: number,
    contextLimit: number,
  ): number {
    const effective = computeThresholds(contextLimit);

    let candidateLevel = 0;
    if (totalTokens >= effective.L3) candidateLevel = 3;
    else if (totalTokens >= effective.L2) candidateLevel = 2;
    else if (totalTokens >= effective.L1) candidateLevel = 1;

    // Hysteresis: going up is immediate, going down needs clearance
    if (candidateLevel >= prevLevel) return candidateLevel;

    switch (prevLevel) {
      case 3:
        return totalTokens < effective.L3_CLEAR ? candidateLevel : 3;
      case 2:
        return totalTokens < effective.L2_CLEAR ? candidateLevel : 2;
      case 1:
        return totalTokens < effective.L1_CLEAR ? candidateLevel : 1;
      default:
        return candidateLevel;
    }
  }

  /**
   * Check if handoff packet is recommended at current pressure
   */
  shouldIncludeHandoff(sessionID: string): boolean {
    const state = this.getState(sessionID);
    return state ? state.level >= 2 : false;
  }

  /**
   * Get recommended strategy for current pressure level
   */
  getRecommendedStrategy(sessionID: string): string {
    const state = this.getState(sessionID);
    if (!state) return 'none';

    switch (state.level) {
      case 0:
        return 'none';
      case 1:
        return 'l1-micro-prune';
      case 2:
        return 'l2-checkpoint-light';
      case 3:
        return 'l3-checkpoint-heavy';
      default:
        return 'none';
    }
  }
}

export const PROFILES = {
  engineering: ENGINEERING_PROFILE,
  bio: BIO_PROFILE,
};

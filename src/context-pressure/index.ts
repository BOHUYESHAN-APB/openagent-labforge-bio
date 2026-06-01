/**
 * Context pressure monitor - track context usage and trigger L0/L1/L2/L3 strategies
 *
 * Monitors context window usage via OpenCode native stats and triggers
 * appropriate compression/checkpoint strategies based on pressure levels.
 */

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
   */
  updatePressure(
    sessionID: string,
    totalTokens: number,
    contextLimit: number,
  ): ContextPressureState {
    const ratio = contextLimit > 0 ? totalTokens / contextLimit : 0;
    const profile = this.getProfile(sessionID);
    const level = this.calculateLevel(ratio, profile.thresholds);

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
   * Calculate pressure level based on ratio and thresholds
   */
  private calculateLevel(
    ratio: number,
    thresholds: ContextPressureThresholds,
  ): number {
    if (ratio >= thresholds.l3) return 3;
    if (ratio >= thresholds.l2) return 2;
    if (ratio >= thresholds.l1) return 1;
    return 0;
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

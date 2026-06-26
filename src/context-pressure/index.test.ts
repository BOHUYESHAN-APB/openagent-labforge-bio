import { describe, expect, test } from 'bun:test';
import { buildPressureProfiles, ContextPressureMonitor } from './index';

describe('buildPressureProfiles', () => {
  test('uses defaults when no config provided', () => {
    const profiles = buildPressureProfiles();

    expect(profiles.engineering.thresholds).toEqual({
      l1: 0.5,
      l2: 0.65,
      l3: 0.9,
    });
    expect(profiles.bio.thresholds).toEqual({
      l1: 0.55,
      l2: 0.7,
      l3: 0.85,
    });
  });

  test('accepts valid configured overrides', () => {
    const profiles = buildPressureProfiles({
      engineering: { l1: 0.45, l2: 0.6, l3: 0.78 },
      bio: { l1: 0.52, l2: 0.68, l3: 0.83 },
    });

    expect(profiles.engineering.thresholds).toEqual({
      l1: 0.45,
      l2: 0.6,
      l3: 0.78,
    });
    expect(profiles.bio.thresholds).toEqual({
      l1: 0.52,
      l2: 0.68,
      l3: 0.83,
    });
  });

  test('falls back to defaults when thresholds are invalid', () => {
    const profiles = buildPressureProfiles({
      engineering: { l1: 0.7, l2: 0.6, l3: 0.8 },
      bio: { l1: 0.6, l2: 0.9, l3: 1.1 },
    });

    expect(profiles.engineering.thresholds).toEqual({
      l1: 0.5,
      l2: 0.65,
      l3: 0.9,
    });
    expect(profiles.bio.thresholds).toEqual({
      l1: 0.55,
      l2: 0.7,
      l3: 0.85,
    });
  });
});

describe('ContextPressureMonitor', () => {
  describe('updatePressure — absolute thresholds', () => {
    test('level 0 when tokens are below L1 threshold (350K)', () => {
      const monitor = new ContextPressureMonitor();
      const state = monitor.updatePressure('session-1', 100_000, 1_000_000);
      expect(state.level).toBe(0);
    });

    test('level 1 when tokens reach L1 threshold (350K)', () => {
      const monitor = new ContextPressureMonitor();
      const state = monitor.updatePressure('session-1', 350_000, 1_000_000);
      expect(state.level).toBe(1);
    });

    test('level 1 between L1 (350K) and L2 (450K)', () => {
      const monitor = new ContextPressureMonitor();
      const state = monitor.updatePressure('session-1', 400_000, 1_000_000);
      expect(state.level).toBe(1);
    });

    test('level 2 when tokens reach L2 threshold (450K)', () => {
      const monitor = new ContextPressureMonitor();
      const state = monitor.updatePressure('session-1', 450_000, 1_000_000);
      expect(state.level).toBe(2);
    });

    test('level 2 between L2 (450K) and L3 (550K)', () => {
      const monitor = new ContextPressureMonitor();
      const state = monitor.updatePressure('session-1', 500_000, 1_000_000);
      expect(state.level).toBe(2);
    });

    test('level 3 when tokens reach L3 threshold (550K)', () => {
      const monitor = new ContextPressureMonitor();
      const state = monitor.updatePressure('session-1', 550_000, 1_000_000);
      expect(state.level).toBe(3);
    });

    test('level 3 above L3 threshold', () => {
      const monitor = new ContextPressureMonitor();
      const state = monitor.updatePressure('session-1', 600_000, 1_000_000);
      expect(state.level).toBe(3);
    });
  });

  describe('hysteresis — going up is immediate', () => {
    test('immediate level 1 from 0 when crossing L1', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 300_000, 1_000_000);
      const state = monitor.updatePressure('session-1', 360_000, 1_000_000);
      expect(state.level).toBe(1);
    });

    test('immediate level 2 from 1 when crossing L2', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 400_000, 1_000_000);
      const state = monitor.updatePressure('session-1', 460_000, 1_000_000);
      expect(state.level).toBe(2);
    });

    test('immediate level 3 from 2 when crossing L3', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 500_000, 1_000_000);
      const state = monitor.updatePressure('session-1', 560_000, 1_000_000);
      expect(state.level).toBe(3);
    });

    test('going up multiple levels at once', () => {
      const monitor = new ContextPressureMonitor();
      const state = monitor.updatePressure('session-1', 600_000, 1_000_000);
      expect(state.level).toBe(3);
    });
  });

  describe('hysteresis — going down needs 50K clearance', () => {
    test('L3 → stays L3 when tokens drop within hysteresis band (≥500K)', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 600_000, 1_000_000);
      const state = monitor.updatePressure('session-1', 520_000, 1_000_000);
      expect(state.level).toBe(3);
    });

    test('L3 → drops from L3 when tokens drop below L3_CLEAR (500K)', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 600_000, 1_000_000);
      const state = monitor.updatePressure('session-1', 490_000, 1_000_000);
      expect(state.level).toBe(2);
    });

    test('L2 → stays L2 when tokens drop within hysteresis band (≥400K)', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 500_000, 1_000_000);
      const state = monitor.updatePressure('session-1', 420_000, 1_000_000);
      expect(state.level).toBe(2);
    });

    test('L2 → drops from L2 when tokens drop below L2_CLEAR (400K)', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 500_000, 1_000_000);
      const state = monitor.updatePressure('session-1', 390_000, 1_000_000);
      expect(state.level).toBe(1);
    });

    test('L1 → stays L1 when tokens drop within hysteresis band (≥300K)', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 380_000, 1_000_000);
      const state = monitor.updatePressure('session-1', 320_000, 1_000_000);
      expect(state.level).toBe(1);
    });

    test('L1 → drops from L1 when tokens drop below L1_CLEAR (300K)', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 380_000, 1_000_000);
      const state = monitor.updatePressure('session-1', 290_000, 1_000_000);
      expect(state.level).toBe(0);
    });
  });

  describe('hysteresis — full level transitions', () => {
    test('0→1→2→3→2→1→0 with hysteresis at each step', () => {
      const monitor = new ContextPressureMonitor();

      // L0: below L1
      expect(
        monitor.updatePressure('session-1', 300_000, 1_000_000).level,
      ).toBe(0);

      // L1: cross L1 threshold
      expect(
        monitor.updatePressure('session-1', 360_000, 1_000_000).level,
      ).toBe(1);

      // L2: cross L2 threshold
      expect(
        monitor.updatePressure('session-1', 460_000, 1_000_000).level,
      ).toBe(2);

      // L3: cross L3 threshold
      expect(
        monitor.updatePressure('session-1', 560_000, 1_000_000).level,
      ).toBe(3);

      // Still L3: within hysteresis (520K >= 500K L3_CLEAR)
      expect(
        monitor.updatePressure('session-1', 520_000, 1_000_000).level,
      ).toBe(3);

      // L2: below L3_CLEAR (500K)
      expect(
        monitor.updatePressure('session-1', 480_000, 1_000_000).level,
      ).toBe(2);

      // Still L2: within hysteresis (420K >= 400K L2_CLEAR)
      expect(
        monitor.updatePressure('session-1', 420_000, 1_000_000).level,
      ).toBe(2);

      // L1: below L2_CLEAR (400K)
      expect(
        monitor.updatePressure('session-1', 380_000, 1_000_000).level,
      ).toBe(1);

      // Still L1: within hysteresis (320K >= 300K L1_CLEAR)
      expect(
        monitor.updatePressure('session-1', 320_000, 1_000_000).level,
      ).toBe(1);

      // L0: below L1_CLEAR (300K)
      expect(
        monitor.updatePressure('session-1', 280_000, 1_000_000).level,
      ).toBe(0);
    });
  });

  describe('ratio fallback for small-context models', () => {
    test('uses ratio when absolute thresholds not reached but ratio is high', () => {
      const monitor = new ContextPressureMonitor();
      // 5K / 8K = 0.625 → rawLevel=0, ratioLevel=1 (0.625 >= 0.5 l1)
      const state = monitor.updatePressure('session-1', 5_000, 8_000);
      expect(state.level).toBe(1);
    });

    test('ratio can produce level 2 for small context windows', () => {
      const monitor = new ContextPressureMonitor();
      // 5.6K / 8K = 0.7 → ratioLevel=2 (0.7 >= 0.65 l2)
      const state = monitor.updatePressure('session-1', 5_600, 8_000);
      expect(state.level).toBe(2);
    });

    test('ratio can produce level 3 for small context windows', () => {
      const monitor = new ContextPressureMonitor();
      // 7.5K / 8K = 0.9375 → ratioLevel=3 (0.9375 >= 0.9 l3)
      const state = monitor.updatePressure('session-1', 7_500, 8_000);
      expect(state.level).toBe(3);
    });

    test('uses adaptive thresholds: 400K in 500K context hits L3 (80%)', () => {
      const monitor = new ContextPressureMonitor();
      // 400K tokens with 500K limit → L3 = min(550K, 500K*0.80=400K) = 400K → level 3
      const state = monitor.updatePressure('session-1', 400_000, 500_000);
      expect(state.level).toBe(3);
    });
  });

  describe('getRecommendedStrategy', () => {
    test('returns "none" when no state exists', () => {
      const monitor = new ContextPressureMonitor();
      expect(monitor.getRecommendedStrategy('unknown')).toBe('none');
    });

    test('returns "none" at level 0', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 300_000, 1_000_000);
      expect(monitor.getRecommendedStrategy('session-1')).toBe('none');
    });

    test('returns "l1-micro-prune" at level 1', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 360_000, 1_000_000);
      expect(monitor.getRecommendedStrategy('session-1')).toBe(
        'l1-micro-prune',
      );
    });

    test('returns "l2-checkpoint-light" at level 2', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 460_000, 1_000_000);
      expect(monitor.getRecommendedStrategy('session-1')).toBe(
        'l2-checkpoint-light',
      );
    });

    test('returns "l3-checkpoint-heavy" at level 3', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 560_000, 1_000_000);
      expect(monitor.getRecommendedStrategy('session-1')).toBe(
        'l3-checkpoint-heavy',
      );
    });
  });

  describe('shouldIncludeHandoff', () => {
    test('returns false when no state exists', () => {
      const monitor = new ContextPressureMonitor();
      expect(monitor.shouldIncludeHandoff('unknown')).toBe(false);
    });

    test('returns false at level 0', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 300_000, 1_000_000);
      expect(monitor.shouldIncludeHandoff('session-1')).toBe(false);
    });

    test('returns false at level 1', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 360_000, 1_000_000);
      expect(monitor.shouldIncludeHandoff('session-1')).toBe(false);
    });

    test('returns true at level 2 (force checkpoint)', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 460_000, 1_000_000);
      expect(monitor.shouldIncludeHandoff('session-1')).toBe(true);
    });

    test('returns true at level 3 (force checkpoint)', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 560_000, 1_000_000);
      expect(monitor.shouldIncludeHandoff('session-1')).toBe(true);
    });
  });

  describe('getState', () => {
    test('returns undefined for unknown session', () => {
      const monitor = new ContextPressureMonitor();
      expect(monitor.getState('unknown')).toBeUndefined();
    });

    test('returns correct state after update', () => {
      const monitor = new ContextPressureMonitor();
      const state = monitor.updatePressure('session-1', 400_000, 1_000_000);
      expect(state.totalTokens).toBe(400_000);
      expect(state.contextLimit).toBe(1_000_000);
      expect(state.ratio).toBeCloseTo(0.4);
      expect(state.level).toBe(1);
      expect(typeof state.lastUpdated).toBe('number');

      const retrieved = monitor.getState('session-1');
      expect(retrieved).toEqual(state);
    });
  });

  describe('clearSession', () => {
    test('removes session state and profile', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 400_000, 1_000_000);
      expect(monitor.getState('session-1')).toBeDefined();

      monitor.clearSession('session-1');
      expect(monitor.getState('session-1')).toBeUndefined();
    });

    test('session recovers cleanly after clear (fresh prevLevel)', () => {
      const monitor = new ContextPressureMonitor();
      monitor.updatePressure('session-1', 500_000, 1_000_000);
      monitor.clearSession('session-1');

      // After clear, no prevLevel → fresh start at level 0
      const state = monitor.updatePressure('session-1', 100_000, 1_000_000);
      expect(state.level).toBe(0);
    });
  });

  describe('setProfile / getProfile', () => {
    test('defaults to engineering profile', () => {
      const monitor = new ContextPressureMonitor();
      const profile = monitor.getProfile('session-1');
      expect(profile.name).toBe('engineering');
    });

    test('returns bio profile when set', () => {
      const monitor = new ContextPressureMonitor();
      const bioProfile = {
        name: 'bio',
        thresholds: { l1: 0.55, l2: 0.7, l3: 0.85 },
        keepRecentMessages: 12,
      };
      monitor.setProfile('session-1', bioProfile);
      expect(monitor.getProfile('session-1').name).toBe('bio');
    });

    test('thresholds adapt to model context size, profiles are advisory', () => {
      const monitor = new ContextPressureMonitor();

      // 8K context: L1=min(350K,8K*0.50=4K)=4K, L2=min(450K,8K*0.65=5.2K)=5.2K, L3=min(550K,8K*0.80=6.4K)=6.4K
      // 5.3K >= 5.2K (L2) → level 2
      // Profile setting doesn't affect adaptive thresholds
      const state = monitor.updatePressure('session-1', 5_300, 8_000);
      expect(state.level).toBe(2);
    });
  });

  describe('session isolation', () => {
    test('multiple sessions have independent pressure states', () => {
      const monitor = new ContextPressureMonitor();

      monitor.updatePressure('session-A', 600_000, 1_000_000);
      monitor.updatePressure('session-B', 100_000, 1_000_000);

      expect(monitor.getState('session-A')!.level).toBe(3);
      expect(monitor.getState('session-B')!.level).toBe(0);
    });

    test('hysteresis is maintained independently per session', () => {
      const monitor = new ContextPressureMonitor();

      // session-A at L3
      monitor.updatePressure('session-A', 600_000, 1_000_000);
      // session-B at L2
      monitor.updatePressure('session-B', 500_000, 1_000_000);

      // session-A drops within hysteresis → stays L3
      expect(
        monitor.updatePressure('session-A', 520_000, 1_000_000).level,
      ).toBe(3);

      // session-B drops below L2_CLEAR → drops to L1
      expect(
        monitor.updatePressure('session-B', 390_000, 1_000_000).level,
      ).toBe(1);
    });
  });

  describe('state properties', () => {
    test('ratio is computed as totalTokens / contextLimit', () => {
      const monitor = new ContextPressureMonitor();
      // 250K / 1M = 0.25, below ratio L1 (0.5) and absolute L1 (350K) → level 0
      const state = monitor.updatePressure('session-1', 250_000, 1_000_000);
      expect(state.ratio).toBeCloseTo(0.25);
      expect(state.totalTokens).toBe(250_000);
      expect(state.contextLimit).toBe(1_000_000);
      expect(state.level).toBe(0);
    });

    test('ratio is 0 when contextLimit is 0', () => {
      const monitor = new ContextPressureMonitor();
      const state = monitor.updatePressure('session-1', 100_000, 0);
      expect(state.ratio).toBe(0);
      expect(state.level).toBe(0);
    });
  });
});

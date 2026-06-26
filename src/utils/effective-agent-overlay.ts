export type EffectiveAgentOverlayPhase =
  | 'plan' // generic plan-mode (backward compat)
  | 'interview' // loop: planner interview phase
  | 'redesign' // loop: autonomous redesign phase
  | 'execute'
  | 'review';

export interface EffectiveAgentOverlay {
  phase: EffectiveAgentOverlayPhase;
  agent: string;
  source: string;
  returnAgent?: string;
  activatedAt: number;
}

export class EffectiveAgentOverlayManager {
  private readonly overlaysBySession = new Map<
    string,
    EffectiveAgentOverlay[]
  >();

  activate(
    sessionID: string,
    overlay: Omit<EffectiveAgentOverlay, 'activatedAt'>,
  ): EffectiveAgentOverlay {
    const existing = this.overlaysBySession.get(sessionID) ?? [];
    const next = existing.filter((entry) => entry.phase !== overlay.phase);
    const activated: EffectiveAgentOverlay = {
      ...overlay,
      activatedAt: Date.now(),
    };
    next.push(activated);
    this.overlaysBySession.set(sessionID, next);
    return activated;
  }

  getCurrent(sessionID: string): EffectiveAgentOverlay | undefined {
    const overlays = this.overlaysBySession.get(sessionID);
    return overlays?.[overlays.length - 1];
  }

  clear(sessionID: string, phase?: EffectiveAgentOverlayPhase): void {
    if (!phase) {
      this.overlaysBySession.delete(sessionID);
      return;
    }

    const overlays = this.overlaysBySession.get(sessionID);
    if (!overlays) return;
    const next = overlays.filter((entry) => entry.phase !== phase);
    if (next.length === 0) {
      this.overlaysBySession.delete(sessionID);
      return;
    }
    this.overlaysBySession.set(sessionID, next);
  }
}

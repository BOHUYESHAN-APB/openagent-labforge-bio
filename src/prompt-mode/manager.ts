import type { PromptModeConfig } from '../config/schema.js';

export type PromptMode = 'heavy' | 'light' | 'turbo';

export class PromptModeManager {
  private currentMode: PromptMode;
  private config: PromptModeConfig;
  private modeBySession: Map<string, PromptMode> = new Map();

  constructor(config: PromptModeConfig) {
    this.config = config;
    this.currentMode = config.defaultMode;
  }

  getCurrentMode(sessionID?: string): PromptMode {
    if (sessionID && this.modeBySession.has(sessionID)) {
      return this.modeBySession.get(sessionID)!;
    }
    return this.currentMode;
  }

  setMode(mode: PromptMode, sessionID?: string): boolean {
    if (!this.config.allowModeSwitch) {
      return false;
    }

    if (sessionID) {
      this.modeBySession.set(sessionID, mode);
    } else {
      this.currentMode = mode;
    }
    return true;
  }

  shouldApplyToAgent(agentName: string): boolean {
    return this.config.applyToAgents.includes(agentName);
  }

  clearSession(sessionID: string): void {
    this.modeBySession.delete(sessionID);
  }
}

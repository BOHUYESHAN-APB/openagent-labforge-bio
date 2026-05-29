// pane-state-querier.ts - Team Mode tmux subagent module
export function queryWindowState(sessionName: string): unknown { return null }
export function decideSpawnActions(sessionId: string): string[] { return [] }
export function decideCloseAction(sessionId: string): string { return "close" }
export interface SessionMapping {
  sessionId: string
  agentName: string
}
export function executeActions(actions: string[]): void {}
export function executeAction(action: string): void {}
export class TmuxPollingManager {
  start(): void {}
  stop(): void {}
}
export function createTrackedSession(sessionId: string): unknown { return { sessionId, status: "pending" } }
export function markTrackedSessionClosePending(sessionId: string): void {}
export function waitForSessionReady(sessionId: string, timeoutMs: number): Promise<boolean> { return Promise.resolve(true) }
export function isAttachableSessionStatus(status: string): boolean { return ["pending", "running", "idle"].includes(status) }
export function parseSessionStatusMap(data: unknown): Map<string, string> { return new Map() }

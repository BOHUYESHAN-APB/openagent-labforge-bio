export interface TmuxPollingManager {
  start(): void;
  stop(): void;
}
export interface TrackedSession {
  sessionId: string;
  paneId?: string;
  status: string;
}
export function createTrackedSession(sessionId: string): TrackedSession {
  return { sessionId, status: 'pending' };
}
export function isAttachableSessionStatus(status: string): boolean {
  return ['pending', 'running', 'idle'].includes(status);
}
export function waitForSessionReady(
  sessionId: string,
  timeoutMs: number,
): Promise<boolean> {
  return Promise.resolve(true);
}
export function markTrackedSessionClosePending(sessionId: string): void {}
export function decideCloseAction(sessionId: string): string {
  return 'close';
}
export function decideSpawnActions(sessionId: string): string[] {
  return [];
}
export function executeAction(action: string): void {}
export function executeActions(actions: string[]): void {}
export function parseSessionStatusMap(data: unknown): Map<string, string> {
  return new Map();
}
export function sweepStaleOmoAgentSessions(): void {}
export function findFirstMessageWithAgent(messages: unknown[]): unknown {
  return undefined;
}
export function findFirstMessageWithAgentFromSDK(messages: unknown[]): unknown {
  return undefined;
}
export function findNearestMessageWithFields(
  messages: unknown[],
  fields: Record<string, unknown>,
): unknown {
  return undefined;
}
export function findNearestMessageWithFieldsFromSDK(
  messages: unknown[],
  fields: Record<string, unknown>,
): unknown {
  return undefined;
}
export function getIsolatedSessionName(baseName: string): string {
  return baseName;
}
export interface OriginalMessageContext {
  sessionId: string;
  messageId?: string;
}
export function resolveMessageContext(
  sessionId: string,
): OriginalMessageContext | null {
  return null;
}
export interface SessionMapping {
  sessionId: string;
  agentName: string;
}
export interface StoredMessage {
  id: string;
  content: string;
  role: string;
}
export interface TextPart {
  type: 'text';
  text: string;
}
export interface MessageMeta {
  sessionId: string;
  timestamp: number;
}
export interface WindowState {
  paneId: string;
  windowId: string;
  sessionName: string;
  isActive: boolean;
}
export interface ToolPermission {
  tool: string;
  permission: 'allow' | 'deny';
}
export const POLL_INTERVAL_BACKGROUND_MS = 3000;

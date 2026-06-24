/**
 * Model capabilities types and core functions.
 *
 * These are the low-level types and functions that the higher-level
 * model-capabilities layer (src/shared/model-capabilities/) wraps
 * with runtime-specific behavior.
 */
import type { ProviderCache } from './provider-cache';

// ── Snapshot types ────────────────────────────────────────────────

export interface ModelCapabilitiesSnapshotEntry {
  id: string;
  family?: string;
  reasoning?: boolean;
  temperature?: boolean;
  toolCall?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  limit?: {
    context?: number;
    input?: number;
    output?: number;
  };
}

export interface ModelCapabilitiesSnapshot {
  generatedAt: string;
  sourceUrl: string;
  models: Record<string, ModelCapabilitiesSnapshotEntry>;
}

// ── Input / Output types ─────────────────────────────────────────

export interface GetModelCapabilitiesInput {
  providerID: string;
  modelID: string;
  runtimeModel?: Record<string, unknown>;
  bundledSnapshot?: ModelCapabilitiesSnapshot;
  providerCache?: ProviderCache;
}

export interface ModelCapabilities {
  providerID: string;
  modelID: string;
  maxTokens?: number;
  contextWindow?: number;
  isFree?: boolean;
  supportsVision?: boolean;
  supportsPromptCaching?: boolean;
  supportsSystemMessages?: boolean;
  supportsStreaming?: boolean;
  knowledgeCutoff?: string;
  modalities?: {
    input: string[];
    output: string[];
  };
  diagnostics?: ModelCapabilitiesDiagnostics;
}

export interface ModelCapabilitiesDiagnostics {
  resolutionSteps: string[];
  fallbackChainUsed: boolean;
  bundledSnapshotVersion?: string;
}

// ── Core functions ────────────────────────────────────────────────

/**
 * Parse raw JSON snapshot data into a validated ModelCapabilitiesSnapshot.
 */
export function getBundledModelCapabilitiesSnapshot(
  raw: unknown,
): ModelCapabilitiesSnapshot {
  if (typeof raw !== 'object' || raw === null) {
    return { generatedAt: '', sourceUrl: '', models: {} };
  }
  const data = raw as Record<string, unknown>;
  const models: Record<string, ModelCapabilitiesSnapshotEntry> = {};
  const rawModels = data.models;
  if (rawModels && typeof rawModels === 'object') {
    for (const [id, entry] of Object.entries(rawModels)) {
      if (typeof entry === 'object' && entry !== null) {
        const e = entry as Record<string, unknown>;
        models[id] = {
          id,
          family: typeof e.family === 'string' ? e.family : undefined,
          reasoning:
            typeof e.reasoning === 'boolean' ? e.reasoning : undefined,
          temperature:
            typeof e.temperature === 'boolean' ? e.temperature : undefined,
          toolCall: typeof e.toolCall === 'boolean' ? e.toolCall : undefined,
          modalities: isModalitiesObject(e.modalities)
            ? (e.modalities as { input?: string[]; output?: string[] })
            : undefined,
          limit: isLimitObject(e.limit)
            ? (e.limit as { context?: number; input?: number; output?: number })
            : undefined,
        };
      }
    }
  }
  return {
    generatedAt:
      typeof data.generatedAt === 'string' ? data.generatedAt : '',
    sourceUrl: typeof data.sourceUrl === 'string' ? data.sourceUrl : '',
    models,
  };
}

function isModalitiesObject(
  value: unknown,
): value is { input?: string[]; output?: string[] } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.input === undefined || Array.isArray(v.input)) &&
    (v.output === undefined || Array.isArray(v.output))
  );
}

function isLimitObject(
  value: unknown,
): value is { context?: number; input?: number; output?: number } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.context === undefined || typeof v.context === 'number') &&
    (v.input === undefined || typeof v.input === 'number') &&
    (v.output === undefined || typeof v.output === 'number')
  );
}

/**
 * Resolve model capabilities from a runtime model config.
 */
export function getModelCapabilities(
  input: GetModelCapabilitiesInput,
): ModelCapabilities {
  const runtimeModel = input.runtimeModel ?? {};
  const bundledSnapshot =
    input.bundledSnapshot ??
    getBundledModelCapabilitiesSnapshot({});
  const bundledEntry = bundledSnapshot.models[input.modelID];

  const modalities = readRuntimeModelModalities(runtimeModel);
  const snapshotModalities = bundledEntry?.modalities;

  return {
    providerID: input.providerID,
    modelID: input.modelID,
    maxTokens: readNumber(runtimeModel.maxTokens) ?? undefined,
    contextWindow: readNumber(runtimeModel.contextWindow) ?? undefined,
    isFree: readBoolean(runtimeModel.isFree) ?? undefined,
    supportsVision: readBoolean(runtimeModel.supportsVision) ?? undefined,
    supportsPromptCaching:
      readBoolean(runtimeModel.supportsPromptCaching) ?? undefined,
    supportsSystemMessages:
      readBoolean(runtimeModel.supportsSystemMessages) ?? undefined,
    supportsStreaming:
      readBoolean(runtimeModel.supportsStreaming) ?? undefined,
    knowledgeCutoff:
      typeof runtimeModel.knowledgeCutoff === 'string'
        ? runtimeModel.knowledgeCutoff
        : undefined,
    modalities:
      modalities ?? snapshotModalities
        ? {
            input: snapshotModalities?.input ?? modalities?.input ?? [],
            output: snapshotModalities?.output ?? modalities?.output ?? [],
          }
        : undefined,
    diagnostics: {
      resolutionSteps: ['runtime'],
      fallbackChainUsed: false,
    },
  };
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function readRuntimeModelModalities(
  runtimeModel: Record<string, unknown>,
): { input: string[]; output: string[] } | undefined {
  // Direct modalities field
  const modalities = runtimeModel.modalities;
  if (isInputOutputStrings(modalities)) {
    return {
      input: (modalities.input ?? []).map((s: string) => s.toLowerCase()),
      output: (modalities.output ?? []).map((s: string) => s.toLowerCase()),
    };
  }

  // Nested in capabilities
  const capabilities = runtimeModel.capabilities;
  if (typeof capabilities === 'object' && capabilities !== null) {
    const capModalities = (capabilities as Record<string, unknown>).modalities;
    if (isInputOutputStrings(capModalities)) {
      return {
        input: (capModalities.input ?? []).map((s: string) => s.toLowerCase()),
        output: (capModalities.output ?? []).map((s: string) => s.toLowerCase()),
      };
    }
  }

  return undefined;
}

function isInputOutputStrings(
  value: unknown,
): value is { input?: string[]; output?: string[] } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.input === undefined ||
      (Array.isArray(v.input) && v.input.every((s) => typeof s === 'string'))) &&
    (v.output === undefined ||
      (Array.isArray(v.output) && v.output.every((s) => typeof s === 'string')))
  );
}

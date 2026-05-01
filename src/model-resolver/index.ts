/**
 * Main-agent-first model resolution strategy
 * 
 * Core principle: Main agent's model is the default execution model.
 * Sub-agents inherit unless explicitly configured otherwise.
 */

import type { AgentName } from '../config/index.js';

export interface ModelResolverContext {
  primaryAgentName: string;
  primaryAgentModel: string | string[] | undefined;
  agentConfigs: Record<string, { model?: string | string[] }>;
  availableModels: Set<string>;
}

/**
 * Resolve the primary execution model (main agent's model)
 */
export function resolvePrimaryExecutionModel(
  ctx: ModelResolverContext,
): string | string[] | undefined {
  return ctx.primaryAgentModel;
}

/**
 * Resolve delegated execution model for a sub-agent
 * Falls back to primary agent's model if sub-agent has no explicit model
 */
export function resolveDelegatedExecutionModel(
  agentName: AgentName,
  ctx: ModelResolverContext,
): string | string[] | undefined {
  const agentConfig = ctx.agentConfigs[agentName];
  if (agentConfig?.model) {
    return agentConfig.model;
  }
  
  // Fallback to primary agent's model
  return ctx.primaryAgentModel;
}

/**
 * Check if a model is usable (exists in available models set)
 */
export function isModelUsable(
  modelId: string,
  availableModels: Set<string>,
): boolean {
  return availableModels.has(modelId);
}

/**
 * Resolve fallback to primary model when sub-agent model is unavailable
 */
export function resolveFallbackToPrimary(
  agentName: AgentName,
  ctx: ModelResolverContext,
): string | string[] | undefined {
  const delegatedModel = resolveDelegatedExecutionModel(agentName, ctx);
  
  // If delegated model is array, check first available
  if (Array.isArray(delegatedModel)) {
    for (const model of delegatedModel) {
      if (isModelUsable(model, ctx.availableModels)) {
        return model;
      }
    }
  } else if (delegatedModel && isModelUsable(delegatedModel, ctx.availableModels)) {
    return delegatedModel;
  }
  
  // Fallback to primary
  const primaryModel = ctx.primaryAgentModel;
  if (Array.isArray(primaryModel)) {
    for (const model of primaryModel) {
      if (isModelUsable(model, ctx.availableModels)) {
        return model;
      }
    }
  } else if (primaryModel && isModelUsable(primaryModel, ctx.availableModels)) {
    return primaryModel;
  }
  
  return undefined;
}

/**
 * Check if delegation is worthwhile (pre-delegation safety check)
 */
export function isDelegationWorthwhile(
  agentName: AgentName,
  ctx: ModelResolverContext,
): { worthwhile: boolean; reason?: string } {
  const resolvedModel = resolveFallbackToPrimary(agentName, ctx);
  
  if (!resolvedModel) {
    return {
      worthwhile: false,
      reason: `No usable model for agent ${agentName}`,
    };
  }
  
  // If sub-agent would use same model as primary, delegation may not be worthwhile
  // (unless sub-agent has specialized prompt/tools)
  const primaryModel = Array.isArray(ctx.primaryAgentModel)
    ? ctx.primaryAgentModel[0]
    : ctx.primaryAgentModel;
  
  if (resolvedModel === primaryModel) {
    return {
      worthwhile: true,
      reason: 'Same model but specialized agent',
    };
  }
  
  return { worthwhile: true };
}

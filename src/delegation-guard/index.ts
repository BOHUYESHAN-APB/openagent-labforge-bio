/**
 * Delegation guard - pre-delegation safety and benefit check
 * 
 * Prevents delegation failures by checking:
 * 1. Is delegation truly worthwhile?
 * 2. Does target agent have an available model?
 * 3. Does a reusable session already exist?
 * 4. Is handoff packet needed?
 */

import type { AgentName } from '../config/index.js';
import type { ModelResolverContext } from '../model-resolver/index.js';
import { isDelegationWorthwhile, resolveFallbackToPrimary } from '../model-resolver/index.js';

export interface DelegationGuardContext extends ModelResolverContext {
  sessionManager?: {
    hasReusableSession: (agentName: AgentName) => boolean;
  };
  contextPressure?: {
    level: number;
    requiresHandoff: boolean;
  };
}

export interface DelegationGuardResult {
  allowed: boolean;
  reason?: string;
  recommendations?: {
    reuseSession?: boolean;
    includeHandoffPacket?: boolean;
  };
}

/**
 * Check if delegation should proceed
 */
export function checkDelegation(
  agentName: AgentName,
  ctx: DelegationGuardContext,
): DelegationGuardResult {
  // Check 1: Is delegation worthwhile?
  const worthwhile = isDelegationWorthwhile(agentName, ctx);
  if (!worthwhile.worthwhile) {
    return {
      allowed: false,
      reason: worthwhile.reason,
    };
  }

  // Check 2: Does target agent have an available model?
  const resolvedModel = resolveFallbackToPrimary(agentName, ctx);
  if (!resolvedModel) {
    return {
      allowed: false,
      reason: `No available model for agent ${agentName}`,
    };
  }

  // Check 3: Does a reusable session exist?
  const hasReusableSession = ctx.sessionManager?.hasReusableSession(agentName) ?? false;

  // Check 4: Is handoff packet needed?
  const requiresHandoff = ctx.contextPressure?.requiresHandoff ?? false;

  return {
    allowed: true,
    recommendations: {
      reuseSession: hasReusableSession,
      includeHandoffPacket: requiresHandoff,
    },
  };
}

/**
 * Agent availability preflight - verify model is actually usable before delegation
 */
export function checkAgentAvailability(
  agentName: AgentName,
  ctx: ModelResolverContext,
): { available: boolean; model?: string; reason?: string } {
  const resolvedModel = resolveFallbackToPrimary(agentName, ctx);

  if (!resolvedModel) {
    return {
      available: false,
      reason: `No usable model configured for agent ${agentName}`,
    };
  }

  const modelString = Array.isArray(resolvedModel) ? resolvedModel[0] : resolvedModel;

  return {
    available: true,
    model: modelString,
  };
}

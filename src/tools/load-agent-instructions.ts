import type { ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';

// Import all subagent prompts
import { createAtlasAgent } from '../agents/atlas';
import { createCouncilAgent } from '../agents/council';
import { createCouncillorAgent } from '../agents/councillor';
import { createDeepWorkerAgent } from '../agents/deep-worker';
import { createDesignerAgent } from '../agents/designer';
import { createExplorerAgent } from '../agents/explorer';
import { createFixerAgent } from '../agents/fixer';
import { createLibrarianAgent } from '../agents/librarian';
import { createMetisAgent } from '../agents/metis';
import { createMomusAgent } from '../agents/momus';
import { createMultimodalLookerAgent } from '../agents/multimodal-looker';
import { createObserverAgent } from '../agents/observer';
import { createOracleAgent } from '../agents/oracle';
import { createPrometheusAgent } from '../agents/prometheus';
import { createReviewerAgent } from '../agents/reviewer';

const z = tool.schema;

const AGENT_FACTORIES = {
  explorer: createExplorerAgent,
  librarian: createLibrarianAgent,
  oracle: createOracleAgent,
  designer: createDesignerAgent,
  fixer: createFixerAgent,
  observer: createObserverAgent,
  council: createCouncilAgent,
  councillor: createCouncillorAgent,
  metis: createMetisAgent,
  momus: createMomusAgent,
  'multimodal-looker': createMultimodalLookerAgent,
  reviewer: createReviewerAgent,
} as const;

const PRIMARY_AGENT_FACTORIES = {
  'deep-worker': createDeepWorkerAgent,
  prometheus: createPrometheusAgent,
  atlas: createAtlasAgent,
} as const;

/**
 * Tool to load subagent instructions/prompts for the main agent to read.
 * This allows the main agent to understand subagent capabilities and workflows
 * without spawning a child session.
 */
export const loadAgentInstructionsTool: ToolDefinition = tool({
  description: `Load subagent instructions and prompts. Use this to understand what a subagent does, its capabilities, workflow, and constraints without spawning a child session. Returns the full system prompt that defines the subagent behavior.`,
  args: {
    agent: z
      .string()
      .describe(
        'The subagent name to load instructions for. Available: explorer, librarian, oracle, designer, fixer, observer, council, councillor, metis, momus, multimodal-looker, reviewer, deep-worker, prometheus, atlas',
      ),
  },
  async execute({ agent }) {
    const agentName = agent.toLowerCase().trim();

    // Check if it's a known subagent
    if (agentName in AGENT_FACTORIES) {
      const factory =
        AGENT_FACTORIES[agentName as keyof typeof AGENT_FACTORIES];
      const agentDef = factory('placeholder-model');
      return formatAgentInstructions(agentName, agentDef.config.prompt);
    }

    // Check if it's a primary agent
    if (agentName in PRIMARY_AGENT_FACTORIES) {
      const factory =
        PRIMARY_AGENT_FACTORIES[
          agentName as keyof typeof PRIMARY_AGENT_FACTORIES
        ];
      const agentDef = factory('placeholder-model');
      return formatAgentInstructions(agentName, agentDef.config.prompt);
    }

    // Unknown agent
    const availableAgents = [
      ...Object.keys(AGENT_FACTORIES),
      ...Object.keys(PRIMARY_AGENT_FACTORIES),
    ].join(', ');

    return `Unknown agent: ${agentName}

Available agents: ${availableAgents}

Use one of these agent names to load their instructions.`;
  },
});

function formatAgentInstructions(
  agentName: string,
  prompt: string | undefined,
): string {
  if (!prompt) {
    return `Agent '${agentName}' has no system prompt defined.`;
  }

  return `# ${agentName} Instructions

${prompt}

---

**Note**: These are the instructions that define how the ${agentName} subagent operates. You can use this information to understand its capabilities and workflow, and optionally execute similar logic yourself in the main agent context instead of spawning a child session.`;
}

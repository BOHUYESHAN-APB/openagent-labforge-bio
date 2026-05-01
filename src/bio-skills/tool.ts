import type { PluginInput, ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import type { BioSkillsSessionManager } from './session-manager';

const z = tool.schema;

export function createLoadBioSkillsTool(
  sessionManager: BioSkillsSessionManager,
): ToolDefinition {
  return tool({
    description:
      'Load bio skills from specific categories. Use this when you need specialized bioinformatics workflows or tools. Available categories are listed in the system prompt.',
    args: {
      categories: z
        .array(z.string())
        .min(1)
        .describe('Category names to load (e.g., ["rna-seq", "variant-calling"])'),
    },
    async execute(args, toolContext) {
      if (
        !toolContext ||
        typeof toolContext !== 'object' ||
        !('sessionID' in toolContext)
      ) {
        return 'Error: No session ID available';
      }

      const categories = args.categories as string[];
      const sessionID = (toolContext as { sessionID: string }).sessionID;

      // Validate categories exist
      const catalog = sessionManager.getCatalog();
      const validCategories = categories.filter((c) =>
        catalog.some((cat) => cat.name === c),
      );

      if (validCategories.length === 0) {
        const available = catalog.map((c) => c.name).join(', ');
        return `Error: No valid categories found. Available categories: ${available}`;
      }

      if (validCategories.length < categories.length) {
        const invalid = categories.filter((c) => !validCategories.includes(c));
        return `Error: Invalid categories: ${invalid.join(', ')}. Use categories from the catalog in system prompt.`;
      }

      // Load all valid categories
      let totalLoaded = 0;
      const success = sessionManager.loadCategory(sessionID, validCategories);
      if (success) {
        const loaded = sessionManager.getLoadedSkills(sessionID);
        totalLoaded = loaded.length;
      }

      const loadedCategories = sessionManager.getLoadedCategories(sessionID);

      if (totalLoaded === 0) {
        return `Warning: No skills loaded from categories: ${validCategories.join(', ')}`;
      }

      return [
        `Successfully loaded ${totalLoaded} bio skills from ${validCategories.length} categories.`,
        `Total loaded categories in this session: ${loadedCategories.length}`,
        `Categories: ${loadedCategories.join(', ')}`,
      ].join('\n');
    },
  });
}

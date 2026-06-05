import type { ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import type { TemplateSkillsSessionManager } from './session-manager';

const z = tool.schema;

export function createLoadSkillTemplateTool(
  sessionManager: TemplateSkillsSessionManager,
): ToolDefinition {
  return tool({
    description:
      'Load skill templates by category. Use when you need HTML page templates, presentation decks, academic tools, or document generation templates. Returns SKILL.md content for the requested categories. Available categories are listed in the system prompt.',
    args: {
      categories: z
        .array(z.string())
        .min(1)
        .describe(
          'Category names to load (e.g., ["html-deck", "html-templates", "academic-tools"])',
        ),
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
      const catalogByName = new Map(catalog.map((cat) => [cat.name, cat]));
      const validCategories = categories.filter((c) => catalogByName.has(c));

      if (validCategories.length === 0) {
        const available = catalog.map((c) => c.name).join(', ');
        return `Error: No valid categories found. Available categories: ${available}`;
      }

      if (validCategories.length < categories.length) {
        const invalid = categories.filter((c) => !validCategories.includes(c));
        return `Error: Invalid categories: ${invalid.join(', ')}. Use categories from the catalog in system prompt.`;
      }

      // Load all valid categories
      const success = sessionManager.loadCategory(sessionID, validCategories);

      if (!success) {
        return `Warning: No skills loaded from categories: ${validCategories.join(', ')}`;
      }

      const loaded = sessionManager.getLoadedSkills(sessionID);
      const loadedCategories = sessionManager.getLoadedCategories(sessionID);

      // Return summary with skill names
      const skillList = loaded
        .map((s) => `  - ${s.name}: ${s.description}`)
        .join('\n');

      return [
        `Successfully loaded ${loaded.length} skills from ${validCategories.length} categories.`,
        `Categories: ${loadedCategories.join(', ')}`,
        '',
        'Loaded skills:',
        skillList,
        '',
        'Use the read tool to load specific SKILL.md files for detailed instructions.',
      ].join('\n');
    },
  });
}

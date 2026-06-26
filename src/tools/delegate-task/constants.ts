/**
 * Category configuration for a single category.
 *
 * TODO: Replace with imported type from '../../config/schema' once
 * CategoryConfig is defined in the schema module (currently a stub).
 */
export interface CategoryConfig {
  model?: string;
  description?: string;
  disable?: boolean;
  variant?: string;
  [key: string]: unknown;
}

/**
 * Map of category name to category configuration.
 */
export type CategoriesConfig = Record<string, CategoryConfig>;

/**
 * Default built-in category definitions.
 *
 * These are the standard categories that ship with the plugin.
 * Users can override or extend them in their OpenCode config
 * under the `categories` key.
 *
 * @see mergeCategories in src/shared/merge-categories.ts
 */
export const DEFAULT_CATEGORIES: Record<string, CategoryConfig> = {
  quick: {
    model: 'openai/gpt-5.4-mini',
    description:
      'Fast, low-cost tasks (search, simple code-gen, summarization)',
  },
  ultrabrain: {
    model: 'openai/gpt-5.5',
    description:
      'Highest intelligence for complex reasoning, research, and coding',
  },
  'unspecified-high': {
    model: 'anthropic/claude-opus-4-7',
    description: 'High-intelligence fallback when no specific category is set',
  },
  'unspecified-low': {
    model: 'anthropic/claude-sonnet-4-6',
    description:
      'Low-to-mid intelligence fallback when no specific category is set',
  },
  'visual-engineering': {
    model: 'google/gemini-3.1-pro',
    description: 'Vision-capable model for visual/spatial engineering tasks',
  },
  writing: {
    model: 'google/gemini-3-flash',
    description: 'Writing, editing, and content generation tasks',
  },
  deep: {
    model: 'openai/gpt-5.5',
    description: 'Deep analysis, research, and complex multi-step reasoning',
  },
  artistry: {
    model: 'google/gemini-3.1-pro',
    description: 'Creative and artistic tasks requiring visual understanding',
  },
};

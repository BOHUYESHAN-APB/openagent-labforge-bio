import type { PluginInput, ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import { countSkillFilesInCategory } from './loader';
import type { BioSkillsSessionManager } from './session-manager';

const z = tool.schema;

export function createLoadBioSkillsTool(
  sessionManager: BioSkillsSessionManager,
): ToolDefinition {
  return tool({
    description:
      `Load bio skills from specific categories. Use this when you need specialized bioinformatics workflows or tools.

Key categories (88 total):
- rna-seq: RNA sequencing analysis
- variant-calling: Variant detection and annotation
- single-cell: Single-cell analysis
- alignment: Read alignment tools
- phylogenetics: Phylogenetic analysis
- genome-assembly: Genome assembly workflows
- proteomics: Mass spectrometry proteomics
- chip-seq: ChIP-seq analysis
- atac-seq: ATAC-seq analysis
- differential-expression: DE analysis
- pathway-analysis: Pathway enrichment
- metagenomics: Metagenomics analysis
- spatial-transcriptomics: Spatial analysis
- machine-learning: ML for biology
- structural-biology: Protein structure
- clinical-databases: Clinical data access
- database-access: 100+ scientific databases
- drug-discovery: Molecular docking, ADMET
- quantum-computing: Cirq, Qiskit, PennyLane
- data-processing: Dask, Polars, Vaex
- scientific-communication: Writing, review, posters
- research-methodology: Brainstorming, hypothesis

See bio_skills_catalog in system prompt for full list.

Examples:
- load_bio_skills(categories=["rna-seq"]) — load RNA-seq skills
- load_bio_skills(categories=["variant-calling", "alignment"]) — load multiple categories
- load_bio_skills(categories=["database-access"]) — load 100+ database skills`,
    args: {
      categories: z
        .array(z.string())
        .min(1)
        .describe(
          'Category names to load (e.g., ["rna-seq", "variant-calling"])',
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
      let totalLoaded = 0;
      const success = sessionManager.loadCategory(sessionID, validCategories);
      if (success) {
        const loaded = sessionManager.getLoadedSkills(sessionID);
        totalLoaded = loaded.length;
      }

      const loadedCategories = sessionManager.getLoadedCategories(sessionID);

      if (totalLoaded === 0) {
        const diagnostics = validCategories.map((categoryName) => {
          const category = catalogByName.get(categoryName);
          if (!category)
            return `${categoryName}: category missing from catalog`;
          return `${categoryName}: path=${category.path}, catalogCount=${category.skillCount}, diskCount=${countSkillFilesInCategory(category.path)}`;
        });
        return [
          `Warning: No skills loaded from categories: ${validCategories.join(', ')}`,
          'Diagnostics:',
          ...diagnostics,
        ].join('\n');
      }

      return [
        `Successfully loaded ${totalLoaded} bio skills from ${validCategories.length} categories.`,
        `Total loaded categories in this session: ${loadedCategories.length}`,
        `Categories: ${loadedCategories.join(', ')}`,
      ].join('\n');
    },
  });
}

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
- rna-quantification: RNA sequencing analysis (salmon, featureCounts, tximport)
- variant-calling: Variant detection and annotation (bcftools, GATK, DeepVariant)
- single-cell: Single-cell analysis (scanpy, seurat, celltypist)
- alignment: Read alignment tools (STAR, HISAT2, bowtie2, bwa-mem2)
- phylogenetics: Phylogenetic analysis (BEAST2, IQ-TREE, ASTRAL)
- genome-assembly: Genome assembly workflows (Flye, CheckM2, QUAST)
- proteomics: Mass spectrometry proteomics (DIA-NN, MSstats, limma)
- chip-seq: ChIP-seq analysis (HOMER, DiffBind, ChIPseeker)
- atac-seq: ATAC-seq analysis (deeptools, chromVAR, NucleoATAC)
- differential-expression: DE analysis (DESeq2, edgeR, limma)
- pathway-analysis: Pathway enrichment (clusterProfiler, ReactomePA, GSEA)
- metagenomics: Metagenomics analysis (Kraken, HUMAnN, MetaPhlAn)
- spatial-transcriptomics: Spatial analysis (squidpy, cell2location, scimap)
- machine-learning: ML for biology (scvi-tools, SHAP, lifelines)
- structural-biology: Protein structure (AlphaFold, ESMFold, Bio.PDB)
- clinical-databases: Clinical data access (ClinVar, gnomAD, dbSNP)
- database-access: 100+ scientific databases (BLAST, Entrez, STRINGdb)
- drug-discovery: Molecular docking, ADMET (DeepChem, DiffDock, RDKit)
- quantum-computing: Cirq, Qiskit, PennyLane
- data-processing: Dask, Polars, Vaex
- scientific-communication: Writing, review, posters (27 skills)
- research-methodology: Brainstorming, hypothesis (11 skills)

See bio_skills_catalog in system prompt for full list.

Examples:
- load_bio_skills(categories=["rna-quantification"]) — load RNA-seq skills
- load_bio_skills(categories=["variant-calling", "alignment"]) — load multiple categories
- load_bio_skills(categories=["database-access"]) — load broad database skills catalog
- load_bio_skills(categories=["pathway-analysis"], query="GSEA", limit=5) — load only the most relevant pathway skills
- load_bio_skills(categories=["experimental-design"], query="power analysis") — narrow within a broad category

Default behavior is now bounded. Prefer query and limit for broad categories instead of loading every skill in that category.`,
    args: {
      categories: z
        .array(z.string())
        .min(1)
        .describe(
          'Category names to load (e.g., ["rna-seq", "variant-calling"])',
        ),
      query: z
        .string()
        .optional()
        .describe(
          'Optional free-text query to narrow skills within the selected categories (e.g., "power analysis", "GSEA", "STAR alignment")',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe(
          'Maximum number of matching skills to load across each category. Default: 12.',
        ),
      skills: z
        .array(z.string())
        .optional()
        .describe(
          'Optional exact skill names to load when you already know the desired skill names.',
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
      const query =
        typeof args.query === 'string' && args.query.trim().length > 0
          ? args.query.trim()
          : undefined;
      const limit =
        typeof args.limit === 'number' ? Math.trunc(args.limit) : undefined;
      const skillNames = Array.isArray(args.skills)
        ? (args.skills as string[])
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined;
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

      const results = sessionManager.loadCategory(
        sessionID,
        validCategories.map((name) => ({
          name,
          ...(query ? { query } : {}),
          ...(limit !== undefined ? { limit } : {}),
          ...(skillNames && skillNames.length > 0 ? { skills: skillNames } : {}),
        })),
      );
      const loaded = sessionManager.getLoadedSkills(sessionID);
      const totalLoaded = loaded.length;

      const loadedCategories = sessionManager.getLoadedCategories(sessionID);

      const matchedCount = results.reduce(
        (sum, result) => sum + result.selectedSkills.length,
        0,
      );

      if (matchedCount === 0) {
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

      const skillLines = results.flatMap((result) =>
        result.selectedSkills.map(
          (skill) =>
            `- ${skill.name} (${result.name}) — ${skill.description} — ${skill.filePath}`,
        ),
      );

      const categoryLines = results.map((result) => {
        const querySuffix = result.query ? `, query="${result.query}"` : '';
        const limitSuffix = result.limit ? `, limit=${result.limit}` : '';
        return `- ${result.name}: selected ${result.selectedSkills.length}/${result.totalAvailable}, added ${result.addedCount}, session total ${result.totalLoaded}${querySuffix}${limitSuffix}`;
      });

      return [
        `Loaded ${matchedCount} matching bio skills from ${validCategories.length} categories.`,
        `Categories: ${loadedCategories.join(', ')}`,
        ...(query ? [`Query: ${query}`] : []),
        '',
        'Category results:',
        ...categoryLines,
        '',
        'Loaded skill files:',
        ...skillLines,
        '',
        'Use the read tool to open the exact SKILL.md file paths you need before executing.',
      ].join('\n');
    },
  });
}

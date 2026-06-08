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
        `Loaded ${totalLoaded} bio skills from ${validCategories.length} categories.`,
        `Categories: ${loadedCategories.join(', ')}`,
      ].join('\n');
    },
  });
}

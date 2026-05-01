/**
 * Bio task detection tool - let the model decide if a task is bioinformatics-related
 * 
 * Instead of complex pattern matching, we expose a tool that:
 * 1. Model reads user's planning request
 * 2. Model calls detect_bio_task tool to classify
 * 3. Tool returns bio-specific prompt augmentation if bio task detected
 * 4. Model uses augmented context for planning
 */

import type { ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';

const z = tool.schema;

const BIO_PLANNING_AUGMENTATION = `
<bio_planning_context>

## Bioinformatics Task Characteristics

You are working on a bioinformatics/computational biology task. Consider:

### Data Types
- Genomic sequences (FASTA, FASTQ, BAM, SAM, VCF)
- Protein structures (PDB, mmCIF)
- Expression data (RNA-seq, microarray)
- Phylogenetic trees (Newick, NEXUS)
- Pathway databases (KEGG, Reactome)

### Common Workflows
- Sequence alignment and assembly
- Variant calling and annotation
- Differential expression analysis
- Protein structure prediction
- Phylogenetic analysis
- Pathway enrichment

### Tools & Frameworks
- R/Bioconductor for statistical analysis
- Python/Biopython for sequence manipulation
- Command-line tools (BLAST, BWA, SAMtools, GATK)
- Workflow managers (Snakemake, Nextflow)

### Best Practices
- Document data provenance (source, version, preprocessing)
- Use reproducible workflows with version control
- Validate results with biological knowledge
- Consider statistical power and multiple testing correction
- Include quality control steps

### Bio Skills Available
Use the load_bio_skills tool to load domain-specific skills when needed.
Categories include: genomics, proteomics, transcriptomics, phylogenetics, structural-biology, etc.

### Bio MCPs Available
- ncbi_eutils: NCBI database queries
- uniprot: Protein sequence and annotation
- pdb: Protein structure data
- ensembl: Genome annotation
- biocyc: Metabolic pathways

</bio_planning_context>
`;

const ENGINEERING_PLANNING_AUGMENTATION = `
<engineering_planning_context>

## Software Engineering Task Characteristics

You are working on a software engineering task. Consider:

### Code Quality
- Clean architecture and design patterns
- SOLID principles
- DRY (Don't Repeat Yourself)
- Separation of concerns

### Testing Strategy
- Unit tests for isolated logic
- Integration tests for component interaction
- End-to-end tests for user workflows
- Test coverage and edge cases

### Performance
- Time complexity analysis
- Space complexity analysis
- Profiling and optimization
- Caching strategies

### Maintainability
- Clear naming conventions
- Comprehensive documentation
- Code comments for complex logic
- Refactoring for readability

### Tools & Frameworks
- Version control (Git)
- CI/CD pipelines
- Linters and formatters
- Package managers

</engineering_planning_context>
`;

export const detectBioTaskTool: ToolDefinition = tool({
  description: `Classify if the current task is bioinformatics/computational biology related or software engineering.
Call this tool when starting to plan a task to get domain-specific context.

Returns augmented planning context based on task classification.`,
  args: {
    task_description: z.string().describe('Brief description of the task to classify'),
    is_bio_task: z.boolean().describe('Your assessment: is this a bioinformatics/computational biology task? (true) or software engineering task? (false)'),
  },
  async execute({ task_description, is_bio_task }) {
    const classification = is_bio_task ? 'bioinformatics' : 'engineering';
    const augmentation = is_bio_task 
      ? BIO_PLANNING_AUGMENTATION 
      : ENGINEERING_PLANNING_AUGMENTATION;

    return `Task classified as: ${classification}\n\n${augmentation}`;
  },
});

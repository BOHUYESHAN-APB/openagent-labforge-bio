import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildBioSkillsCatalog,
  formatCatalogForPrompt,
  formatLoadedSkillsForPrompt,
  readGeneratedBioSkillsCatalog,
  scanBioSkillsCatalog,
} from './index';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bio-catalog-'));
  tempDirs.push(dir);
  return dir;
}

function writeSkill(
  categoryDir: string,
  skillName: string,
  frontmatter: {
    name: string;
    description: string;
    tool_type?: string;
    primary_tool?: string;
  },
) {
  const skillDir = join(categoryDir, skillName);
  mkdirSync(skillDir, { recursive: true });

  const lines = ['---'];
  lines.push(`name: ${frontmatter.name}`);
  lines.push(`description: ${frontmatter.description}`);
  if (frontmatter.tool_type) {
    lines.push(`tool_type: ${frontmatter.tool_type}`);
  }
  if (frontmatter.primary_tool) {
    lines.push(`primary_tool: ${frontmatter.primary_tool}`);
  }
  lines.push('---', '', `# ${frontmatter.name}`);

  writeFileSync(join(skillDir, 'SKILL.md'), lines.join('\n'));
}

describe('bio skills catalog metadata', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('collects sample skills, tool types, and primary tools per category', () => {
    const repoRoot = makeTempDir();
    const categoryDir = join(repoRoot, 'experimental-design');
    mkdirSync(categoryDir, { recursive: true });

    writeSkill(categoryDir, 'research-question-framing', {
      name: 'bio-experimental-design-research-question-framing',
      description: 'Frame broad ideas into clear study questions',
      tool_type: 'mixed',
      primary_tool: 'study-design-frameworks',
    });

    writeSkill(categoryDir, 'power-analysis', {
      name: 'bio-experimental-design-power-analysis',
      description: 'Estimate power and sample size',
      tool_type: 'r',
      primary_tool: 'RNASeqPower',
    });

    const catalog = scanBioSkillsCatalog(repoRoot);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.name).toBe('experimental-design');
    expect(catalog[0]?.skillCount).toBe(2);
    expect(catalog[0]?.sampleSkills).toEqual([
      'bio-experimental-design-power-analysis',
      'bio-experimental-design-research-question-framing',
    ]);
    expect(catalog[0]?.toolTypes).toEqual(['mixed', 'r']);
    expect(catalog[0]?.primaryTools).toEqual([
      'RNASeqPower',
      'study-design-frameworks',
    ]);
  });

  it('renders richer prompt catalog context', () => {
    const catalogText = formatCatalogForPrompt([
      {
        name: 'experimental-design',
        path: '/tmp/experimental-design',
        skillCount: 3,
        sampleSkills: [
          'bio-experimental-design-research-question-framing',
          'bio-experimental-design-hypothesis-structuring',
        ],
        toolTypes: ['mixed', 'r'],
        primaryTools: ['RNASeqPower', 'study-design-frameworks'],
      },
    ]);

    expect(catalogText).toContain('**experimental-design** (3 skills)');
    expect(catalogText).toContain('tools: mixed, r');
    expect(catalogText).toContain(
      'primary: RNASeqPower, study-design-frameworks',
    );
    expect(catalogText).toContain(
      'samples: bio-experimental-design-research-question-framing, bio-experimental-design-hypothesis-structuring',
    );
  });

  it('renders loaded skills with exact file paths', () => {
    const loadedText = formatLoadedSkillsForPrompt([
      {
        name: 'bio-pathway-gsea',
        description: 'Perform GSEA-based pathway enrichment',
        category: 'pathway-analysis',
        filePath: '/tmp/pathway-analysis/gsea/SKILL.md',
        content: '# skill',
        toolType: 'r',
        primaryTool: 'GSEA',
      },
    ]);

    expect(loadedText).toContain('File path: /tmp/pathway-analysis/gsea/SKILL.md');
    expect(loadedText).toContain('Use the read tool to load specific skill instructions');
  });

  it('builds and reads a machine-readable catalog file', () => {
    const repoRoot = makeTempDir();
    const categoryDir = join(repoRoot, 'experimental-design');
    mkdirSync(categoryDir, { recursive: true });

    writeSkill(categoryDir, 'validation-strategy', {
      name: 'bio-experimental-design-validation-strategy',
      description: 'Plan controls and orthogonal validation',
      tool_type: 'mixed',
      primary_tool: 'validation-planning',
    });

    const catalog = buildBioSkillsCatalog(repoRoot);
    expect(catalog.categoryCount).toBe(1);
    expect(catalog.skillCount).toBe(1);
    expect(catalog.categories[0]?.skills[0]?.name).toBe(
      'bio-experimental-design-validation-strategy',
    );
    expect(catalog.categories[0]?.skills[0]?.toolType).toBe('mixed');
    expect(catalog.categories[0]?.skills[0]?.primaryTool).toBe(
      'validation-planning',
    );

    const catalogPath = join(repoRoot, 'catalog.json');
    writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));

    const loaded = readGeneratedBioSkillsCatalog(repoRoot);
    expect(loaded?.categoryCount).toBe(1);
    expect(loaded?.categories[0]?.sampleSkills).toEqual([
      'bio-experimental-design-validation-strategy',
    ]);

    const scanned = scanBioSkillsCatalog(repoRoot);
    expect(scanned[0]?.sampleSkills).toEqual([
      'bio-experimental-design-validation-strategy',
    ]);
    expect(scanned[0]?.primaryTools).toEqual(['validation-planning']);
  });
});

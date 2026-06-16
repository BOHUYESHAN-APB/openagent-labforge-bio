import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BioSkillCategory } from './catalog';
import { BioSkillsSessionManager } from './session-manager';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bio-session-manager-'));
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

function createManager(categoryPath: string): BioSkillsSessionManager {
  const categories: BioSkillCategory[] = [
    {
      name: 'pathway-analysis',
      path: categoryPath,
      skillCount: 3,
      sampleSkills: [
        'bio-pathway-gsea',
        'bio-pathway-go-enrichment',
        'bio-pathway-reactome',
      ],
      toolTypes: ['r'],
      primaryTools: ['GSEA', 'ReactomePA', 'clusterProfiler'],
    },
  ];

  return new BioSkillsSessionManager(categories);
}

describe('BioSkillsSessionManager', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  test('filters skills by query and exposes selected subset', () => {
    const repoRoot = makeTempDir();
    const categoryDir = join(repoRoot, 'pathway-analysis');
    mkdirSync(categoryDir, { recursive: true });

    writeSkill(categoryDir, 'gsea', {
      name: 'bio-pathway-gsea',
      description: 'Perform GSEA-based pathway enrichment',
      tool_type: 'r',
      primary_tool: 'GSEA',
    });
    writeSkill(categoryDir, 'go', {
      name: 'bio-pathway-go-enrichment',
      description: 'Run GO enrichment with clusterProfiler',
      tool_type: 'r',
      primary_tool: 'clusterProfiler',
    });
    writeSkill(categoryDir, 'reactome', {
      name: 'bio-pathway-reactome',
      description: 'Analyze Reactome pathways',
      tool_type: 'r',
      primary_tool: 'ReactomePA',
    });

    const manager = createManager(categoryDir);
    const results = manager.loadCategory('s1', [
      {
        name: 'pathway-analysis',
        query: 'gsea',
        limit: 2,
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.selectedSkills.map((skill) => skill.name)).toEqual([
      'bio-pathway-gsea',
    ]);
    expect(manager.getLoadedSkills('s1').map((skill) => skill.name)).toEqual([
      'bio-pathway-gsea',
    ]);
  });

  test('merges newly requested skills into an already loaded category', () => {
    const repoRoot = makeTempDir();
    const categoryDir = join(repoRoot, 'pathway-analysis');
    mkdirSync(categoryDir, { recursive: true });

    writeSkill(categoryDir, 'gsea', {
      name: 'bio-pathway-gsea',
      description: 'Perform GSEA-based pathway enrichment',
      tool_type: 'r',
      primary_tool: 'GSEA',
    });
    writeSkill(categoryDir, 'go', {
      name: 'bio-pathway-go-enrichment',
      description: 'Run GO enrichment with clusterProfiler',
      tool_type: 'r',
      primary_tool: 'clusterProfiler',
    });
    writeSkill(categoryDir, 'reactome', {
      name: 'bio-pathway-reactome',
      description: 'Analyze Reactome pathways',
      tool_type: 'r',
      primary_tool: 'ReactomePA',
    });

    const manager = createManager(categoryDir);
    manager.loadCategory('s1', [
      { name: 'pathway-analysis', query: 'gsea', limit: 2 },
    ]);
    const results = manager.loadCategory('s1', [
      { name: 'pathway-analysis', query: 'reactome', limit: 2 },
    ]);

    expect(results[0]?.addedCount).toBe(1);
    expect(manager.getLoadedSkills('s1').map((skill) => skill.name)).toEqual([
      'bio-pathway-gsea',
      'bio-pathway-reactome',
    ]);
  });

  test('loads explicit skill names only', () => {
    const repoRoot = makeTempDir();
    const categoryDir = join(repoRoot, 'pathway-analysis');
    mkdirSync(categoryDir, { recursive: true });

    writeSkill(categoryDir, 'gsea', {
      name: 'bio-pathway-gsea',
      description: 'Perform GSEA-based pathway enrichment',
      tool_type: 'r',
      primary_tool: 'GSEA',
    });
    writeSkill(categoryDir, 'go', {
      name: 'bio-pathway-go-enrichment',
      description: 'Run GO enrichment with clusterProfiler',
      tool_type: 'r',
      primary_tool: 'clusterProfiler',
    });

    const manager = createManager(categoryDir);
    const results = manager.loadCategory('s1', [
      {
        name: 'pathway-analysis',
        skills: ['bio-pathway-go-enrichment'],
      },
    ]);

    expect(results[0]?.selectedSkills.map((skill) => skill.name)).toEqual([
      'bio-pathway-go-enrichment',
    ]);
  });
});

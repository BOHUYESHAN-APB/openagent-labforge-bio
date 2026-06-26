import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCategorySkills } from './loader';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bio-loader-'));
  tempDirs.push(dir);
  return dir;
}

describe('bio skill loader resources', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  test('collects examples, scripts, and usage guide as reusable resources', () => {
    const repoRoot = makeTempDir();
    const categoryDir = join(repoRoot, 'workflows');
    const skillDir = join(categoryDir, 'rnaseq-to-de');
    mkdirSync(join(skillDir, 'examples'), { recursive: true });
    mkdirSync(join(skillDir, 'scripts'), { recursive: true });

    writeFileSync(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: bio-workflows-rnaseq-to-de',
        'description: End-to-end RNA-seq workflow',
        'tool_type: mixed',
        'primary_tool: DESeq2',
        '---',
        '',
        '# RNA-seq workflow',
      ].join('\n'),
    );
    writeFileSync(join(skillDir, 'usage-guide.md'), '# Usage');
    writeFileSync(join(skillDir, 'examples', 'workflow.R'), 'print("ok")');
    writeFileSync(join(skillDir, 'scripts', 'run_pipeline.sh'), '#!/bin/bash');
    writeFileSync(join(skillDir, 'references.md'), '# ignored');

    const loaded = loadCategorySkills(categoryDir, 'workflows');
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.resources).toEqual([
      {
        kind: 'script',
        filePath: join(skillDir, 'scripts', 'run_pipeline.sh'),
        relativePath: 'scripts/run_pipeline.sh',
        language: 'shell',
        reuseMode: 'direct',
      },
      {
        kind: 'example',
        filePath: join(skillDir, 'examples', 'workflow.R'),
        relativePath: 'examples/workflow.R',
        language: 'r',
        reuseMode: 'adapt',
      },
      {
        kind: 'guide',
        filePath: join(skillDir, 'usage-guide.md'),
        relativePath: 'usage-guide.md',
        language: 'markdown',
        reuseMode: 'reference',
      },
    ]);
  });

  test('marks demo-like example code as adapt instead of direct reuse', () => {
    const repoRoot = makeTempDir();
    const categoryDir = join(repoRoot, 'flow-cytometry');
    const skillDir = join(categoryDir, 'doublet-detection');
    mkdirSync(join(skillDir, 'examples'), { recursive: true });

    writeFileSync(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: bio-flow-doublet',
        'description: Doublet detection',
        '---',
      ].join('\n'),
    );
    writeFileSync(
      join(skillDir, 'examples', 'detect_doublets.R'),
      ['# Simulated example', 'set.seed(42)', 'cat("Simulated data")'].join(
        '\n',
      ),
    );

    const loaded = loadCategorySkills(categoryDir, 'flow-cytometry');
    expect(loaded[0]?.resources[0]?.reuseMode).toBe('adapt');
  });
});

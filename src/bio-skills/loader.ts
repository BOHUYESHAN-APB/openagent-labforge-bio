import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export interface BioSkillResource {
  kind: 'script' | 'example' | 'guide';
  filePath: string;
  relativePath: string;
  language?: 'python' | 'r' | 'shell' | 'markdown';
  reuseMode: 'direct' | 'adapt' | 'reference';
}

export interface BioSkillMetadata {
  name: string;
  description: string;
  category: string;
  filePath: string;
  content: string;
  toolType?: string;
  primaryTool?: string;
  resources: BioSkillResource[];
}

/**
 * Loads skills from a specific category directory
 */
export function loadCategorySkills(
  categoryPath: string,
  categoryName: string,
): BioSkillMetadata[] {
  const skills: BioSkillMetadata[] = [];

  function scanDir(dirPath: string) {
    try {
      const entries = readdirSync(dirPath);

      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (entry === 'SKILL.md') {
          const skill = parseSkillFile(fullPath, categoryName);
          if (skill) {
            skills.push(skill);
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  scanDir(categoryPath);
  return skills;
}

export function countSkillFilesInCategory(categoryPath: string): number {
  if (!existsSync(categoryPath)) return 0;

  let count = 0;
  function scanDir(dirPath: string) {
    try {
      for (const entry of readdirSync(dirPath)) {
        const fullPath = join(dirPath, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (entry === 'SKILL.md') {
          count++;
        }
      }
    } catch {
      // Ignore scan errors
    }
  }

  scanDir(categoryPath);
  return count;
}

function parseSkillFile(
  filePath: string,
  category: string,
): BioSkillMetadata | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const frontmatter = extractFrontmatter(content);

    if (!frontmatter.name || !frontmatter.description) {
      return null;
    }

    return {
      name: frontmatter.name,
      description: frontmatter.description,
      category,
      filePath,
      content,
      toolType: frontmatter.tool_type,
      primaryTool: frontmatter.primary_tool,
      resources: collectSkillResources(dirname(filePath)),
    };
  } catch {
    return null;
  }
}

function collectSkillResources(skillDir: string): BioSkillResource[] {
  const resources: BioSkillResource[] = [];
  const resourceDirs: Array<{ kind: 'script' | 'example'; dirName: string }> = [
    { kind: 'script', dirName: 'scripts' },
    { kind: 'example', dirName: 'examples' },
  ];

  for (const entry of resourceDirs) {
    const dirPath = join(skillDir, entry.dirName);
    if (!existsSync(dirPath)) {
      continue;
    }

    scanResourceDir(skillDir, dirPath, entry.kind, resources);
  }

  const usageGuidePath = join(skillDir, 'usage-guide.md');
  if (existsSync(usageGuidePath)) {
    resources.push({
      kind: 'guide',
      filePath: usageGuidePath,
      relativePath: 'usage-guide.md',
      language: 'markdown',
      reuseMode: 'reference',
    });
  }

  return resources.sort((left, right) => {
    const kindOrder = { script: 0, example: 1, guide: 2 };
    if (kindOrder[left.kind] !== kindOrder[right.kind]) {
      return kindOrder[left.kind] - kindOrder[right.kind];
    }
    return left.relativePath.localeCompare(right.relativePath);
  });
}

function scanResourceDir(
  skillDir: string,
  dirPath: string,
  kind: 'script' | 'example',
  resources: BioSkillResource[],
): void {
  try {
    for (const entry of readdirSync(dirPath)) {
      const fullPath = join(dirPath, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanResourceDir(skillDir, fullPath, kind, resources);
        continue;
      }

      const language = inferResourceLanguage(entry);
      if (!language) {
        continue;
      }

      const fileContent = readResourceContent(fullPath);

      resources.push({
        kind,
        filePath: fullPath,
        relativePath: relative(skillDir, fullPath).replace(/\\/g, '/'),
        language,
        reuseMode: inferReuseMode(kind, language, fullPath, fileContent),
      });
    }
  } catch {
    // Ignore resource scan errors
  }
}

function inferResourceLanguage(
  fileName: string,
): BioSkillResource['language'] | undefined {
  if (fileName.endsWith('.py')) {
    return 'python';
  }
  if (fileName.endsWith('.R')) {
    return 'r';
  }
  if (fileName.endsWith('.sh')) {
    return 'shell';
  }
  return undefined;
}

function readResourceContent(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function inferReuseMode(
  kind: BioSkillResource['kind'],
  language: NonNullable<BioSkillResource['language']>,
  filePath: string,
  content: string,
): BioSkillResource['reuseMode'] {
  if (kind === 'guide') {
    return 'reference';
  }

  const lower = `${filePath}\n${content}`.toLowerCase();
  const demoSignals = [
    'simulated',
    'simulate',
    'synthetic',
    'demo data',
    'example only',
    'illustrative',
    'dummy data',
    'toy data',
  ];
  if (demoSignals.some((signal) => lower.includes(signal))) {
    return 'adapt';
  }

  if (kind === 'script') {
    return 'direct';
  }

  if (kind === 'example' && language === 'shell') {
    return 'direct';
  }

  return 'adapt';
}

function extractFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result: Record<string, string> = {};

  for (const line of yaml.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line
      .slice(colonIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, '');

    if (key && value) {
      result[key] = value;
    }
  }

  return result;
}

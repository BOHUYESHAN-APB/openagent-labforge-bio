import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface BioSkillMetadata {
  name: string;
  description: string;
  category: string;
  filePath: string;
  content: string;
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
    };
  } catch {
    return null;
  }
}

function extractFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result: Record<string, string> = {};

  for (const line of yaml.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, '');

    if (key && value) {
      result[key] = value;
    }
  }

  return result;
}

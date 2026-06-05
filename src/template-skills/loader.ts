import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface TemplateSkillMetadata {
  name: string;
  description: string;
  category: string;
  filePath: string;
  content: string;
}

/**
 * Loads skills from a specific category directory.
 * Scans recursively for SKILL.md files and parses frontmatter.
 */
export function loadCategorySkills(
  categoryPaths: string[],
  categoryName: string,
): TemplateSkillMetadata[] {
  const skills: TemplateSkillMetadata[] = [];

  for (const categoryPath of categoryPaths) {
    if (!existsSync(categoryPath)) continue;
    scanDir(categoryPath, categoryName, skills);
  }

  return skills;
}

function scanDir(
  dirPath: string,
  categoryName: string,
  skills: TemplateSkillMetadata[],
): void {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath, categoryName, skills);
      } else if (entry.name === 'SKILL.md') {
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

function parseSkillFile(
  filePath: string,
  categoryName: string,
): TemplateSkillMetadata | null {
  try {
    const content = readFileSync(filePath, 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;

    const frontmatter = fmMatch[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

    if (!nameMatch) return null;

    return {
      name: nameMatch[1].trim(),
      description: descMatch ? descMatch[1].trim() : '',
      category: categoryName,
      filePath,
      content: `${fmMatch[0]}\n${content.slice(fmMatch[0].length)}`,
    };
  } catch {
    return null;
  }
}

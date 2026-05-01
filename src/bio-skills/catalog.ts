import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface BioSkillCategory {
  name: string;
  path: string;
  skillCount: number;
}

/**
 * Scans bioSkills repository and returns category catalog (not full skills)
 */
export function scanBioSkillsCatalog(repoPath: string): BioSkillCategory[] {
  if (!existsSync(repoPath)) {
    return [];
  }

  const categories: BioSkillCategory[] = [];

  try {
    const entries = readdirSync(repoPath);

    for (const entry of entries) {
      const fullPath = join(repoPath, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Count SKILL.md files in this category
        const skillCount = countSkillFiles(fullPath);
        if (skillCount > 0) {
          categories.push({
            name: entry,
            path: fullPath,
            skillCount,
          });
        }
      }
    }
  } catch {
    // Ignore scan errors
  }

  return categories.sort((a, b) => a.name.localeCompare(b.name));
}

function countSkillFiles(dirPath: string): number {
  let count = 0;

  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        count += countSkillFiles(fullPath);
      } else if (entry === 'SKILL.md') {
        count++;
      }
    }
  } catch {
    // Ignore errors
  }

  return count;
}

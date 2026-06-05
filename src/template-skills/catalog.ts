import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface TemplateSkillCategory {
  name: string;
  description: string;
  paths: string[];
  skillCount: number;
  sampleSkills?: string[];
}

export interface TemplateSkillSummary {
  name: string;
  description: string;
  category: string;
  path: string;
}

/**
 * Static category definitions for template skills.
 * Each category maps to one or more directories containing SKILL.md files.
 * Paths are relative to packageRoot.
 */
export const TEMPLATE_SKILL_CATEGORIES: Array<{
  name: string;
  description: string;
  relativePaths: string[];
  sampleSkills?: string[];
}> = [
  {
    name: 'html-deck',
    description: 'HTML 幻灯片/PPT 模板（横向翻页、演讲者模式、WebGL 背景）',
    relativePaths: [
      'ThirdParty/html-ppt-skill',
      'ThirdParty/guizang-ppt-skill',
    ],
    sampleSkills: ['html-ppt', 'guizang-ppt-skill'],
  },
  {
    name: 'html-templates',
    description:
      'HTML 页面模板（仪表板、落地页、卡片、文档页、海报、PPT 等 70+ 种）',
    relativePaths: ['ThirdParty/html-anything-skills'],
    sampleSkills: [
      'dashboard',
      'saas-landing',
      'pricing-page',
      'blog-post',
      'resume-modern',
    ],
  },
  {
    name: 'academic-tools',
    description:
      '学术工具（CNKI 解析、引用匹配、MD 转 DOCX、LaTeX 编译、引用数据库、论文写作、Office 文档、科研计算）',
    relativePaths: ['resources/academicSkills'],
    sampleSkills: [
      'cnki-parser',
      'cite-match',
      'md2docx',
      'latex-pipeline',
      'citation-database',
      'research-writing-skill',
      'office-academic-skill',
      'scientific-toolkit-skill',
    ],
  },
];

/**
 * Build the template skill catalog by scanning directories on disk.
 * Returns categories with actual skill counts and sample skill names.
 */
export function buildTemplateCatalog(
  packageRoot: string,
): TemplateSkillCategory[] {
  const categories: TemplateSkillCategory[] = [];

  for (const def of TEMPLATE_SKILL_CATEGORIES) {
    const paths: string[] = [];
    let totalCount = 0;
    const sampleSkills: string[] = [];

    for (const relPath of def.relativePaths) {
      const absPath = join(packageRoot, relPath);
      if (!existsSync(absPath)) continue;
      paths.push(absPath);

      const skills = scanSkillNames(absPath);
      totalCount += skills.length;

      // Collect first few as samples
      for (const s of skills.slice(0, 5)) {
        if (!sampleSkills.includes(s)) {
          sampleSkills.push(s);
        }
      }
    }

    if (totalCount > 0) {
      categories.push({
        name: def.name,
        description: def.description,
        paths,
        skillCount: totalCount,
        sampleSkills: sampleSkills.length > 0 ? sampleSkills : def.sampleSkills,
      });
    }
  }

  return categories;
}

/**
 * Scan a directory for SKILL.md files and return their names (from frontmatter).
 */
function scanSkillNames(dirPath: string): string[] {
  const names: string[] = [];

  function scan(dir: string) {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.name === 'SKILL.md') {
          const name = extractSkillName(fullPath);
          if (name) names.push(name);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  scan(dirPath);
  return names;
}

/**
 * Extract skill name from SKILL.md frontmatter.
 */
function extractSkillName(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, 'utf8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    const frontmatter = match[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    return nameMatch ? nameMatch[1].trim() : null;
  } catch {
    return null;
  }
}

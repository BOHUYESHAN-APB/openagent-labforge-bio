import type { BioSkillCategory } from './catalog';
import type { BioSkillMetadata } from './loader';

/**
 * Formats catalog as XML for system prompt
 */
export function formatCatalogForPrompt(categories: BioSkillCategory[]): string {
  if (categories.length === 0) return '';

  const lines = [
    '<bio_skills_catalog>',
    'Available bio skill categories. To use skills from a category, say "load [category] skills" or "use [category] tools".',
    '',
  ];

  for (const cat of categories) {
    lines.push(`- ${cat.name} (${cat.skillCount} skills)`);
  }

  lines.push('</bio_skills_catalog>');
  return lines.join('\n');
}

/**
 * Formats loaded skills as XML for system prompt
 */
export function formatLoadedSkillsForPrompt(
  skills: BioSkillMetadata[],
): string {
  if (skills.length === 0) return '';

  const lines = [
    '<bio_skills_loaded>',
    'Loaded bio skills for this session:',
    '',
  ];

  for (const skill of skills) {
    lines.push(`## ${skill.name}`);
    lines.push(`Category: ${skill.category}`);
    lines.push(`Description: ${skill.description}`);
    lines.push('');
  }

  lines.push('</bio_skills_loaded>');
  return lines.join('\n');
}

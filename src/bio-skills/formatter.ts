import type { BioSkillCategory } from './catalog';
import type { BioSkillMetadata } from './loader';

/**
 * Formats catalog as XML for system prompt with routing guidance
 */
export function formatCatalogForPrompt(categories: BioSkillCategory[]): string {
  if (categories.length === 0) return '';

  const lines = [
    '<bio_skills_catalog>',
    '## Bio Skills Catalog',
    '',
    'For bioinformatics tasks, load relevant skills FIRST using:',
    '  load_bio_skills(categories=["<category-name>"])',
    '',
    '### Available Categories:',
    '',
  ];

  for (const cat of categories) {
    const details: string[] = [];
    if (cat.toolTypes && cat.toolTypes.length > 0) {
      details.push(`tools: ${cat.toolTypes.join(', ')}`);
    }
    if (cat.primaryTools && cat.primaryTools.length > 0) {
      details.push(`primary: ${cat.primaryTools.slice(0, 4).join(', ')}`);
    }
    if (cat.sampleSkills && cat.sampleSkills.length > 0) {
      details.push(`samples: ${cat.sampleSkills.join(', ')}`);
    }

    const suffix = details.length > 0 ? ` — ${details.join(' | ')}` : '';
    lines.push(`- **${cat.name}** (${cat.skillCount} skills)${suffix}`);
  }

  lines.push('');
  lines.push('### Routing Guide:');
  for (const cat of categories) {
    const routeName = cat.name.replace(/-/g, ' ');
    if (cat.sampleSkills && cat.sampleSkills.length > 0) {
      lines.push(
        `- ${routeName} → \`${cat.name}\` (e.g. ${cat.sampleSkills.slice(0, 3).join(', ')})`,
      );
    } else {
      lines.push(`- ${routeName} → \`${cat.name}\``);
    }
  }
  lines.push('');
  lines.push('</bio_skills_catalog>');
  return lines.join('\n');
}

/**
 * Formats loaded skills as XML for system prompt.
 * Shows metadata + file path so the agent can read specific skills with the read tool.
 */
export function formatLoadedSkillsForPrompt(
  skills: BioSkillMetadata[],
): string {
  if (skills.length === 0) return '';

  const lines = [
    '<bio_skills_loaded>',
    'Loaded bio skills for this session.',
    'Use the read tool to load specific skill instructions before executing.',
    '',
  ];

  for (const skill of skills) {
    lines.push(`## ${skill.name}`);
    lines.push(`Category: ${skill.category}`);
    lines.push(`Description: ${skill.description}`);
    lines.push(`File path: ${skill.filePath}`);
    if (skill.toolType) {
      lines.push(`Tool type: ${skill.toolType}`);
    }
    if (skill.primaryTool) {
      lines.push(`Primary tool: ${skill.primaryTool}`);
    }
    if (skill.resources.length > 0) {
      lines.push('Reusable resources:');
      for (const resource of skill.resources.slice(0, 8)) {
        const language = resource.language ? ` (${resource.language})` : '';
        lines.push(
          `- [${resource.kind}|${resource.reuseMode}] ${resource.filePath}${language}`,
        );
      }
    }
    lines.push('');
  }

  lines.push('</bio_skills_loaded>');
  return lines.join('\n');
}

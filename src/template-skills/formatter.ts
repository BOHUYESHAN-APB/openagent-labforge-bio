import type { TemplateSkillCategory } from './catalog';

/**
 * Formats template skill catalog as XML for system prompt.
 * Shows available categories and sample skills so the AI knows
 * what to request via load_skill_template.
 */
export function formatTemplateCatalogForPrompt(
  categories: TemplateSkillCategory[],
): string {
  if (categories.length === 0) return '';

  const lines = [
    '<template_skills_catalog>',
    '## Template Skills Catalog',
    '',
    'For HTML templates, presentations, academic tools, or document generation, load relevant skills FIRST using:',
    '  load_skill_template(categories=["<category-name>"])',
    '',
    '### Available Categories:',
    '',
  ];

  for (const cat of categories) {
    const details: string[] = [];
    details.push(`${cat.skillCount} skills`);
    if (cat.sampleSkills && cat.sampleSkills.length > 0) {
      details.push(`samples: ${cat.sampleSkills.slice(0, 5).join(', ')}`);
    }
    const suffix = details.length > 0 ? ` — ${details.join(' | ')}` : '';
    lines.push(`- **${cat.name}**: ${cat.description}${suffix}`);
  }

  lines.push('');
  lines.push('### Routing Guide:');
  lines.push('- HTML 幻灯片/PPT → `html-deck` (html-ppt, guizang-ppt)');
  lines.push('- HTML 页面模板（仪表板/落地页/卡片等）→ `html-templates`');
  lines.push('- 学术工具（CNKI/引用/LaTeX/DOCX）→ `academic-tools`');
  lines.push('');
  lines.push('</template_skills_catalog>');
  return lines.join('\n');
}

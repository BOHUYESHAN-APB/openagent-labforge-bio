import type { ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import type { TemplateSkillsSessionManager } from './session-manager';

const z = tool.schema;

export function createLoadSkillTemplateTool(
  sessionManager: TemplateSkillsSessionManager,
): ToolDefinition {
  return tool({
    description: `Load skill templates by category. Use when you need HTML page templates, presentation decks, academic tools, or document generation templates. Returns SKILL.md content for the requested categories.

Available categories:
- html-deck: HTML 幻灯片/PPT 模板（横向翻页、演讲者模式、WebGL 背景）— 2 skills
- html-templates: HTML 页面模板（仪表板、落地页、卡片、文档页、海报、PPT、数据报告、社交卡片等）— 75+ skills
- academic-tools: 学术工具 — 9 skills:
  • academic-pipeline: 完整研究到发表管线（6 阶段 7 代理）
  • cnki-parser: CNKI 导出→BibTeX 转换器
  • cite-match: 正文引用匹配引擎
  • md2docx: Markdown→HTML→DOCX 管线
  • latex-pipeline: LaTeX 模板+编译
  • citation-database: 本地引用向量数据库
  • research-writing-skill: 论文写作、修改、润色、审稿回复
  • office-academic-skill: 学术 Word/PPT 生成
  • scientific-toolkit-skill: 科研计算（MATLAB/Python）

Examples:
- load_skill_template(categories=["html-deck"]) — load presentation templates
- load_skill_template(categories=["html-templates"]) — load HTML page templates
- load_skill_template(categories=["academic-tools"]) — load academic tools
- load_skill_template(categories=["html-deck", "html-templates"]) — load both

IMPORTANT: Do NOT use the built-in 'skill' tool for these. Use load_skill_template instead.`,
    args: {
      categories: z
        .array(z.string())
        .min(1)
        .describe(
          'Category names to load (e.g., ["html-deck", "html-templates", "academic-tools"])',
        ),
    },
    async execute(args, toolContext) {
      if (
        !toolContext ||
        typeof toolContext !== 'object' ||
        !('sessionID' in toolContext)
      ) {
        return 'Error: No session ID available';
      }

      const categories = args.categories as string[];
      const sessionID = (toolContext as { sessionID: string }).sessionID;

      // Validate categories exist
      const catalog = sessionManager.getCatalog();
      const catalogByName = new Map(catalog.map((cat) => [cat.name, cat]));
      const validCategories = categories.filter((c) => catalogByName.has(c));

      if (validCategories.length === 0) {
        const available = catalog.map((c) => c.name).join(', ');
        return `Error: No valid categories found. Available categories: ${available}`;
      }

      if (validCategories.length < categories.length) {
        const invalid = categories.filter((c) => !validCategories.includes(c));
        return `Error: Invalid categories: ${invalid.join(', ')}. Use categories from the catalog in system prompt.`;
      }

      // Load all valid categories
      const success = sessionManager.loadCategory(sessionID, validCategories);

      if (!success) {
        return `Warning: No skills loaded from categories: ${validCategories.join(', ')}`;
      }

      const loaded = sessionManager.getLoadedSkills(sessionID);
      const loadedCategories = sessionManager.getLoadedCategories(sessionID);

      // Return summary with skill names
      const skillList = loaded
        .map((s) => `  - ${s.name}: ${s.description}`)
        .join('\n');

      return [
        `Successfully loaded ${loaded.length} skills from ${validCategories.length} categories.`,
        `Categories: ${loadedCategories.join(', ')}`,
        '',
        'Loaded skills:',
        skillList,
        '',
        'Use the read tool to load specific SKILL.md files for detailed instructions.',
      ].join('\n');
    },
  });
}

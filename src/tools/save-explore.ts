import { type ToolDefinition, tool } from '@opencode-ai/plugin';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const z = tool.schema;

export function createSaveExploreTool(workspaceRoot: string): ToolDefinition {
  return tool({
    description: `Save exploration notes to .opencode/extendai-lab/explore/ directory.

Use this when exploring ideas, investigating problems, or researching solutions. Creates a structured folder with notes and context.

The explore folder structure:
- notes.md — Research notes, findings, observations
- context.json — Metadata (session ID, creation time, tags)

CRITICAL WORKFLOW:
1. FIRST: Discuss findings with user
2. THEN: Present the notes to user for review
3. ONLY AFTER user approves: Call this tool to save
4. Do NOT save without user confirmation`,
    args: {
      topic: z
        .string()
        .describe(
          'Topic name (e.g., "auth-approaches", "performance-optimization"). Will be normalized to kebab-case.',
        ),
      notes: z
        .string()
        .describe('Research notes, findings, observations.'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Tags for categorization (e.g., ["architecture", "security"]).'),
      sessionId: z
        .string()
        .optional()
        .describe('Current session ID for tracking.'),
    },
    async execute(args) {
      const topic = String(args.topic)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const date = new Date().toISOString().split('T')[0];
      const folderName = `${date}-${topic}`;
      const exploreDir = join(workspaceRoot, '.opencode', 'extendai-lab', 'explore');
      const topicDir = join(exploreDir, folderName);

      try {
        // Create directory
        mkdirSync(topicDir, { recursive: true });

        // Write notes.md
        writeFileSync(join(topicDir, 'notes.md'), String(args.notes), 'utf8');

        // Write context.json
        const context = {
          topic,
          created: new Date().toISOString(),
          session_id: args.sessionId || null,
          related_change: null,
          tags: args.tags || [],
        };
        writeFileSync(join(topicDir, 'context.json'), JSON.stringify(context, null, 2), 'utf8');

        const relativePath = `.opencode/extendai-lab/explore/${folderName}`;

        return [
          'Exploration notes saved successfully.',
          `Path: ${relativePath}`,
          `Notes: notes.md`,
          `Tags: ${args.tags?.join(', ') || 'none'}`,
          '',
          'Next steps:',
          '1. Review and expand notes as you learn more',
          '2. If exploration leads to a change, use save_change tool',
          '3. Link related changes in context.json',
        ].join('\n');
      } catch (error) {
        return [
          'Exploration save failed.',
          `Reason: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ].join('\n');
      }
    },
  });
}

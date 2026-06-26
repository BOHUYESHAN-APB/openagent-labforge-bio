import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type ToolDefinition, tool } from '@opencode-ai/plugin';

const z = tool.schema;

export function createSaveScratchTool(workspaceRoot: string): ToolDefinition {
  return tool({
    description: `Save a quick note to .opencode/extendai-lab/sessions/<session-id>/scratch.md.

Use this when you need to jot down a quick thought, idea, or observation during a session without interrupting the current work flow. Notes are isolated per session.

This is for "let me note this down quickly" moments:
- User mentions something important but off-topic
- You notice a potential issue but can't investigate now
- An idea comes up that should be explored later
- A constraint or decision that should be remembered

This tool does NOT require user confirmation — it's for quick notes that don't interrupt workflow.`,
    args: {
      note: z.string().describe('The quick note to save.'),
      sessionId: z
        .string()
        .describe('Current session ID (required for session isolation).'),
      category: z
        .enum(['idea', 'issue', 'decision', 'constraint', 'todo', 'other'])
        .optional()
        .describe('Note category for organization.'),
    },
    async execute(args) {
      const sessionId = String(args.sessionId).trim();
      if (!sessionId) {
        return 'Scratch save failed: sessionId is required.';
      }

      const sessionsDir = join(
        workspaceRoot,
        '.opencode',
        'extendai-lab',
        'sessions',
      );
      const sessionDir = join(sessionsDir, sessionId);
      const scratchFile = join(sessionDir, 'scratch.md');

      try {
        // Create directory
        mkdirSync(sessionDir, { recursive: true });

        // Read existing scratch.md or create new
        let existingContent = '';
        if (existsSync(scratchFile)) {
          existingContent = readFileSync(scratchFile, 'utf8');
        }

        // Format new note
        const timestamp = new Date().toISOString();
        const category = args.category || 'other';
        const categoryEmoji: Record<string, string> = {
          idea: '💡',
          issue: '⚠️',
          decision: '✅',
          constraint: '🔒',
          todo: '📝',
          other: '📌',
        };

        const newNote = `\n### ${categoryEmoji[category]} ${timestamp}\n\n${String(args.note)}\n`;

        // Append to existing content
        const header =
          '# Session Scratch Notes\n\nQuick notes captured during this session.\n';
        const content = existingContent || header;
        writeFileSync(scratchFile, content + newNote, 'utf8');

        return [
          'Note saved to scratch pad.',
          `Session: ${sessionId}`,
          `Category: ${category}`,
          '',
          'Continue with current work. Notes will be available for review later.',
        ].join('\n');
      } catch (error) {
        return [
          'Scratch save failed.',
          `Reason: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ].join('\n');
      }
    },
  });
}

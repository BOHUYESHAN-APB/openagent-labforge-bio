import { type ToolDefinition, tool } from '@opencode-ai/plugin';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  getPreferencesPath,
  PREFS_TEMPLATE,
} from '../hooks/memory';

const z = tool.schema;

/**
 * user_preferences tool — read or update long-term user preferences.
 *
 * Environment-aware: stores in .opencode/ (OpenCode) or .mimocode/ (MiMo Code).
 * Changes take effect on next LLM request (no restart needed).
 */
export function createUserPreferencesTool(
  workspaceRoot: string,
  isMimoCode: boolean,
): ToolDefinition {
  return tool({
    description: `Read or update user preferences (long-term memory for coding style, workflow habits).

Usage:
- Read: call with operation="read" to see current preferences
- Append: call with operation="append" and section/content to add a preference
- Update: call with operation="update" and section/content to replace a section

IMPORTANT:
- Only update when the user explicitly states a preference or a lesson is learned
- Do NOT overwrite the entire file — append or update specific sections
- Preferences persist across all sessions and take effect on next LLM request`,
    args: {
      operation: z
        .enum(['read', 'append', 'update'])
        .describe('Operation: read, append, or update'),
      section: z
        .string()
        .optional()
        .describe(
          'Section name (e.g., "Coding Style", "Workflow Preferences")',
        ),
      content: z
        .string()
        .optional()
        .describe('Content to append or use for update'),
    },
    async execute(args) {
      const operation = args?.operation as string;
      const section = args?.section as string | undefined;
      const content = args?.content as string | undefined;

      const filePath = getPreferencesPath(workspaceRoot, isMimoCode);

      if (operation === 'read') {
        try {
          if (existsSync(filePath)) {
            return readFileSync(filePath, 'utf-8');
          }
        } catch {
          // Fall through
        }
        return 'No preferences file found. The agent will create one when preferences are first saved.';
      }

      if (operation === 'append') {
        if (!section || !content) {
          return 'Error: append requires both section and content parameters.';
        }
        let currentContent = PREFS_TEMPLATE;
        try {
          if (existsSync(filePath)) {
            currentContent = readFileSync(filePath, 'utf-8');
          }
        } catch {
          // Use template
        }

        // Find the section and append after it
        const sectionRegex = new RegExp(
          `(## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n)([^#]*)`,
          'i',
        );
        const match = currentContent.match(sectionRegex);
        if (match) {
          const existingContent = match[2].trim();
          const newLines =
            existingContent.length > 0
              ? `${existingContent}\n- ${content}`
              : `- ${content}`;
          currentContent = currentContent.replace(
            sectionRegex,
            `## $1${match[1]}${newLines}\n`,
          );
        } else {
          currentContent += `\n## ${section}\n- ${content}\n`;
        }

        const dir = dirname(filePath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(filePath, currentContent, 'utf-8');
        return `Preference added to "${section}" section. Changes will take effect on next LLM request.`;
      }

      if (operation === 'update') {
        if (!section || !content) {
          return 'Error: update requires both section and content parameters.';
        }
        let currentContent = PREFS_TEMPLATE;
        try {
          if (existsSync(filePath)) {
            currentContent = readFileSync(filePath, 'utf-8');
          }
        } catch {
          // Use template
        }

        const sectionRegex = new RegExp(
          `(## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n)([^#]*)`,
          'i',
        );
        const match = currentContent.match(sectionRegex);
        if (!match) {
          return `Section "${section}" not found. Use append to create it.`;
        }

        const newContent = currentContent.replace(
          sectionRegex,
          `## $1${content}\n`,
        );
        const dir = dirname(filePath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(filePath, newContent, 'utf-8');
        return `Section "${section}" updated. Changes will take effect on next LLM request.`;
      }

      return 'Error: unknown operation. Use read, append, or update.';
    },
  });
}

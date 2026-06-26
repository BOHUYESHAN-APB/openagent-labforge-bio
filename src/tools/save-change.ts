import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type ToolDefinition, tool } from '@opencode-ai/plugin';

const z = tool.schema;

export function createSaveChangeTool(workspaceRoot: string): ToolDefinition {
  return tool({
    description: `Save a change proposal to .opencode/extendai-lab/changes/ directory.

Use this when brainstorming or planning a specific change. Creates a structured folder with proposal, design, and tasks.

The change folder structure:
- proposal.md — Why we're doing this, what's changing
- design.md — Technical approach
- tasks.md — Implementation checklist (- [ ] format)
- status.json — Status tracking

CRITICAL WORKFLOW:
1. FIRST: Discuss with user to understand the change
2. THEN: Present the proposal/design/tasks to user for review
3. ONLY AFTER user approves: Call this tool to save
4. Do NOT save without user confirmation`,
    args: {
      name: z
        .string()
        .describe(
          'Descriptive change name (e.g., "add-dark-mode", "fix-auth-bug"). Will be normalized to kebab-case.',
        ),
      proposal: z
        .string()
        .describe("Proposal content — why we're doing this, what's changing."),
      design: z
        .string()
        .optional()
        .describe('Design content — technical approach, architecture.'),
      tasks: z
        .string()
        .optional()
        .describe(
          'Tasks content — implementation checklist with - [ ] format.',
        ),
    },
    async execute(args) {
      const name = String(args.name)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const date = new Date().toISOString().split('T')[0];
      const folderName = `${date}-${name}`;
      const changesDir = join(
        workspaceRoot,
        '.opencode',
        'extendai-lab',
        'changes',
      );
      const changeDir = join(changesDir, folderName);

      try {
        // Create directory
        mkdirSync(changeDir, { recursive: true });

        // Write proposal.md
        writeFileSync(
          join(changeDir, 'proposal.md'),
          String(args.proposal),
          'utf8',
        );

        // Write design.md if provided
        if (args.design) {
          writeFileSync(
            join(changeDir, 'design.md'),
            String(args.design),
            'utf8',
          );
        }

        // Write tasks.md if provided
        if (args.tasks) {
          writeFileSync(
            join(changeDir, 'tasks.md'),
            String(args.tasks),
            'utf8',
          );
        }

        // Write status.json
        const status = {
          name,
          created: new Date().toISOString(),
          status: 'in_progress',
          tasks: {
            total: String(args.tasks).match(/- \[ \]/g)?.length || 0,
            completed: 0,
            failed: 0,
          },
          last_updated: new Date().toISOString(),
        };
        writeFileSync(
          join(changeDir, 'status.json'),
          JSON.stringify(status, null, 2),
          'utf8',
        );

        const relativePath = `.opencode/extendai-lab/changes/${folderName}`;

        return [
          'Change saved successfully.',
          `Path: ${relativePath}`,
          `Proposal: proposal.md`,
          args.design ? `Design: design.md` : 'Design: (not provided)',
          args.tasks
            ? `Tasks: tasks.md (${status.tasks.total} tasks)`
            : 'Tasks: (not provided)',
          'Status: status.json',
          '',
          'Next steps:',
          '1. Review the proposal and design',
          '2. Add tasks if not provided',
          '3. Execute tasks using /ol-start-work',
        ].join('\n');
      } catch (error) {
        return [
          'Change save failed.',
          `Reason: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ].join('\n');
      }
    },
  });
}

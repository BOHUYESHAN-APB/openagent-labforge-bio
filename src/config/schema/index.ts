import { z } from 'zod';
import { AgentOverridesSchema } from './agent-overrides';
import { BackgroundTaskConfigSchema } from './background-task';
import { CategoriesConfigSchema } from './categories';

export const OhMyOpenCodeConfigSchema = z
  .object({
    version: z.string().optional(),
    agents: AgentOverridesSchema,
    categories: CategoriesConfigSchema,
    background_task: BackgroundTaskConfigSchema,
    disabled_agents: z.array(z.string()).default([]),
    disabled_mcps: z.array(z.string()).default([]),
    disabled_skills: z.array(z.string()).default([]),
  })
  .strict();

export type OhMyOpenCodeConfig = z.infer<typeof OhMyOpenCodeConfigSchema>;

import { z } from 'zod';

export const GitMasterConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    autoCommit: z.boolean().default(false),
  })
  .strict();

export type GitMasterConfig = z.infer<typeof GitMasterConfigSchema>;

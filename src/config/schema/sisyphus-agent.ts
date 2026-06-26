import { z } from 'zod';

export const SisyphusAgentConfigSchema = z
  .object({
    model: z.string().optional(),
    prompt: z.string().optional(),
    disabled: z.boolean().optional(),
  })
  .strict();

export type SisyphusAgentConfig = z.infer<typeof SisyphusAgentConfigSchema>;

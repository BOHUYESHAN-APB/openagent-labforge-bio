// Stub module - TODO: implement from upstream oh-my-openagent
import { z } from 'zod';
export const BackgroundTaskConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxConcurrent: z.number().default(3),
  timeout: z.number().default(300000),
});
export type BackgroundTaskConfig = z.infer<typeof BackgroundTaskConfigSchema>;

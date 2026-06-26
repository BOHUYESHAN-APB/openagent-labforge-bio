import { z } from 'zod';

export const BrowserAutomationProviderSchema = z.enum([
  'playwright',
  'playwright-cli',
  'agent-browser',
]);

export type BrowserAutomationProvider = z.infer<
  typeof BrowserAutomationProviderSchema
>;

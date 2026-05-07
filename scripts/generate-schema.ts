#!/usr/bin/env bun

/**
 * Generates a JSON Schema from the Zod PluginConfigSchema.
 * Run as part of the build step so the schema stays in sync with the source.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  PACKAGE_NAME,
  PRODUCT_DISPLAY_NAME,
  SCHEMA_FILE_NAME,
} from '../src/config/product';
import { PluginConfigSchema } from '../src/config/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const outputPath = join(rootDir, SCHEMA_FILE_NAME);

const schema = z.toJSONSchema(PluginConfigSchema, {
  // Use 'input' so defaulted fields are optional in the schema,
  // matching how users actually write their config files
  io: 'input',
});

const jsonSchema = {
  ...schema,
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: PACKAGE_NAME,
  description: `Configuration schema for ${PRODUCT_DISPLAY_NAME} plugin for OpenCode`,
};

const json = JSON.stringify(jsonSchema, null, 2);
writeFileSync(outputPath, `${json}\n`);

console.log(`✅ Schema written to ${outputPath}`);

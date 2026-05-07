export const PRODUCT_DISPLAY_NAME = 'ExtendAI Lab' as const;
export const PACKAGE_NAME = 'extendai-lab' as const;

export const CONFIG_BASENAME = 'extendai-lab' as const;

export const PLUGIN_STATE_DIR = 'extendai-lab' as const;

export const SCHEMA_FILE_NAME = 'extendai-lab.schema.json' as const;

export const SUPPORTED_PACKAGE_NAMES = [PACKAGE_NAME] as const;

export const SUPPORTED_CONFIG_BASENAMES = [CONFIG_BASENAME] as const;

export const SUPPORTED_PLUGIN_STATE_DIRS = [PLUGIN_STATE_DIR] as const;

export function isSupportedPackageName(name: unknown): name is string {
  return (
    typeof name === 'string' && SUPPORTED_PACKAGE_NAMES.includes(name as never)
  );
}

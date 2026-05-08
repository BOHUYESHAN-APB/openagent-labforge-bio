export type {
  RuntimeAdapter,
  RuntimeAdapterContext,
  RuntimeDetectionResult,
  RuntimeValidationResult,
} from './adapter';
export {
  claudeAdapter,
  codexAdapter,
  openclaudeAdapter,
  opencodeAdapter,
} from './adapters';
export type { BackupManifest } from './backup';
export {
  applyInstallPlan,
  attachBackupEntries,
  backupFile,
  createBackupEntry,
  createBackupManifest,
  getBackupRoot,
  hashFile,
  writeBackupManifest,
} from './backup';
export type {
  CapabilityAssessment,
  CapabilityContract,
  CapabilityStatus,
} from './capabilities';
export {
  assessCapability,
  assessRuntimeCapabilities,
  CAPABILITY_CONTRACTS,
  getCapabilityContract,
  getRuntimeCapabilityMatrix,
} from './capabilities';
export type {
  ClaudeEnabledPluginsMergeResult,
  ClaudeInstalledPluginsMergeResult,
  ClaudeKnownMarketplaceMergeResult,
  ClaudeMcpMergeResult,
  ClaudeMcpServerEntry,
  CodexMarketplaceMergeResult,
  CodexTomlMergeResult,
  UnifiedMcpRegistryEntry,
} from './config-writers';
export {
  mergeClaudeEnabledPlugins,
  mergeClaudeInstalledPlugins,
  mergeClaudeKnownMarketplaces,
  mergeClaudeMcpServers,
  mergeCodexMarketplaceRegistration,
  mergeCodexMcpServers,
} from './config-writers';
export type { CapabilityDegradation, DegradationRule } from './degradation';
export {
  applyCapabilityDegradation,
  CAPABILITY_DEGRADATION_RULES,
  getDegradationRule,
  getRuntimeDegradations,
} from './degradation';
export type { RuntimeDoctorReport } from './doctor';
export {
  createRuntimeDoctorMatrix,
  createRuntimeDoctorReport,
} from './doctor';
export type { BackupEntry, InstallPlan, RenderedFile } from './install-plan';
export {
  addPlanFile,
  addPlanMessage,
  createInstallPlan,
  validateInstallPlan,
} from './install-plan';
export type { CompatInstallStateRecord } from './install-state';
export {
  getCompatInstallStatePath,
  readCompatInstallState,
  writeCompatInstallState,
} from './install-state';
export type { CapabilityRenderer, RendererContext } from './renderers';
export {
  CAPABILITY_RENDERERS,
  getCapabilityRenderer,
  renderRuntimeCapabilities,
  SHARED_PREFIX_SNAPSHOT_MARKDOWN,
} from './renderers';
export type { RollbackPlanOptions } from './rollback';
export {
  applyRollbackManifest,
  createRollbackPlan,
  readBackupManifest,
} from './rollback';
export type {
  RuntimeIsolation,
  RuntimeIsolationInput,
} from './runtime-isolation';
export {
  createRuntimeIsolation,
  normalizeRuntimeId,
} from './runtime-isolation';
export type {
  CompatSdkId,
  CompatSdkProbeResult,
  CompatSdkProvider,
} from './sdk-providers';
export {
  COMPAT_SDK_PROVIDERS,
  probeCompatSdkProvider,
  probeCompatSdkProviders,
} from './sdk-providers';
export type { CompatStoragePaths } from './storage-paths';
export { getCompatStoragePaths } from './storage-paths';
export type {
  CompatibilityCapability,
  PhaseOneRuntimeId,
  RuntimeCompatibilityProfile,
  RuntimeCompatibilityTier,
  RuntimeFamily,
  RuntimePriority,
} from './types';
export {
  getPhaseOneRuntimeProfiles,
  getRuntimeCompatibilityProfile,
  PHASE_ONE_RUNTIME_IDS,
  RUNTIME_COMPATIBILITY_PROFILES,
} from './types';

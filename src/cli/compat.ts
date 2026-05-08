import { join } from 'node:path';
import {
  applyInstallPlan,
  applyRollbackManifest,
  createRuntimeDoctorMatrix,
  getCompatInstallStatePath,
  getCompatStoragePaths,
  getRuntimeCompatibilityProfile,
  getRuntimeDegradations,
  PHASE_ONE_RUNTIME_IDS,
  probeCompatSdkProviders,
  type RuntimeAdapter,
  readCompatInstallState,
  writeCompatInstallState,
} from '../compat';
import {
  claudeAdapter,
  codexAdapter,
  openclaudeAdapter,
  opencodeAdapter,
} from '../compat/adapters';

export const COMPAT_RUNTIME_ADAPTERS = [
  opencodeAdapter,
  openclaudeAdapter,
  codexAdapter,
  claudeAdapter,
] as const satisfies readonly RuntimeAdapter[];

export type CompatRuntimeId =
  (typeof COMPAT_RUNTIME_ADAPTERS)[number]['profile']['id'];

export function getCompatRuntimeAdapter(
  runtimeId: CompatRuntimeId,
): RuntimeAdapter | undefined {
  return COMPAT_RUNTIME_ADAPTERS.find(
    (adapter) => adapter.profile.id === runtimeId,
  );
}

export function getCompatRuntimeIds(): CompatRuntimeId[] {
  return COMPAT_RUNTIME_ADAPTERS.map((adapter) => adapter.profile.id);
}

export function normalizeCompatRuntimeSelection(
  runtimeIds: readonly CompatRuntimeId[],
): CompatRuntimeId[] {
  const wanted = new Set(runtimeIds);
  return getCompatRuntimeIds().filter((runtimeId) => wanted.has(runtimeId));
}

function selectCompatRuntimeIds(
  runtimeId?: CompatRuntimeId | readonly CompatRuntimeId[],
): CompatRuntimeId[] {
  if (!runtimeId) {
    return [...PHASE_ONE_RUNTIME_IDS];
  }

  return Array.isArray(runtimeId)
    ? normalizeCompatRuntimeSelection(runtimeId)
    : [runtimeId as CompatRuntimeId];
}

function buildRuntimeSelectionLabel(
  runtimeId?: CompatRuntimeId | readonly CompatRuntimeId[],
): string {
  const runtimeIds = selectCompatRuntimeIds(runtimeId);
  if (!runtimeId) {
    return 'Runtime scope: all known compat runtimes';
  }

  return `Runtime scope: ${runtimeIds.join(', ')}`;
}

function buildRuntimePriorityNote(
  runtimeId?: CompatRuntimeId,
): string | undefined {
  if (runtimeId === 'claude') {
    return 'Selected runtime is a later closed-source Claude target. OpenCode -> OpenClaude -> Codex remains the current implementation order.';
  }

  if (!runtimeId) return undefined;
  if (
    PHASE_ONE_RUNTIME_IDS.includes(
      runtimeId as (typeof PHASE_ONE_RUNTIME_IDS)[number],
    )
  ) {
    return `${runtimeId} is part of the current open-source-first phase-1 runtime set.`;
  }

  return `${runtimeId} is available for diagnostics, but it is not part of the current phase-1 runtime set.`;
}

function buildRuntimePriorityNotes(
  runtimeId?: CompatRuntimeId | readonly CompatRuntimeId[],
): string[] {
  const runtimeIds = runtimeId ? selectCompatRuntimeIds(runtimeId) : [];
  return runtimeIds
    .map((id) => buildRuntimePriorityNote(id))
    .filter((note): note is string => Boolean(note));
}

function getCompatRuntimeCompletionState(
  runtimeId: CompatRuntimeId,
  validationOk: boolean,
): string {
  if (runtimeId === 'opencode') {
    return 'native-primary';
  }

  if (runtimeId === 'claude') {
    return 'preview-only';
  }

  return validationOk ? 'working-baseline' : 'partial-baseline';
}

function getStoredOrDerivedCompletionState(
  workspaceRoot: string,
  runtimeId: CompatRuntimeId,
  validationOk: boolean,
): string {
  const stored = readCompatInstallState(workspaceRoot, runtimeId);
  return (
    stored?.installState ??
    getCompatRuntimeCompletionState(runtimeId, validationOk)
  );
}

export async function buildCompatStatusReport(
  workspaceRoot: string,
  runtimeId?: CompatRuntimeId | readonly CompatRuntimeId[],
  options?: { runtimeRoot?: string },
): Promise<string> {
  const sdkResults = await probeCompatSdkProviders();
  const selectedRuntimeIds = selectCompatRuntimeIds(runtimeId);
  const doctorMatrix = createRuntimeDoctorMatrix(selectedRuntimeIds);
  const selectedAdapters = COMPAT_RUNTIME_ADAPTERS.filter((adapter) =>
    selectedRuntimeIds.includes(adapter.profile.id),
  );
  const detectionLines = selectedAdapters.map((adapter) => {
    const detected = adapter.detect({
      workspaceRoot,
      dryRun: true,
      runtimeRoot: options?.runtimeRoot,
    });
    const state = detected.available ? 'available' : 'missing';
    const primaryPath = detected.configPaths[0] ?? '(none)';
    return `- ${adapter.profile.displayName}: ${state} — ${primaryPath}`;
  });

  const runtimeLines = doctorMatrix.map((report) => {
    return `- ${report.displayName}: available=${report.capabilitySummary.available}, degraded=${report.capabilitySummary.degraded}, unavailable=${report.capabilitySummary.unavailable}`;
  });

  const degradationLines = selectedRuntimeIds.flatMap((id) => {
    const runtime = getRuntimeCompatibilityProfile(id);
    if (!runtime) return [];
    return getRuntimeDegradations(runtime).map(
      (degradation) =>
        `- ${runtime.displayName}: ${degradation.capability} -> ${degradation.degradeTo}: ${degradation.userImpact}`,
    );
  });

  const sdkLines = sdkResults.map((result) => {
    const state = result.usable
      ? 'usable'
      : result.installed
        ? 'installed-but-incomplete'
        : 'missing';
    return `- ${result.displayName}: ${state} (${result.packageName})`;
  });

  const priorityNotes = buildRuntimePriorityNotes(runtimeId);
  const storageLines = selectedRuntimeIds.flatMap((id) => {
    const paths = getCompatStoragePaths(workspaceRoot, id);
    return [
      `- ${id}: project=${paths.runtimeStateDir}`,
      `  global=${paths.globalRuntimeDir}`,
      `  logs=${paths.runtimeLogDir}`,
      `  memory=${paths.runtimeMemoryDir}`,
    ];
  });
  const completionLines = selectedRuntimeIds.flatMap((id) => {
    const runtime = getRuntimeCompatibilityProfile(id);
    const adapter = getCompatRuntimeAdapter(id);
    if (!runtime || !adapter) return [];

    const validation = adapter.validate({
      workspaceRoot,
      dryRun: true,
      runtimeRoot: options?.runtimeRoot,
    });
    const sdkStatus = runtime.sdkPackage
      ? sdkResults.find((result) => result.packageName === runtime.sdkPackage)
      : undefined;
    const sdkLine = runtime.sdkPackage
      ? `sdk=${sdkStatus?.usable ? 'usable' : sdkStatus?.installed ? 'installed-but-incomplete' : 'missing'} (${runtime.sdkPackage})`
      : 'sdk=native-plugin-path';
    const statePath = getCompatInstallStatePath(workspaceRoot, id);

    return [
      `- ${runtime.displayName}: ${getStoredOrDerivedCompletionState(workspaceRoot, id, validation.ok)}; ${sdkLine}`,
      `  state=${statePath}`,
    ];
  });

  return [
    'ExtendAI Lab Compatibility Status',
    '',
    buildRuntimeSelectionLabel(runtimeId),
    '',
    'Phase-1 runtimes (open-source-first):',
    ...runtimeLines,
    '',
    'Detected runtime config roots:',
    ...detectionLines,
    '',
    'Optional compat SDK providers:',
    ...sdkLines,
    '',
    'Unified storage baseline:',
    ...storageLines,
    '',
    'Current install/apply completion state:',
    ...completionLines,
    ...(degradationLines.length
      ? ['', 'Runtime degradation guidance:', ...degradationLines]
      : []),
    '',
    'Current product order: OpenCode -> OpenClaude -> Codex -> closed-source Claude later.',
    'Current default subagent mode: ultra-minimal.',
    ...(priorityNotes.length ? ['', ...priorityNotes] : []),
  ].join('\n');
}

export function buildCompatDoctorReport(
  workspaceRoot: string,
  runtimeId?: CompatRuntimeId | readonly CompatRuntimeId[],
  options?: { runtimeRoot?: string },
): string {
  const selectedRuntimeIds = selectCompatRuntimeIds(runtimeId);
  const doctorMatrix = createRuntimeDoctorMatrix(selectedRuntimeIds);
  const selectedAdapters = COMPAT_RUNTIME_ADAPTERS.filter((adapter) =>
    selectedRuntimeIds.includes(adapter.profile.id),
  );
  const detectionLines = selectedAdapters.map((adapter) => {
    const detected = adapter.detect({
      workspaceRoot,
      dryRun: true,
      runtimeRoot: options?.runtimeRoot,
    });
    const warnings = detected.warnings.length
      ? ` | warnings: ${detected.warnings.join('; ')}`
      : '';
    return `- ${adapter.profile.id}: available=${detected.available} | paths=${detected.configPaths.join(', ')}${warnings}`;
  });

  const matrixLines = doctorMatrix.map((report) => {
    return `- ${report.runtimeId}: available=${report.capabilitySummary.available}, degraded=${report.capabilitySummary.degraded}, unavailable=${report.capabilitySummary.unavailable}`;
  });

  const degradationLines = selectedRuntimeIds.flatMap((id) => {
    const runtime = getRuntimeCompatibilityProfile(id);
    if (!runtime) return [];
    return getRuntimeDegradations(runtime).map(
      (degradation) =>
        `- ${runtime.displayName}: ${degradation.capability} -> ${degradation.degradeTo}: ${degradation.reason}`,
    );
  });

  const priorityNotes = buildRuntimePriorityNotes(runtimeId);
  const storageLines = selectedRuntimeIds.flatMap((id) => {
    const paths = getCompatStoragePaths(workspaceRoot, id);
    return [
      `- ${id}: project=${paths.runtimeStateDir}`,
      `  global=${paths.globalRuntimeDir}`,
      `  logs=${paths.runtimeLogDir}`,
      `  memory=${paths.runtimeMemoryDir}`,
    ];
  });

  return [
    'ExtendAI Lab Compatibility Doctor',
    '',
    buildRuntimeSelectionLabel(runtimeId),
    '',
    'Runtime detection:',
    ...detectionLines,
    '',
    'Capability matrix:',
    ...matrixLines,
    '',
    'Unified storage baseline:',
    ...storageLines,
    ...(degradationLines.length
      ? ['', 'Degradation guidance:', ...degradationLines]
      : []),
    ...(priorityNotes.length ? ['', ...priorityNotes] : []),
  ].join('\n');
}

export function buildCompatInstallPreview(
  workspaceRoot: string,
  runtimeId: CompatRuntimeId,
  options?: { runtimeRoot?: string },
): string {
  const adapter = getCompatRuntimeAdapter(runtimeId);
  if (!adapter) {
    throw new Error(`Unknown compat runtime: ${runtimeId}`);
  }

  const plan = adapter.planInstall({
    workspaceRoot,
    dryRun: true,
    runtimeRoot: options?.runtimeRoot,
  });
  const validation = adapter.validate({
    workspaceRoot,
    dryRun: true,
    runtimeRoot: options?.runtimeRoot,
  });
  const detection = adapter.detect({
    workspaceRoot,
    dryRun: true,
    runtimeRoot: options?.runtimeRoot,
  });
  const priorityNote = buildRuntimePriorityNote(runtimeId);

  return [
    `ExtendAI Lab Install Preview: ${adapter.profile.displayName}`,
    '',
    `Runtime scope: ${runtimeId}`,
    `Detected: ${detection.available ? 'yes' : 'no'}`,
    `Config roots: ${detection.configPaths.join(', ') || '(none)'}`,
    `Planned files: ${plan.files.length}`,
    `Reload required: ${plan.reloadRequired ? 'yes' : 'no'}`,
    `Rollback manifest: ${plan.rollbackManifestPath ?? '(not assigned yet)'}`,
    '',
    'Plan messages:',
    ...plan.messages.map(
      (message) => `- [${message.severity}] ${message.message}`,
    ),
    '',
    'Validation:',
    ...validation.findings.map((finding) => `- ${finding}`),
    '',
    'This path is still dry-run/status-first. Real writes should follow an explicit install-plan/apply step with backup + rollback.',
    ...(priorityNote ? ['', priorityNote] : []),
  ].join('\n');
}

export function applyCompatRuntimeInstall(
  workspaceRoot: string,
  runtimeId: CompatRuntimeId,
  options?: {
    packageVersion?: string;
    runtimeRoot?: string;
    timestamp?: string;
  },
): string {
  const adapter = getCompatRuntimeAdapter(runtimeId);
  if (!adapter) {
    throw new Error(`Unknown compat runtime: ${runtimeId}`);
  }

  const plan = adapter.planInstall({
    workspaceRoot,
    dryRun: false,
    runtimeRoot: options?.runtimeRoot,
  });
  const result = applyInstallPlan(plan, {
    workspaceRoot,
    packageVersion: options?.packageVersion,
    timestamp: options?.timestamp,
  });
  const validation = adapter.validate({
    workspaceRoot,
    dryRun: false,
    runtimeRoot: options?.runtimeRoot,
  });
  const installState = getCompatRuntimeCompletionState(
    runtimeId,
    validation.ok,
  ) as
    | 'native-primary'
    | 'working-baseline'
    | 'partial-baseline'
    | 'preview-only';
  const statePath = writeCompatInstallState({
    runtimeId,
    updatedAt: new Date().toISOString(),
    workspaceRoot,
    installState,
    runtimeRoot: options?.runtimeRoot,
    packageVersion: options?.packageVersion,
    rollbackManifestPath: result.manifestPath,
    backupRoot: result.backupRoot,
    appliedCount: result.appliedCount,
    skippedCount: result.skippedCount,
    validationFindings: validation.findings,
  });

  return [
    `ExtendAI Lab Install Apply: ${adapter.profile.displayName}`,
    '',
    `Runtime scope: ${runtimeId}`,
    `Applied files: ${result.appliedCount}`,
    `Skipped files: ${result.skippedCount}`,
    `Backup root: ${result.backupRoot}`,
    `Rollback manifest: ${result.manifestPath}`,
    `Install state: ${statePath}`,
    '',
    'Validation:',
    ...validation.findings.map((finding) => `- ${finding}`),
  ].join('\n');
}

export function applyCompatRuntimeInstalls(
  workspaceRoot: string,
  runtimeIds: readonly CompatRuntimeId[],
  options?: {
    packageVersion?: string;
    runtimeRoot?: string;
    timestamp?: string;
  },
): string {
  const orderedRuntimeIds = normalizeCompatRuntimeSelection(runtimeIds);
  const sections = orderedRuntimeIds.map((runtimeId) => {
    if (runtimeId === 'claude') {
      return [
        'ExtendAI Lab Install Apply: Claude Code',
        '',
        'Runtime scope: claude',
        'Closed-source Claude remains preview-only in the current implementation order.',
      ].join('\n');
    }

    const runtimeRoot = options?.runtimeRoot
      ? join(options.runtimeRoot, runtimeId)
      : undefined;

    return applyCompatRuntimeInstall(workspaceRoot, runtimeId, {
      ...options,
      runtimeRoot,
    });
  });

  return [
    'ExtendAI Lab Multi-Runtime Install Apply',
    '',
    `Runtime scope: ${orderedRuntimeIds.join(', ') || '(none)'}`,
    '',
    ...sections.flatMap((section, index) =>
      index === 0 ? [section] : ['', '─'.repeat(72), '', section],
    ),
  ].join('\n');
}

export function buildCompatRollbackPreview(
  workspaceRoot: string,
  runtimeId: CompatRuntimeId,
  manifestPath?: string,
): string {
  const adapter = getCompatRuntimeAdapter(runtimeId);
  if (!adapter) {
    throw new Error(`Unknown compat runtime: ${runtimeId}`);
  }

  const plan = adapter.rollback({
    workspaceRoot,
    dryRun: true,
    manifestPath,
  });
  const priorityNote = buildRuntimePriorityNote(runtimeId);

  return [
    `ExtendAI Lab Rollback Preview: ${adapter.profile.displayName}`,
    '',
    `Runtime scope: ${runtimeId}`,
    `Manifest path: ${manifestPath ?? '(not provided)'}`,
    `Planned restore targets: ${plan.files.length}`,
    '',
    'Rollback messages:',
    ...plan.messages.map(
      (message) => `- [${message.severity}] ${message.message}`,
    ),
    '',
    'Rollback preview is dry-run only. Use backup manifests generated by install-plan/apply before wiring a real restore path.',
    ...(priorityNote ? ['', priorityNote] : []),
  ].join('\n');
}

export function applyCompatRuntimeRollback(
  runtimeId: CompatRuntimeId,
  manifestPath: string,
  workspaceRoot: string = process.cwd(),
): string {
  const adapter = getCompatRuntimeAdapter(runtimeId);
  if (!adapter) {
    throw new Error(`Unknown compat runtime: ${runtimeId}`);
  }

  const result = applyRollbackManifest(manifestPath, runtimeId);
  const priorityNote = buildRuntimePriorityNote(runtimeId);

  if (result.runtimeMismatch) {
    return [
      `ExtendAI Lab Rollback Apply: ${adapter.profile.displayName}`,
      '',
      `Runtime scope: ${runtimeId}`,
      `Manifest path: ${manifestPath}`,
      `Runtime mismatch: manifest was created for ${result.runtimeMismatch.manifestRuntimeId}, not ${result.runtimeMismatch.expectedRuntimeId}.`,
      'Refusing rollback to avoid restoring the wrong runtime into this target.',
      ...(priorityNote ? ['', priorityNote] : []),
    ].join('\n');
  }

  const statePath = writeCompatInstallState({
    runtimeId,
    updatedAt: new Date().toISOString(),
    workspaceRoot,
    installState:
      runtimeId === 'opencode' ? 'native-primary' : 'partial-baseline',
    rollbackManifestPath: manifestPath,
    restoredCount: result.restoredCount,
    removedCount: result.removedCount,
    validationFindings: ['Rollback was applied from the recorded manifest.'],
  });

  return [
    `ExtendAI Lab Rollback Apply: ${adapter.profile.displayName}`,
    '',
    `Runtime scope: ${runtimeId}`,
    `Manifest path: ${manifestPath}`,
    `Restored files: ${result.restoredCount}`,
    `Removed files: ${result.removedCount}`,
    `Missing backup entries: ${result.missingBackupEntries.length}`,
    `Install state: ${statePath}`,
    ...(result.missingBackupEntries.length
      ? ['', ...result.missingBackupEntries.map((entry) => `- ${entry}`)]
      : []),
    ...(priorityNote ? ['', priorityNote] : []),
  ].join('\n');
}

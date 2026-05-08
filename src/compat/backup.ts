import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { BackupEntry, InstallPlan, RenderedFile } from './install-plan';
import { getCompatStoragePaths } from './storage-paths';

export interface BackupManifest {
  createdAt: string;
  runtimeId: string;
  packageVersion?: string;
  entries: BackupEntry[];
}

export interface ApplyInstallPlanResult {
  manifestPath: string;
  appliedCount: number;
  skippedCount: number;
  backupRoot: string;
}

export function getBackupRoot(
  workspaceRoot: string,
  runtimeId: string,
  timestamp: string,
): string {
  const safeTimestamp = timestamp.replaceAll(':', '-');
  return join(
    getCompatStoragePaths(workspaceRoot, runtimeId).runtimeInstallDir,
    'backups',
    safeTimestamp,
  );
}

export function createBackupManifest(plan: InstallPlan): BackupManifest {
  return {
    createdAt: new Date().toISOString(),
    runtimeId: plan.runtimeId,
    entries: [...plan.backups],
  };
}

export function hashFile(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function writeBackupManifest(
  path: string,
  manifest: BackupManifest,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export function createBackupEntry(
  backupRoot: string,
  file: RenderedFile,
): BackupEntry {
  const existedBefore = existsSync(file.path);
  const safeRelativePath =
    file.relativePath || relative(process.cwd(), file.path);
  const backupPath = existedBefore
    ? join(backupRoot, 'files', safeRelativePath)
    : undefined;
  return {
    sourcePath: file.path,
    relativePath: safeRelativePath,
    backupPath,
    existedBefore,
    action: file.action,
    hash: existedBefore ? hashFile(file.path) : undefined,
  };
}

export function backupFile(entry: BackupEntry): void {
  if (
    !entry.existedBefore ||
    !entry.backupPath ||
    !existsSync(entry.sourcePath)
  ) {
    return;
  }
  mkdirSync(dirname(entry.backupPath), { recursive: true });
  copyFileSync(entry.sourcePath, entry.backupPath);
}

export function attachBackupEntries(
  plan: InstallPlan,
  backupRoot: string,
): InstallPlan {
  for (const file of plan.files) {
    const entry = createBackupEntry(backupRoot, file);
    plan.backups.push(entry);
  }
  return plan;
}

export function applyInstallPlan(
  plan: InstallPlan,
  options: {
    workspaceRoot: string;
    timestamp?: string;
    packageVersion?: string;
  },
): ApplyInstallPlanResult {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const backupRoot = getBackupRoot(
    options.workspaceRoot,
    plan.runtimeId,
    timestamp,
  );
  attachBackupEntries(plan, backupRoot);

  for (const entry of plan.backups) {
    backupFile(entry);
  }

  let appliedCount = 0;
  let skippedCount = 0;

  for (const file of plan.files) {
    if (file.action === 'skip') {
      skippedCount += 1;
      continue;
    }

    if (file.action === 'remove') {
      if (existsSync(file.path)) {
        rmSync(file.path, { force: true });
      }
      appliedCount += 1;
      continue;
    }

    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content, 'utf8');
    appliedCount += 1;
  }

  const manifest = createBackupManifest(plan);
  if (options.packageVersion) {
    manifest.packageVersion = options.packageVersion;
  }
  const manifestPath = join(backupRoot, 'manifest.json');
  writeBackupManifest(manifestPath, manifest);

  plan.rollbackManifestPath = manifestPath;

  return {
    manifestPath,
    appliedCount,
    skippedCount,
    backupRoot,
  };
}

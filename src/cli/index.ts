#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { PHASE_ONE_RUNTIME_IDS } from '../compat/types';
import { PACKAGE_NAME, PRODUCT_DISPLAY_NAME } from '../config/product';
import {
  applyCompatRuntimeInstall,
  applyCompatRuntimeInstalls,
  applyCompatRuntimeRollback,
  buildCompatDoctorReport,
  buildCompatInstallPreview,
  buildCompatRollbackPreview,
  buildCompatStatusReport,
  type CompatRuntimeId,
  getCompatRuntimeIds,
} from './compat';
import { install } from './install';
import { getGeneratedPresetNames, isGeneratedPresetName } from './providers';
import type { BooleanArg, InstallArgs } from './types';
import { runInteractiveCli } from './ui';

function parseArgs(args: string[]): InstallArgs {
  const result: InstallArgs = {
    tui: true,
    skills: 'yes',
  };

  for (const arg of args) {
    if (arg === 'openclaude') {
      result.target = 'openclaude';
    } else if (arg === 'codex') {
      result.target = 'codex';
    } else if (arg === 'claude-code' || arg === 'claude') {
      result.target = 'claude-code';
    } else if (arg === '--no-tui') {
      result.tui = false;
    } else if (arg.startsWith('--skills=')) {
      result.skills = arg.split('=')[1] as BooleanArg;
    } else if (arg.startsWith('--preset=')) {
      const preset = arg.split('=')[1];
      if (!isGeneratedPresetName(preset)) {
        console.error(
          `Unsupported preset: ${preset}. Available presets: ${getGeneratedPresetNames().join(', ')}`,
        );
        process.exit(1);
      }
      result.preset = preset;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--reset') {
      result.reset = true;
    } else if (arg === '--force') {
      result.force = true;
    } else if (arg.startsWith('--target-root=')) {
      result.targetRoot = arg.split('=')[1];
    } else if (arg.startsWith('--runtime-root=')) {
      result.runtimeRoot = arg.split('=')[1];
    } else if (arg.startsWith('--manifest=')) {
      result.manifestPath = arg.split('=')[1];
    } else if (arg.startsWith('--runtime=')) {
      const parsedRuntimes = arg
        .split('=')[1]
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .flatMap((entry) => {
          if (
            entry === 'opencode' ||
            entry === 'openclaude' ||
            entry === 'codex' ||
            entry === 'claude-code' ||
            entry === 'claude'
          ) {
            return [entry === 'claude' ? 'claude-code' : entry] as const;
          }
          return [];
        });
      if (parsedRuntimes.length === 1) {
        result.runtime = parsedRuntimes[0];
      }
      result.runtimes = [...(result.runtimes ?? []), ...parsedRuntimes];
    } else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
${PRODUCT_DISPLAY_NAME} installer

Usage: bunx ${PACKAGE_NAME} install [OPTIONS]
       bunx ${PACKAGE_NAME} doctor
       bunx ${PACKAGE_NAME} status

Options:
  --skills=yes|no        Install recommended and bundled skills (default: yes)
  --preset=<name>        Active generated config preset (default: openai)
  --no-tui               Non-interactive mode
  --dry-run              Simulate install without writing files
  --reset                Force overwrite of existing configuration
  --force                Force replacement/removal of managed adapter files
  -h, --help             Show this help message

Available presets: ${getGeneratedPresetNames().join(', ')}

The installer generates OpenAI and OpenCode Go presets by default.
OpenAI is active unless --preset selects another generated preset.
For the full config reference, see docs/configuration.md.

Examples:
  bunx ${PACKAGE_NAME} install
  bunx ${PACKAGE_NAME} doctor
  bunx ${PACKAGE_NAME} status
  bunx ${PACKAGE_NAME} install --no-tui --skills=yes
  bunx ${PACKAGE_NAME} install --preset=opencode-go
  bunx ${PACKAGE_NAME} install --reset
`);
}

async function readCurrentPackageVersion(): Promise<string> {
  try {
    const raw = await readFile(
      new URL('../../package.json', import.meta.url),
      'utf8',
    );
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version || '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
}

function printDeepSeekActionSummary(
  _action: 'install' | 'uninstall',
  _result: unknown,
): void {
  // DeepSeek-TUI adapter removed — this function is a stub for compatibility
  console.log('DeepSeek-TUI adapter is no longer supported.');
}

function isCompatRuntimeTarget(
  target: InstallArgs['target'],
): target is Extract<InstallArgs['target'], CompatRuntimeId> {
  return (
    target === 'opencode' ||
    target === 'openclaude' ||
    target === 'codex' ||
    target === 'claude-code'
  );
}

function resolveCompatRuntimeSelection(
  args: InstallArgs,
): CompatRuntimeId | undefined {
  const runtime = args.runtimes?.[0] ?? args.runtime;
  const target = isCompatRuntimeTarget(args.target) ? args.target : undefined;

  if (!runtime) return target;
  if (!getCompatRuntimeIds().includes(runtime)) {
    console.error(
      `Unsupported compat runtime: ${runtime}. Available runtimes: ${getCompatRuntimeIds().join(', ')}`,
    );
    process.exit(1);
  }

  if (target && target !== runtime) {
    console.error(
      `Conflicting runtime selection: target=${target} but --runtime=${runtime}. Use only one runtime selector or keep them identical.`,
    );
    process.exit(1);
  }

  return runtime;
}

function resolveCompatRuntimeSelections(args: InstallArgs): CompatRuntimeId[] {
  const target = isCompatRuntimeTarget(args.target) ? args.target : undefined;
  const rawRuntimes = args.runtimes?.length
    ? args.runtimes
    : args.runtime
      ? [args.runtime]
      : [];
  const runtimes = [...new Set(rawRuntimes)] as CompatRuntimeId[];

  for (const selectedRuntime of runtimes) {
    if (!getCompatRuntimeIds().includes(selectedRuntime)) {
      console.error(
        `Unsupported compat runtime: ${selectedRuntime}. Available runtimes: ${getCompatRuntimeIds().join(', ')}`,
      );
      process.exit(1);
    }
  }

  if (target && runtimes.length > 0 && !runtimes.includes(target)) {
    console.error(
      `Conflicting runtime selection: target=${target} but --runtime=${runtimes.join(',')}. Use only one runtime selector or keep them identical.`,
    );
    process.exit(1);
  }

  const merged = target ? [target, ...runtimes] : runtimes;
  return getCompatRuntimeIds().filter((runtimeId) =>
    merged.includes(runtimeId),
  );
}

async function runCli(args: string[]): Promise<number> {
  if (args.length === 0) {
    const installArgs = parseArgs([]);
    const exitCode = await install({
      ...installArgs,
      target: 'opencode',
    });
    return exitCode;
  }

  if (args[0] === 'install') {
    const hasSubcommand = args[0] === 'install';
    const installArgs = parseArgs(args.slice(hasSubcommand ? 1 : 0));
    const selectedRuntimes = resolveCompatRuntimeSelections(installArgs);
    const selectedRuntime = resolveCompatRuntimeSelection(installArgs);
    let installTarget: NonNullable<InstallArgs['target']> = 'opencode';
    if (installArgs.target) {
      installTarget = installArgs.target;
    } else if (
      selectedRuntime === 'opencode' ||
      selectedRuntime === 'openclaude' ||
      selectedRuntime === 'codex' ||
      selectedRuntime === 'claude-code'
    ) {
      installTarget = selectedRuntime;
    }

    if (selectedRuntimes.length > 1) {
      if (selectedRuntimes.includes('opencode')) {
        console.error(
          'Multi-runtime batch install currently supports compat runtimes only. Run OpenCode native install separately, then use --runtime=openclaude,codex for compat runtimes.',
        );
        return 1;
      }

      if (!installArgs.dryRun) {
        const packageVersion = await readCurrentPackageVersion();
        console.log(
          applyCompatRuntimeInstalls(process.cwd(), selectedRuntimes, {
            packageVersion,
            runtimeRoot: installArgs.runtimeRoot,
          }),
        );
        return 0;
      }

      console.log(
        selectedRuntimes
          .map((runtimeId) =>
            buildCompatInstallPreview(process.cwd(), runtimeId, {
              runtimeRoot: installArgs.runtimeRoot,
            }),
          )
          .join(`\n\n${'─'.repeat(72)}\n\n`),
      );
      console.log();
      console.log(
        `Compat installer for ${selectedRuntimes.join(', ')} is in multi-runtime dry-run mode. Omit --dry-run to apply supported compat runtimes in order.`,
      );
      return 0;
    }

    if (selectedRuntime && selectedRuntime !== 'opencode') {
      if (!installArgs.dryRun && selectedRuntime !== 'claude-code') {
        const packageVersion = await readCurrentPackageVersion();
        console.log(
          applyCompatRuntimeInstall(process.cwd(), selectedRuntime, {
            packageVersion,
            runtimeRoot: installArgs.runtimeRoot,
          }),
        );
        return 0;
      }

      console.log(
        buildCompatInstallPreview(process.cwd(), selectedRuntime, {
          runtimeRoot: installArgs.runtimeRoot,
        }),
      );
      console.log();
      console.log(
        `Compat installer for ${selectedRuntime} is still dry-run/status-first. Use \`bunx ${PACKAGE_NAME} doctor --runtime=${selectedRuntime}\` and explicit install-plan/apply flows before wiring real writes.`,
      );
      return 0;
    }

    if (installTarget === 'dstui') {
      console.error('DeepSeek-TUI adapter is no longer supported.');
      return 1;
    }

    return install({
      ...installArgs,
      target: installTarget,
    });
  } else if (args[0] === 'doctor') {
    const doctorArgs = parseArgs(args.slice(1));
    const selectedRuntime = resolveCompatRuntimeSelection(doctorArgs);
    console.log(
      buildCompatDoctorReport(process.cwd(), selectedRuntime, {
        runtimeRoot: doctorArgs.runtimeRoot,
      }),
    );
    return 0;
  } else if (args[0] === 'status') {
    const statusArgs = parseArgs(args.slice(1));
    const selectedRuntime = resolveCompatRuntimeSelection(statusArgs);
    console.log(
      await buildCompatStatusReport(process.cwd(), selectedRuntime, {
        runtimeRoot: statusArgs.runtimeRoot,
      }),
    );
    return 0;
  } else if (args[0] === 'rollback') {
    const rollbackArgs = parseArgs(args.slice(1));
    const selectedRuntime = resolveCompatRuntimeSelection(rollbackArgs);
    if (!selectedRuntime) {
      console.error(
        `Rollback preview requires --runtime=<id>. Available runtimes: ${getCompatRuntimeIds().join(', ')}`,
      );
      return 1;
    }

    if (rollbackArgs.manifestPath && !rollbackArgs.dryRun) {
      console.log(
        applyCompatRuntimeRollback(
          selectedRuntime,
          rollbackArgs.manifestPath,
          process.cwd(),
        ),
      );
      return 0;
    }

    console.log(
      buildCompatRollbackPreview(
        process.cwd(),
        selectedRuntime,
        rollbackArgs.manifestPath,
      ),
    );
    return 0;
  } else if (args[0] === 'uninstall') {
    const uninstallArgs = parseArgs(args.slice(1));

    if (uninstallArgs.target !== 'dstui') {
      console.error('DeepSeek-TUI adapter is no longer supported.');
      return 1;
    }

    console.error('Only `uninstall dstui` was supported, and it has been removed.');
    return 1;
  } else if (args[0] === '-h' || args[0] === '--help') {
    printHelp();
    return 0;
  } else {
    console.error(`Unknown command: ${args[0]}`);
    console.error('Run with --help for usage information');
    return 1;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 && process.stdin.isTTY && process.stdout.isTTY) {
    const version = await readCurrentPackageVersion();
    const interactiveArgs = await runInteractiveCli({
      productName: PRODUCT_DISPLAY_NAME,
      version,
    });
    if (!interactiveArgs) {
      process.exit(0);
    }
    process.exit(await runCli(interactiveArgs));
  }

  process.exit(await runCli(args));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

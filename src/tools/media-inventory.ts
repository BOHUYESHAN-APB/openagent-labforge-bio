import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { PluginInput, ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';

const z = tool.schema;

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
};

const PDF_MIME = 'application/pdf';
const DEFAULT_MAX_FILES = 50;
const MAX_SCAN_FILES = 500;
const MAX_ENTRIES_SCANNED = 5_000;
const MAX_DIRS_SCANNED = 500;
const SKIPPED_DIRECTORY_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
]);

interface MediaFile {
  filePath: string;
  relativePath: string;
  mime: string;
  size: number;
  modifiedAt: Date;
}

function resolveScanRoot(workspaceRoot: string, inputPath: string): string {
  const scanPath = inputPath.trim() || '.';
  const resolved = path.isAbsolute(scanPath)
    ? scanPath
    : path.resolve(workspaceRoot, scanPath);

  return process.platform === 'win32' ? path.normalize(resolved) : resolved;
}

function mimeForPath(filePath: string, includePdfs: boolean): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (includePdfs && ext === '.pdf') return PDF_MIME;
  return IMAGE_MIME_BY_EXT[ext] ?? null;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  return `${(kib / 1024).toFixed(1)} MiB`;
}

function collectMediaFiles(args: {
  root: string;
  workspaceRoot: string;
  recursive: boolean;
  includePdfs: boolean;
  maxFiles: number;
  abort: AbortSignal;
}): {
  files: MediaFile[];
  truncated: boolean;
  scanLimitReached: boolean;
  aborted: boolean;
  scannedEntries: number;
  skippedDirs: number;
  unreadableDirs: number;
} {
  const files: MediaFile[] = [];
  const dirs = [args.root];
  let truncated = false;
  let scanLimitReached = false;
  let aborted = false;
  let scannedEntries = 0;
  let scannedDirs = 0;
  let skippedDirs = 0;
  let unreadableDirs = 0;

  while (dirs.length > 0) {
    if (args.abort.aborted) {
      aborted = true;
      break;
    }

    if (scannedDirs >= MAX_DIRS_SCANNED) {
      scanLimitReached = true;
      break;
    }

    const dir = dirs.shift();
    if (!dir) continue;
    scannedDirs += 1;

    let entries: Array<{
      name: string;
      isDirectory(): boolean;
      isFile(): boolean;
    }>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      unreadableDirs += 1;
      continue;
    }

    for (const entry of entries) {
      if (args.abort.aborted) {
        aborted = true;
        dirs.length = 0;
        break;
      }

      scannedEntries += 1;
      if (scannedEntries > MAX_ENTRIES_SCANNED) {
        scanLimitReached = true;
        dirs.length = 0;
        break;
      }

      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (args.recursive) {
          if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
            skippedDirs += 1;
          } else {
            dirs.push(filePath);
          }
        }
        continue;
      }
      if (!entry.isFile()) continue;

      const mime = mimeForPath(filePath, args.includePdfs);
      if (!mime) continue;

      try {
        const stat = statSync(filePath);
        files.push({
          filePath,
          relativePath:
            path.relative(args.workspaceRoot, filePath) || entry.name,
          mime,
          size: stat.size,
          modifiedAt: stat.mtime,
        });
      } catch {
        continue;
      }

      if (files.length >= args.maxFiles) {
        truncated = true;
        dirs.length = 0;
        break;
      }
    }
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return {
    files,
    truncated,
    scanLimitReached,
    aborted,
    scannedEntries,
    skippedDirs,
    unreadableDirs,
  };
}

function renderInventory(args: {
  root: string;
  recursive: boolean;
  files: MediaFile[];
  truncated: boolean;
  scanLimitReached?: boolean;
  aborted?: boolean;
  scannedEntries?: number;
  skippedDirs?: number;
  unreadableDirs?: number;
}): string {
  if (args.files.length === 0) {
    return [
      `No image/PDF files found in: ${args.root}`,
      `Recursive scan: ${args.recursive ? 'yes' : 'no'}`,
      args.scanLimitReached
        ? `Scan limit reached after ${args.scannedEntries ?? 0} filesystem entries; results may be incomplete.`
        : undefined,
      args.aborted
        ? 'Scan stopped because the request was aborted.'
        : undefined,
      args.skippedDirs
        ? `Skipped noisy directories: ${args.skippedDirs}`
        : undefined,
      args.unreadableDirs
        ? `Unreadable directories skipped: ${args.unreadableDirs}`
        : undefined,
      '',
      'Supported image extensions: png, jpg, jpeg, gif, bmp, webp, tif, tiff, heic. PDFs are included by default.',
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');
  }

  const lines = args.files.map((file, index) =>
    [
      `${index + 1}. ${file.filePath}`,
      `   relative: ${file.relativePath}`,
      `   type: ${file.mime}`,
      `   size: ${humanSize(file.size)}`,
      `   modified: ${file.modifiedAt.toISOString()}`,
    ].join('\n'),
  );

  return [
    `Found ${args.files.length} image/PDF file(s) in: ${args.root}`,
    `Recursive scan: ${args.recursive ? 'yes' : 'no'}`,
    args.truncated
      ? `Result truncated at ${args.files.length} file(s). Narrow the path or raise max_files if needed.`
      : undefined,
    args.scanLimitReached
      ? `Scan limit reached after ${args.scannedEntries ?? 0} filesystem entries; results may be incomplete.`
      : undefined,
    args.aborted ? 'Scan stopped because the request was aborted.' : undefined,
    args.skippedDirs
      ? `Skipped noisy directories: ${args.skippedDirs}`
      : undefined,
    args.unreadableDirs
      ? `Unreadable directories skipped: ${args.unreadableDirs}`
      : undefined,
    '',
    ...lines,
    '',
    'Next steps:',
    '- For one or a few files: call read with the absolute filePath. OpenCode will attach supported images/PDFs to the vision-capable model.',
    '- For visual QA or batch interpretation: delegate to @observer with this inventory and ask it to read the listed file paths.',
    '- For generated plots/screenshots: ask @observer to check blank images, rendering failures, labels, legends, contrast, color palettes, and whether the visual supports the intended conclusion.',
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

export function createMediaInventoryTool(
  pluginCtx: PluginInput,
): ToolDefinition {
  return tool({
    description: `Discover image/PDF files in a directory and return absolute paths for visual analysis.

Use this before reading or delegating generated plots, screenshots, UI captures, diagrams, PDFs, or folders of bioinformatics figures. The native read tool can then load each returned file path as a multimodal attachment for a vision-capable model.`,
    args: {
      path: z
        .string()
        .describe(
          'Directory or file path to scan. Relative paths resolve from the current session directory.',
        ),
      recursive: z
        .boolean()
        .optional()
        .describe('Whether to scan subdirectories. Defaults to false.'),
      max_files: z
        .number()
        .optional()
        .describe(
          `Maximum number of media files to return. Defaults to ${DEFAULT_MAX_FILES}; capped at ${MAX_SCAN_FILES}.`,
        ),
      include_pdfs: z
        .boolean()
        .optional()
        .describe('Include PDF files in addition to images. Defaults to true.'),
    },
    async execute(args, toolContext) {
      const workspaceRoot = toolContext.directory || pluginCtx.directory;
      const relativeRoot = toolContext.worktree || workspaceRoot;
      const root = resolveScanRoot(workspaceRoot, String(args.path));
      const recursive = args.recursive === true;
      const includePdfs = args.include_pdfs !== false;
      const maxFiles = Math.max(
        1,
        Math.min(
          MAX_SCAN_FILES,
          Number.isFinite(args.max_files) && args.max_files
            ? Math.floor(args.max_files)
            : DEFAULT_MAX_FILES,
        ),
      );

      await toolContext.ask({
        permission: 'read',
        patterns: [root],
        always: [root],
        metadata: {},
      });

      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(root);
      } catch {
        return `Error: path does not exist: ${root}`;
      }

      const fileMime = stat.isFile() ? mimeForPath(root, includePdfs) : null;
      if (stat.isFile()) {
        if (!fileMime) return `No supported image/PDF file found: ${root}`;
        return renderInventory({
          root,
          recursive: false,
          files: [
            {
              filePath: root,
              relativePath:
                path.relative(relativeRoot, root) || path.basename(root),
              mime: fileMime,
              size: stat.size,
              modifiedAt: stat.mtime,
            },
          ],
          truncated: false,
        });
      }

      if (!stat.isDirectory())
        return `Error: path is not a file or directory: ${root}`;

      return renderInventory({
        root,
        recursive,
        ...collectMediaFiles({
          root,
          workspaceRoot: relativeRoot,
          recursive,
          includePdfs,
          maxFiles,
          abort: toolContext.abort,
        }),
      });
    },
  });
}

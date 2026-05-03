import { afterEach, describe, expect, mock, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMediaInventoryTool } from './media-inventory';

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'media-inventory-'));
}

function makeContext(options: { directory?: string; worktree?: string } = {}) {
  return {
    ask: mock(async () => undefined),
    metadata: mock(() => undefined),
    abort: new AbortController().signal,
    directory: options.directory ?? '/tmp/media-inventory-test',
    worktree:
      options.worktree ?? options.directory ?? '/tmp/media-inventory-test',
  };
}

describe('media_inventory tool', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    mock.restore();
  });

  test('lists images and PDFs in a directory', async () => {
    const dir = makeTempDir();
    dirs.push(dir);
    writeFileSync(path.join(dir, 'plot.png'), 'png bytes');
    writeFileSync(path.join(dir, 'report.pdf'), 'pdf bytes');
    writeFileSync(path.join(dir, 'notes.txt'), 'ignore me');

    const mediaInventory = createMediaInventoryTool({ directory: dir } as any);
    const ctx = makeContext({ directory: dir });
    const result = await mediaInventory.execute(
      { path: '.', recursive: false, include_pdfs: true },
      ctx as any,
    );

    expect(result).toContain('Found 2 image/PDF file(s)');
    expect(result).toContain(path.join(dir, 'plot.png'));
    expect(result).toContain(path.join(dir, 'report.pdf'));
    expect(result).not.toContain('notes.txt');
    expect(result).toContain('delegate to @observer');
    expect(ctx.ask).toHaveBeenCalledWith({
      permission: 'read',
      patterns: [dir],
      always: [dir],
      metadata: {},
    });
  });

  test('resolves relative paths from the runtime tool context directory', async () => {
    const pluginDir = makeTempDir();
    const runtimeDir = makeTempDir();
    dirs.push(pluginDir, runtimeDir);
    writeFileSync(path.join(pluginDir, 'wrong.png'), 'wrong image');
    writeFileSync(path.join(runtimeDir, 'right.png'), 'right image');

    const mediaInventory = createMediaInventoryTool({
      directory: pluginDir,
    } as any);
    const result = await mediaInventory.execute(
      { path: '.', recursive: false },
      makeContext({ directory: runtimeDir }) as any,
    );

    expect(result).toContain(path.join(runtimeDir, 'right.png'));
    expect(result).not.toContain('wrong.png');
  });

  test('respects recursive scanning', async () => {
    const dir = makeTempDir();
    dirs.push(dir);
    const nested = path.join(dir, 'nested');
    writeFileSync(path.join(dir, 'top.jpg'), 'jpg bytes');
    mkdirSync(nested);
    writeFileSync(path.join(nested, 'deep.webp'), 'webp bytes');

    const mediaInventory = createMediaInventoryTool({ directory: dir } as any);
    const shallow = await mediaInventory.execute(
      { path: '.', recursive: false },
      makeContext({ directory: dir }) as any,
    );
    const recursive = await mediaInventory.execute(
      { path: '.', recursive: true },
      makeContext({ directory: dir }) as any,
    );

    expect(shallow).toContain('top.jpg');
    expect(shallow).not.toContain('deep.webp');
    expect(recursive).toContain('top.jpg');
    expect(recursive).toContain('deep.webp');
  });

  test('supports max_files truncation and include_pdfs false', async () => {
    const dir = makeTempDir();
    dirs.push(dir);
    writeFileSync(path.join(dir, 'a.png'), 'png bytes');
    writeFileSync(path.join(dir, 'b.jpg'), 'jpg bytes');
    writeFileSync(path.join(dir, 'report.pdf'), 'pdf bytes');

    const mediaInventory = createMediaInventoryTool({ directory: dir } as any);
    const result = await mediaInventory.execute(
      { path: '.', max_files: 1, include_pdfs: false },
      makeContext({ directory: dir }) as any,
    );

    expect(result).toContain('Found 1 image/PDF file(s)');
    expect(result).toContain('Result truncated at 1 file(s)');
    expect(result).not.toContain('report.pdf');
  });

  test('reports when scan entry budget is reached', async () => {
    const dir = makeTempDir();
    dirs.push(dir);
    for (let index = 0; index < 5_001; index += 1) {
      writeFileSync(path.join(dir, `file-${index}.txt`), 'not media');
    }

    const mediaInventory = createMediaInventoryTool({ directory: dir } as any);
    const result = await mediaInventory.execute(
      { path: '.', recursive: false },
      makeContext({ directory: dir }) as any,
    );

    expect(result).toContain(
      'Scan limit reached after 5001 filesystem entries',
    );
    expect(result).toContain('results may be incomplete');
  });

  test('returns a single supported file', async () => {
    const dir = makeTempDir();
    dirs.push(dir);
    const imagePath = path.join(dir, 'figure.jpeg');
    writeFileSync(imagePath, 'jpeg bytes');

    const mediaInventory = createMediaInventoryTool({ directory: dir } as any);
    const result = await mediaInventory.execute(
      { path: imagePath },
      makeContext({ directory: dir }) as any,
    );

    expect(result).toContain('Found 1 image/PDF file(s)');
    expect(result).toContain(imagePath);
    expect(result).toContain('image/jpeg');
  });
});

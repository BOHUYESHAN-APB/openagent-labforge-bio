import { describe, expect, test } from 'bun:test';
import { getRuntimeCompatibilityProfile } from '../types';
import {
  getCapabilityRenderer,
  renderRuntimeCapabilities,
  SHARED_PREFIX_SNAPSHOT_MARKDOWN,
} from './registry';

// OpenClaude/Codex compatibility features are on hold indefinitely
describe.skip('capability renderer registry', () => {
  test('renders shared-prefix snapshot from stable template', () => {
    const runtime = getRuntimeCompatibilityProfile('codex');
    if (!runtime) throw new Error('Expected codex runtime profile');

    const files = renderRuntimeCapabilities(
      { runtime, workspaceRoot: process.cwd() },
      ['shared-prefix-snapshot'],
    );

    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('compat/shared-prefix-snapshot.md');
    expect(files[0].content).toContain('[SHARED_CONTEXT_START]');
    expect(files[0].content).toBe(SHARED_PREFIX_SNAPSHOT_MARKDOWN);
  });

  test('renders Claude baseline plugin assets', () => {
    const runtime = getRuntimeCompatibilityProfile('claude-code');
    if (!runtime) throw new Error('Expected claude runtime profile');

    const files = renderRuntimeCapabilities(
      { runtime, workspaceRoot: process.cwd() },
      ['plugin-manifest', 'skills', 'agents', 'commands', 'mcp'],
    );

    expect(files.map((file) => file.relativePath)).toEqual(
      expect.arrayContaining([
        '.claude-plugin/plugin.json',
        '.claude-plugin/marketplace.json',
        'skills/extendai-lab-foundation/SKILL.md',
        'agents/extendai-lab-orchestrator.md',
        'commands/extendai-lab-baseline.md',
        '.mcp.json',
      ]),
    );
  });

  test('renders Codex plugin baseline including app and marketplace metadata', () => {
    const runtime = getRuntimeCompatibilityProfile('codex');
    if (!runtime) throw new Error('Expected codex runtime profile');

    const files = renderRuntimeCapabilities(
      { runtime, workspaceRoot: process.cwd() },
      ['plugin-manifest'],
    );

    expect(files.map((file) => file.relativePath)).toEqual(
      expect.arrayContaining([
        'plugins/cache/extendai-lab-local/extendai-lab/local/.codex-plugin/plugin.json',
        'plugins/cache/extendai-lab-local/extendai-lab/local/.app.json',
        '.agents/plugins/marketplace.json',
      ]),
    );
    expect(
      files.find(
        (file) => file.relativePath === '.agents/plugins/marketplace.json',
      )?.content,
    ).toContain('"name": "extendai-lab-local"');
    expect(
      files.find(
        (file) => file.relativePath === '.agents/plugins/marketplace.json',
      )?.content,
    ).toContain('"installation": "AVAILABLE"');
  });

  test('unknown renderer requests return no files', () => {
    const runtime = getRuntimeCompatibilityProfile('opencode');
    if (!runtime) throw new Error('Expected opencode runtime profile');
    expect(getCapabilityRenderer('hooks')).toBeUndefined();
    expect(
      renderRuntimeCapabilities({ runtime, workspaceRoot: process.cwd() }, [
        'hooks',
      ]),
    ).toEqual([]);
  });
});

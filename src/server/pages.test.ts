import { describe, expect, test } from 'bun:test';
import { renderHtmlViewer } from './pages';

describe('renderHtmlViewer', () => {
  test('renders workspace selector and propagates workspace parameter', () => {
    const html = renderHtmlViewer(
      'dark',
      [
        { id: 'w1', directory: 'D:/repo-a' },
        { id: 'w2', directory: 'D:/repo-b' },
      ],
      'D:/repo-b',
    );

    expect(html).toContain('workspace-select');
    expect(html).toContain('D:/repo-a');
    expect(html).toContain('D:/repo-b');
    expect(html).toContain('current = new URLSearchParams(location.search).get(\'workspace\')');
    expect(html).toContain("fetch('/api/html-pages' + query)");
  });

  test('keeps working without any workspace options', () => {
    const html = renderHtmlViewer('dark');
    expect(html).toContain('AI-Generated HTML Viewer');
    expect(html).not.toContain('<option value=');
    expect(html).not.toContain('<select id="workspace-select">');
  });
});

import { describe, expect, test } from 'bun:test';
import { renderHtmlViewer } from './pages';

describe('renderHtmlViewer', () => {
  test('renders grouped html pages and opens the active workspace by default', () => {
    const html = renderHtmlViewer(
      'dark',
      [
        {
          workspace: { id: 'w1', directory: 'D:/repo-a' },
          pages: [{ name: 'report-a.html', relativePath: 'report-a.html' }],
        },
        {
          workspace: { id: 'w2', directory: 'D:/repo-b' },
          pages: [
            { name: 'report-b.html', relativePath: 'report-b.html' },
            { name: 'summary.html', relativePath: 'summary.html' },
          ],
        },
      ],
      'D:/repo-b',
    );

    expect(html).toContain('HTML Hub');
    expect(html).toContain('D:/repo-a');
    expect(html).toContain('D:/repo-b');
    expect(html).toContain('report-a.html');
    expect(html).toContain('report-b.html');
    expect(html).toContain('summary.html');
    expect(html).toContain('/api/html-open?workspace=D%3A%2Frepo-b&path=report-b.html');
    expect(html).toContain('<details class="workspace-group" open>');
  });

  test('keeps working without any html workspaces', () => {
    const html = renderHtmlViewer('dark');
    expect(html).toContain('No HTML artifacts found in known workspaces.');
  });
});

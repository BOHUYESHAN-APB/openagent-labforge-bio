import { describe, expect, test } from 'bun:test';
import { renderDashboard } from './pages';

describe('renderDashboard', () => {
  test('promotes only high-frequency artifact and config entry points', () => {
    const html = renderDashboard('dark', {
      workspace: 'D:/repo-a',
      port: 25569,
    });

    expect(html).toContain('HTML Hub');
    expect(html).toContain('Plans');
    expect(html).toContain('Project Config');
    expect(html).not.toContain('Skills 0 document & design skills');
    expect(html).not.toContain('Team agent status & tasks');
    expect(html).not.toContain('Change proposals & tracking');
  });
});

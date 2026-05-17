/**
 * HTML page renderers for extendai-lab web dashboard.
 * Pure functions returning HTML strings — no framework.
 */

interface DashboardProps { sessions: number }
interface DocEntry { dirName: string; files: { name: string; type: 'file' | 'dir'; path: string }[] }
interface Skill { name: string; category: string; description: string }
interface PlanEntry { name: string; type: 'file' | 'dir'; path: string }

const NAV = `<nav><a href="/dashboard">Dashboard</a><a href="/docs">Docs</a><a href="/skills">Skills</a><a href="/plans">Plans</a><a href="/config/project">Config (Project)</a><a href="/config/global">Config (Global)</a></nav>`;

function shell(title: string, body: string, extraHead = ''): string {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · extendai-lab</title><link rel="stylesheet" href="/style.css">${extraHead}</head><body>${NAV}<main>${body}</main></body></html>`;
}

export function renderDashboard(props: DashboardProps): string {
  return shell('Dashboard', `
    <h1>extendai-lab Dashboard</h1>
    <p class="status">Connected sessions: ${props.sessions} · Port: 25569</p>
    <div class="grid">
      <div class="card"><h3>Sessions</h3><p>${props.sessions} active</p></div>
      <div class="card"><h3>Skills</h3><p>75+ document & design skills available</p></div>
      <div class="card"><h3>Config</h3><p>Edit project/global configuration</p></div>
      <div class="card"><h3>Document Parser</h3><p>If the model lacks native doc parsing, use Python tools</p></div>
    </div>
    <script>
      const es = new EventSource('/api/sse');
      es.addEventListener('connected', () => console.log('SSE connected'));
      es.addEventListener('agent_status', (e) => {
        const d = JSON.parse(e.data);
        const el = document.getElementById('agent-activity');
        if (el) el.textContent = JSON.stringify(d);
      });
    </script>
  `);
}

export async function renderDocs(docs: DocEntry[]): Promise<string> {
  if (docs.length === 0) return shell('Docs', '<h1>Docs</h1><p>No doc/doc/docs/documents folders found in workspace.</p>');
  const sections = docs.map((d) => `
    <h2>/${d.dirName}</h2>
    <div class="grid">
      ${d.files.map((f) => `<div class="card"><h3>${f.type === 'dir' ? '📁' : '📄'} ${f.name}</h3><p>${f.path}</p></div>`).join('')}
    </div>
  `).join('');
  return shell('Docs', `<h1>Document Browser</h1>${sections}`);
}

export function renderSkills(skills: Skill[]): string {
  const categories = [...new Set(skills.map((s) => s.category))];
  const sections = categories.map((cat) => `
    <h2>${cat}</h2>
    <div class="grid">
      ${skills.filter((s) => s.category === cat).map((s) => `<div class="card"><h3>${s.name}</h3><p>${s.description}</p></div>`).join('')}
    </div>
  `).join('');
  return shell('Skills', `<h1>Skills Gallery</h1><p class="status">${skills.length} skills · ${categories.length} categories</p>${sections}`);
}

export function renderPlans(plans: PlanEntry[]): string {
  if (plans.length === 0) return shell('Plans', '<h1>Plans</h1><p>No saved plans found.</p>');
  const items = plans.map((p) => `<div class="card"><h3>${p.name}</h3><p>${p.path}</p></div>`).join('');
  return shell('Plans', `<h1>Plans</h1><div class="grid">${items}</div>`);
}

export function renderConfigEditor(config: Record<string, unknown>, scope: string, configPath: string): string {
  const keys = Object.entries(config).filter(([, v]) => typeof v !== 'object' || v === null || Array.isArray(v));
  const nestedKeys = Object.entries(config).filter(([, v]) => typeof v === 'object' && v !== null && !Array.isArray(v));

  const fieldsHtml = keys.map(([k, v]) => {
    const label = k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const val = typeof v === 'boolean' ? v : typeof v === 'string' ? v : JSON.stringify(v);
    if (typeof v === 'boolean') {
      return `<label>${label}<br><select name="${k}"><option value="true"${v ? ' selected' : ''}>Yes / true</option><option value="false"${!v ? ' selected' : ''}>No / false</option></select></label>`;
    }
    return `<label>${label}<br><input type="text" name="${k}" value="${escapeHtml(String(val))}"></label>`;
  }).join('');

  const nestedHtml = nestedKeys.map(([k, v]) => {
    const label = k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return `<label>${label}<br><textarea name="${k}" rows="6">${escapeHtml(JSON.stringify(v, null, 2))}</textarea></label>`;
  }).join('');

  return shell(`Config (${scope})`, `
    <h1>Config Editor · ${scope}</h1>
    <p class="status">Path: ${configPath}</p>
    <form id="config-form" onsubmit="saveConfig(event, '${scope}')">
      ${fieldsHtml}
      ${nestedHtml}
      <button type="submit">Save &amp; Restart Required</button>
    </form>
    <div id="save-status"></div>
    <script>
      async function saveConfig(e, scope) {
        e.preventDefault();
        const form = document.getElementById('config-form');
        const fd = new FormData(form);
        const config = {};
        for (const [k, v] of fd.entries()) {
          try { config[k] = JSON.parse(v); } catch { config[k] = v === 'true' ? true : v === 'false' ? false : v; }
        }
        const resp = await fetch('/api/config/save', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({scope, config}) });
        const result = await resp.json();
        const el = document.getElementById('save-status');
        el.textContent = result.ok ? result.message : 'Error: ' + result.error;
        el.style.color = result.ok ? '#3fb950' : '#f85149';
      }
    </script>
  `);
}

export function renderErrorPage(msg: string): string {
  return shell('Error', `<h1>404</h1><p>${msg}</p>`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * extendai-lab Dashboard Pages v4 — Schema-based config, HTML viewer, modern UI
 */
export { escapeHtml };

export interface WorkspaceOption {
  id: string;
  directory: string;
}

export interface HtmlPageEntry {
  name: string;
  relativePath: string;
}

export interface HtmlWorkspaceGroup {
  workspace: WorkspaceOption;
  pages: HtmlPageEntry[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Schema-based config fields ───────────────────────
interface FieldDef {
  key: string;
  label: string;
  type: 'string' | 'boolean' | 'number' | 'json' | 'select';
  section: string;
  options?: string[];
  default?: unknown;
}

const CONFIG_FIELDS: FieldDef[] = [
  // General
  {
    key: 'default_preset',
    label: 'Default Preset',
    type: 'select',
    section: 'General',
    options: [
      'free',
      'ds-first',
      'openai',
      'openai-go',
      'ds-mimo',
      '3-mix',
      'custom',
    ],
    default: 'free',
  },
  {
    key: 'preferredVisibleAgent',
    label: 'Preferred Visible Agent',
    type: 'select',
    section: 'General',
    options: ['engineer', 'planner', 'executor', 'bio-analyst', 'chem-analyst'],
  },
  {
    key: 'autoUpdate',
    label: 'Auto Update Check',
    type: 'boolean',
    section: 'General',
    default: true,
  },
  // Todo Continuation
  {
    key: 'todoContinuation.maxContinuations',
    label: 'Max Auto Continuations',
    type: 'number',
    section: 'Auto-Continue',
    default: 100,
  },
  {
    key: 'todoContinuation.autoEnable',
    label: 'Auto-Continue Enabled',
    type: 'boolean',
    section: 'Auto-Continue',
    default: false,
  },
  // Compression
  {
    key: 'compression.enabled',
    label: 'Context Compression',
    type: 'boolean',
    section: 'Compression',
    default: true,
  },
  // Bio Skills
  {
    key: 'bioSkills.enabled',
    label: 'Bio Skills Enabled',
    type: 'boolean',
    section: 'Bio Skills',
    default: true,
  },
  // Multiplexer
  {
    key: 'multiplexer.provider',
    label: 'Multiplexer Provider',
    type: 'select',
    section: 'Multiplexer',
    options: ['tmux', 'zellij', 'disabled'],
    default: 'disabled',
  },
  // Others
  {
    key: 'disabled_agents',
    label: 'Disabled Agents (comma)',
    type: 'string',
    section: 'Advanced',
  },
  {
    key: 'disabled_mcps',
    label: 'Disabled MCPs (comma)',
    type: 'string',
    section: 'Advanced',
  },
];

function getValue(config: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let v: unknown = config;
  for (const p of parts) {
    if (v && typeof v === 'object') v = (v as Record<string, unknown>)[p];
    else return undefined;
  }
  return v;
}

function renderConfigFields(config: Record<string, unknown>): string {
  const sections = [...new Set(CONFIG_FIELDS.map((f) => f.section))];
  return sections
    .map((sec) => {
      const fields = CONFIG_FIELDS.filter((f) => f.section === sec);
      return (
        `<fieldset class="cfg-section"><legend>${sec}</legend>` +
        fields
          .map((f) => {
            const val = getValue(config, f.key) ?? f.default ?? '';
            if (f.type === 'boolean')
              return `<label class="cfg-row"><span>${f.label}</span><select name="${f.key}"><option value="true"${val === true ? ' selected' : ''}>On</option><option value="false"${val !== true ? ' selected' : ''}>Off</option></select></label>`;
            if (f.type === 'select')
              return `<label class="cfg-row"><span>${f.label}</span><select name="${f.key}">${(f.options ?? []).map((o: string) => `<option value="${o}"${val === o ? ' selected' : ''}>${o}</option>`).join('')}</select></label>`;
            if (f.type === 'number')
              return `<label class="cfg-row"><span>${f.label}</span><input name="${f.key}" type="number" value="${val}" step="1"></label>`;
            if (f.type === 'string')
              return `<label class="cfg-row"><span>${f.label}</span><input name="${f.key}" value="${escapeAttr(String(val))}"></label>`;
            return '';
          })
          .join('') +
        '</fieldset>'
      );
    })
    .join('');
}

// ── Pages ────────────────────────────────────────────
export function renderDashboard(
  theme: string,
  info?: {
    workspace?: string;
    port?: number;
  },
): string {
  return base(
    'Dashboard',
    `
    <div class="hero">
      <h1>extendai-lab</h1>
      <p>Local artifact hub for AI-generated HTML, plans, and workspace controls</p>
      ${info ? `<p class="sub mono">${info.workspace || ''} · Port ${info.port || 25569}</p>` : ''}
    </div>
    <div class="grid-3">
      <a href="/view" class="card-link"><span class="ico">🌐</span><h3>HTML Hub</h3><p>Centralized workspace HTML artifacts for quick viewing</p></a>
      <a href="/plans" class="card-link"><span class="ico">📋</span><h3>Plans</h3><p>Open saved plans without jumping back into the repo tree</p></a>
      <a href="/docs" class="card-link"><span class="ico">📄</span><h3>Docs</h3><p>Browse workspace documentation when it exists</p></a>
      <a href="/config/project" class="card-link"><span class="ico">⚙</span><h3>Project Config</h3><p>Edit project settings</p></a>
      <a href="/config/global" class="card-link"><span class="ico">🔧</span><h3>Global Config</h3><p>Edit global plugin settings</p></a>
    </div>
    <p class="sub" style="margin-top:18px">Internal or low-frequency pages such as skills, sessions, teams, changes, and explore remain available by direct URL, but are intentionally not promoted on the homepage.</p>
  `,
    theme,
  );
}

interface SkillInfo {
  name: string;
  category: string;
  zhName: string;
  description: string;
  path: string;
}

export function renderSkillsList(skills: SkillInfo[], theme: string): string {
  const cats = [...new Set(skills.map((s) => s.category))];
  return base(
    'Skills',
    `
    <h2>Skills Gallery</h2>
    <p class="sub">${skills.length} skills · ${cats.length} categories</p>
    ${cats
      .map(
        (cat) => `
      <h3 class="cat-head">${cat}</h3>
      <div class="grid-3">
        ${skills
          .filter((s) => s.category === cat)
          .map(
            (s) => `
          <a href="/skills/${encodeURIComponent(s.name)}" class="card-link">
            <h4>${s.zhName || s.name}</h4>
            <p>${s.description || ''}</p>
          </a>
        `,
          )
          .join('')}
      </div>
    `,
      )
      .join('')}
  `,
    theme,
  );
}

export function renderSkillDetail(
  name: string,
  md: string,
  html: string,
  theme: string,
): string {
  return base(
    name,
    `
    <h2>${name}</h2>
    <div class="tabs"><button class="tab active" onclick="switchTab('md')">Markdown</button><button class="tab" onclick="switchTab('html')">HTML Preview</button></div>
    <div id="tab-md" class="tab-body">${md2html(md)}</div>
    <div id="tab-html" class="tab-body hidden">${html ? `<iframe srcdoc="${escapeAttr(html)}" sandbox="allow-scripts allow-same-origin" class="iframe-full"></iframe>` : '<p class="sub">No HTML preview</p>'}</div>
    <script>function switchTab(n){document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.tab-body').forEach(t=>t.classList.add('hidden'));document.getElementById('tab-'+n).classList.remove('hidden');event.target.classList.add('active')}</script>
  `,
    theme,
  );
}

interface DocEntry {
  dirName: string;
  files: { name: string; type: 'file' | 'dir'; path: string }[];
}

export function renderDocs(docs: DocEntry[], theme: string): string {
  if (!docs.length)
    return base(
      'Docs',
      '<h2>Docs</h2><p class="sub">No doc/docs/document/documents folders in workspace.</p>',
      theme,
    );
  return base(
    'Docs',
    `
    <h2>Document Browser</h2>
    ${docs
      .map(
        (d) => `
      <h3 class="cat-head">/${d.dirName}</h3>
      <div class="grid-3">
        ${d.files.map((f) => `<a href="/docs/file?path=${encodeURIComponent(f.path)}" class="card-link"><h4>${f.type === 'dir' ? '📁' : '📄'} ${f.name}</h4><p class="mono">${f.path}</p></a>`).join('')}
      </div>
    `,
      )
      .join('')}
  `,
    theme,
  );
}

export function renderDocFile(
  path: string,
  content: string,
  theme: string,
): string {
  const isMd = /\.md$/i.test(path),
    isHtml = /\.html?$/i.test(path);
  let body = `<h2>${path}</h2>`;
  body += `<p class="sub">Project document — not an AI-generated HTML artifact. Use <a href="/view">HTML Hub</a> for AI-generated pages.</p>`;
  if (isHtml)
    // Render project .html files as source code, not live iframes,
    // to avoid confusing project files with AI-generated artifacts
    body += `<pre class="code-block">${escapeHtml(content)}</pre>`;
  else if (isMd) body += md2html(content);
  else body += `<pre class="code-block">${escapeHtml(content)}</pre>`;
  return base(path, body, theme);
}

interface PlanEntry {
  name: string;
  type: 'file' | 'dir';
  path: string;
}

export function renderPlans(plans: PlanEntry[], theme: string): string {
  if (!plans.length)
    return base(
      'Plans',
      '<h2>Plans</h2><p class="sub">No saved plans.</p>',
      theme,
    );
  return base(
    'Plans',
    `
    <h2>Plans</h2>
    <div class="grid-3">
      ${plans.map((p) => `<a href="/plans/file?path=${encodeURIComponent(p.path)}" class="card-link"><h4>${p.name}</h4><p class="mono">${p.path}</p></a>`).join('')}
    </div>
  `,
    theme,
  );
}

export function renderPlanFile(
  path: string,
  content: string,
  theme: string,
): string {
  return base(path, `<h2>${path}</h2>` + md2html(content), theme);
}

export function renderConfigEditor(
  config: Record<string, unknown>,
  scope: string,
  configPath: string,
  theme: string,
): string {
  return base(
    `Config (${scope})`,
    `
    <h2>Config Editor · ${scope}</h2>
    <p class="sub mono">${configPath}</p>
    <p class="sub">This page intentionally shows a curated set of high-frequency settings. For uncommon options, edit the JSON file directly.</p>
    <form id="cf" onsubmit="saveConfig(event,'${scope}')">
      ${renderConfigFields(config)}
      <button type="submit" class="btn-save">Save (restart required)</button>
    </form>
    <div id="st" class="toast hidden"></div>
    <script>
      async function saveConfig(e,s){e.preventDefault();const d=new FormData(document.getElementById('cf'));const c={};
      for(const[k,v]of d.entries()){const p=k.split('.');let t=c;for(let i=0;i<p.length-1;i++){t[p[i]]=t[p[i]]||{};t=t[p[i]]}t[p[p.length-1]]=v==='true'?true:v==='false'?false:isNaN(v)?v:Number(v)}
      const r=await fetch('/api/config/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:s,config:c})});const j=await r.json();
      const el=document.getElementById('st');el.textContent=j.ok?j.message:'Error: '+j.error;el.className='toast '+(j.ok?'ok':'err');setTimeout(()=>el.className='toast hidden',4000)}
    </script>
  `,
    theme,
  );
}

// ── AI HTML Viewer ───────────────────────────────────
export function renderHtmlViewer(
  theme: string,
  groups: HtmlWorkspaceGroup[] = [],
  activeWorkspace?: string,
): string {
  return renderHtmlHubGroups(groups, theme, activeWorkspace);
}

export function renderHtmlHubGroups(
  groups: HtmlWorkspaceGroup[],
  theme: string,
  activeWorkspace?: string,
): string {
  const body = groups.length
    ? groups
        .map(
          ({ workspace, pages }) => `
            <details class="workspace-group" ${workspace.directory === activeWorkspace ? 'open' : ''}>
              <summary>${escapeHtml(workspace.directory)}${workspace.directory === activeWorkspace ? ' · current' : ''} · ${pages.length} page(s)</summary>
              <div class="grid-3" style="margin-top:12px">
                ${pages
                  .map(
                    (page) => `
                      <a href="/api/html-open?workspace=${encodeURIComponent(workspace.directory)}&path=${encodeURIComponent(page.relativePath)}" class="card-link" target="_blank">
                        <h4>${escapeHtml(page.name)}</h4>
                        <p class="sub">${escapeHtml(page.relativePath)}</p>
                      </a>
                    `,
                  )
                  .join('')}
              </div>
            </details>
          `,
        )
        .join('')
    : '<p class="sub">No HTML artifacts found in known workspaces.</p>';

  return base(
    'HTML Hub',
    `
    <h2>HTML Hub</h2>
    <p class="sub">Only workspaces with actual HTML artifacts are shown here. Pages open through this local server, so they render consistently without separate deployment or file:// jumps.</p>
    ${body}
  `,
    theme,
  );
}

export function renderHtmlPage(
  name: string,
  content: string,
  theme: string,
): string {
  return `<!DOCTYPE html><html lang="zh-CN" data-theme="${theme}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} · extendai-lab</title></head><body style="margin:0">${content}</body></html>`;
}

export function renderError(msg: string, theme: string): string {
  return base('Error', `<h2>Error</h2><p class="toast err">${msg}</p>`, theme);
}

// ── Markdown → HTML ──────────────────────────────────
function md2html(md: string): string {
  let o = md;
  o = o.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) =>
      `<pre><code class="lang-${lang}">${escapeHtml(code.trim())}</code></pre>`,
  );
  o = o.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  o = o.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  o = o.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  o = o.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  o = o.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  o = o.replace(/\*(.+?)\*/g, '<em>$1</em>');
  o = o.replace(/`([^`]+)`/g, '<code>$1</code>');
  o = o.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  o = o.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" style="max-width:100%">',
  );
  o = o.replace(/^---$/gm, '<hr>');
  o = o.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  o = o.replace(/^[\s]*[-*] (.+)$/gm, '<li>$1</li>');
  o = o.replace(/(<li>[\s\S]*?<\/li>)/g, (m) => `<ul>${m}</ul>`);
  o = o.replace(/^\|(.+)\|$/gm, (line, cells) => {
    const tds = cells.split('|').map((c: string) => c.trim());
    return `<tr>${tds.map((c: string) => `<td>${c}</td>`).join('')}</tr>`;
  });
  o = o.replace(/(<tr>[\s\S]*?<\/tr>)/g, (m) =>
    m.includes('<td>') ? `<table>${m}</table>` : m,
  );
  o = o.replace(/<\/table>\s*<table>/g, '');
  o = '<div class="md">' + o + '</div>';
  return o;
}

// ── Base layout ──────────────────────────────────────
function base(title: string, body: string, theme: string): string {
  return `<!DOCTYPE html><html lang="zh-CN" data-theme="${theme}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · extendai-lab</title><style>${CSS}</style></head><body><nav><a href="/" class="brand">⚡ extendai-lab</a><div class="nav-links"><a href="/view">HTML</a><a href="/plans">Plans</a><a href="/docs">Docs</a><a href="/config/project">Config</a></div><button class="btn-theme" onclick="toggleTheme()">${theme === 'dark' ? '☀' : '☾'}</button></nav><main>${body}</main><script>function toggleTheme(){const h=document.documentElement;const t=h.dataset.theme==='dark'?'light':'dark';h.dataset.theme=t;fetch('/api/theme?theme='+t);location.reload()}const ws=new URLSearchParams(location.search).get('workspace');if(ws){document.querySelectorAll('a[href^="/"]').forEach(a=>{const href=a.getAttribute('href');if(!href)return;const u=new URL(href,location.origin);if(!u.searchParams.has('workspace'))u.searchParams.set('workspace',ws);a.setAttribute('href',u.pathname+u.search+u.hash)})}</script></body></html>`;
}

// ── CSS ──────────────────────────────────────────────
const CSS = `
:root{--bg:#0d1117;--bg2:#161b22;--fg:#c9d1d9;--fg2:#f0f6fc;--link:#58a6ff;--border:#30363d;--ok:#3fb950;--err:#f85149;--sub:#8b949e}
[data-theme="light"]{--bg:#fff;--bg2:#f6f8fa;--fg:#1f2328;--fg2:#1f2328;--link:#0969da;--border:#d0d7de;--sub:#656d76}
*{margin:0;padding:0;box-sizing:border-box}
body{font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg)}
nav{position:sticky;top:0;z-index:10;background:var(--bg2);padding:10px 20px;display:flex;align-items:center;gap:16px;border-bottom:1px solid var(--border)}
.brand{color:var(--fg2);font-weight:700;font-size:15px;text-decoration:none}
.nav-links{display:flex;gap:14px}
nav a{color:var(--link);text-decoration:none;font-size:13px;font-weight:500}
nav a:hover{text-decoration:underline}
.btn-theme{margin-left:auto;background:none;border:1px solid var(--border);color:var(--fg);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:16px}
main{max-width:1100px;margin:0 auto;padding:28px 20px}
h1{font-size:24px;margin-bottom:8px;color:var(--fg2)}
h2{font-size:20px;margin:20px 0 12px;color:var(--fg2)}
h3{font-size:16px;margin:12px 0 6px;color:var(--fg2)}
h4{font-size:14px;margin-bottom:4px}
p{line-height:1.6;margin-bottom:8px}
.sub{color:var(--sub);font-size:13px}
.mono{font:12px "Cascadia Code",Consolas,monospace;color:var(--sub)}
.cat-head{text-transform:uppercase;font-size:12px;color:var(--sub);margin-top:24px;padding-bottom:4px;border-bottom:1px solid var(--border);letter-spacing:.5px}
.grid-3{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-bottom:20px}
.card-link{display:block;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:16px;text-decoration:none;transition:border-color .15s}
.card-link:hover{border-color:var(--link)}
.card-link h3,.card-link h4{color:var(--link)}
.card-link p{color:var(--sub);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-link .ico{font-size:22px;margin-bottom:6px;display:block}
.hero{text-align:center;padding:40px 0 24px}
.hero h1{font-size:32px}
.hero p{color:var(--sub);font-size:15px}
.tabs{display:flex;gap:0;margin-bottom:0}
.tab{padding:8px 16px;background:var(--bg2);border:1px solid var(--border);border-bottom:none;border-radius:4px 4px 0 0;color:var(--sub);cursor:pointer;font-size:13px}
.tab.active{background:var(--bg);color:var(--fg2)}
.tab-body{padding:16px;background:var(--bg);border:1px solid var(--border);border-radius:0 4px 4px 4px;min-height:200px}
.hidden{display:none}
.iframe-full{width:100%;height:80vh;border:none}
fieldset.cfg-section{border:1px solid var(--border);border-radius:6px;padding:14px;margin-bottom:12px}
legend{color:var(--link);font-weight:600;padding:0 8px;font-size:13px}
.cfg-row{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:13px}
.cfg-row span{min-width:150px;color:var(--fg)}
.cfg-row input,.cfg-row select{flex:1;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--fg);font:inherit;font-size:13px}
.cfg-row input:focus,.cfg-row select:focus{outline:none;border-color:var(--link)}
.btn-save{padding:10px 20px;background:#238636;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;margin-top:8px}
.btn-save:hover{opacity:.9}
.toast{padding:10px 14px;border-radius:4px;margin-top:12px;font-size:13px}
.toast.ok{background:#1a332a;color:var(--ok);border:1px solid var(--ok)}
.toast.err{background:#2d1518;color:var(--err);border:1px solid var(--err)}
pre,code{font:13px "Cascadia Code",Consolas,monospace}
pre{background:var(--bg2);padding:14px;border-radius:4px;overflow-x:auto;border:1px solid var(--border);margin:8px 0}
code{background:var(--bg2);padding:1px 5px;border-radius:3px}
pre code{background:none;padding:0}
blockquote{border-left:3px solid var(--link);padding:8px 14px;margin:8px 0;background:var(--bg2);border-radius:0 4px 4px 0}
table{border-collapse:collapse;width:100%;margin:8px 0}
td{padding:6px 10px;border:1px solid var(--border);font-size:13px}
hr{border:none;border-top:1px solid var(--border);margin:16px 0}
ul,ol{padding-left:20px;margin:8px 0}
li{line-height:1.7}
img{max-width:100%;border-radius:4px}
.md{line-height:1.7}
.md h1{font-size:22px;border-bottom:1px solid var(--border);padding-bottom:6px}
.md h2{font-size:18px;margin-top:20px}
.md h3{font-size:15px;margin-top:16px}
.md p{margin:8px 0}
.code-block{background:var(--bg2);padding:16px;border-radius:4px;border:1px solid var(--border);overflow-x:auto;white-space:pre-wrap;font:13px monospace}
.session-card{background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:16px;margin-bottom:12px}
.session-card h3{margin:0 0 8px 0;color:var(--fg)}
.session-card .status{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600}
.session-card .status.active{background:#1a332a;color:var(--ok)}
.session-card .status.paused{background:#332a1a;color:var(--warn)}
.session-card .status.complete{background:#1a2a33;color:var(--link)}
.progress-bar{height:6px;background:var(--bg);border-radius:3px;overflow:hidden;margin:8px 0}
.progress-bar .fill{height:100%;background:var(--link);transition:width 0.3s}
.team-member{display:inline-block;padding:4px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;margin:4px;font-size:12px}
.task-item{padding:8px 12px;border-bottom:1px solid var(--border);font-size:13px}
.task-item:last-child{border-bottom:none}
.task-item .status{float:right;font-weight:600}
.task-item .status.pending{color:var(--sub)}
.task-item .status.in_progress{color:var(--warn)}
.task-item .status.completed{color:var(--ok)}
`;

// ── Teams Page ──────────────────────────────────────
export function renderTeamsPage(teams: any[], theme: string): string {
  const teamsHtml =
    teams.length === 0
      ? '<p class="sub">No active teams. Create a team using the team_create tool.</p>'
      : teams
          .map((team) => {
            const statusClass =
              team.status === 'active'
                ? 'active'
                : team.status === 'deleting'
                  ? 'paused'
                  : 'complete';
            const membersHtml = (team.members || [])
              .map((m: any) => {
                const statusColor =
                  m.status === 'running'
                    ? 'var(--ok)'
                    : m.status === 'idle'
                      ? 'var(--warn)'
                      : 'var(--sub)';
                return `<span class="team-member" style="border-left: 3px solid ${m.color || 'var(--border)'}">
            ${m.name} <span style="color:${statusColor};font-size:11px">${m.status}</span>
            ${m.sessionId ? `<span style="color:var(--sub);font-size:10px">(${m.sessionId.slice(0, 8)})</span>` : ''}
          </span>`;
              })
              .join('');

            const taskProgress = team.tasks
              ? Math.round(
                  (team.tasks.completed / Math.max(team.tasks.total, 1)) * 100,
                )
              : 0;

            return `
          <div class="session-card">
            <h3>${team.teamName} <span class="status ${statusClass}">${team.status}</span></h3>
            <p class="sub mono">Run ID: ${team.teamRunId || 'N/A'} · Created: ${team.createdAt ? new Date(team.createdAt).toLocaleString() : 'N/A'}</p>
            <div style="margin:12px 0">
              <strong>Members (${(team.members || []).length}):</strong><br>
              ${membersHtml || '<span class="sub">No members</span>'}
            </div>
            ${
              team.tasks
                ? `
              <div style="margin:12px 0">
                <strong>Tasks:</strong> ${team.tasks.completed}/${team.tasks.total} completed
                <div class="progress-bar"><div class="fill" style="width:${taskProgress}%"></div></div>
                <span class="sub">Pending: ${team.tasks.pending} · In Progress: ${team.tasks.in_progress} · Completed: ${team.tasks.completed}</span>
              </div>
            `
                : ''
            }
            <div style="margin-top:8px">
              <a href="/api/teams/${team.teamRunId}" class="card-link" style="display:inline-block;padding:4px 12px;font-size:12px">View Details</a>
            </div>
          </div>
        `;
          })
          .join('');

  return base(
    'Teams',
    `
    <h2>Team Agents</h2>
    <p class="sub">${teams.length} active teams</p>
    ${teamsHtml}
    <script>
      // Auto-refresh every 10 seconds
      setTimeout(() => location.reload(), 10000);
    </script>
  `,
    theme,
  );
}

// ── Sessions Page ───────────────────────────────────
export function renderSessionsPage(
  data: { boulder: any; plans: any[] },
  theme: string,
): string {
  const boulderHtml =
    data.boulder && Object.keys(data.boulder).length > 0
      ? `<div class="session-card">
        <h3>Active Boulder State</h3>
        <pre>${JSON.stringify(data.boulder, null, 2)}</pre>
      </div>`
      : '<p class="sub">No active boulder state.</p>';

  const plansHtml =
    data.plans.length === 0
      ? '<p class="sub">No plans found.</p>'
      : data.plans
          .map((plan) => {
            const progress =
              plan.total > 0
                ? Math.round((plan.completed / plan.total) * 100)
                : 0;
            return `
          <div class="session-card">
            <h3>${plan.name}</h3>
            <div class="progress-bar"><div class="fill" style="width:${progress}%"></div></div>
            <span class="sub">${plan.completed}/${plan.total} tasks completed (${progress}%)</span>
          </div>
        `;
          })
          .join('');

  return base(
    'Sessions',
    `
    <h2>Sessions & Plans</h2>
    ${boulderHtml}
    <h3 style="margin-top:20px">Plans</h3>
    ${plansHtml}
    <script>
      setTimeout(() => location.reload(), 15000);
    </script>
  `,
    theme,
  );
}

// ── Changes Page ────────────────────────────────────
export function renderChangesPage(changes: any[], theme: string): string {
  const changesHtml =
    changes.length === 0
      ? '<p class="sub">No change proposals. Use the save_change tool to create one.</p>'
      : changes
          .map((change) => {
            const statusClass =
              change.status === 'in_progress'
                ? 'active'
                : change.status === 'completed'
                  ? 'complete'
                  : '';
            return `
          <div class="session-card">
            <h3>${change.name} <span class="status ${statusClass}">${change.status || 'unknown'}</span></h3>
            ${
              change.tasks
                ? `
              <span class="sub">${change.tasks.completed || 0}/${change.tasks.total || 0} tasks completed</span>
            `
                : ''
            }
          </div>
        `;
          })
          .join('');

  return base(
    'Changes',
    `
    <h2>Change Proposals</h2>
    <p class="sub">${changes.length} changes</p>
    ${changesHtml}
  `,
    theme,
  );
}

// ── Explore Page ────────────────────────────────────
export function renderExplorePage(explorations: any[], theme: string): string {
  const exploreHtml =
    explorations.length === 0
      ? '<p class="sub">No explorations. Use the save_explore tool to create one.</p>'
      : explorations
          .map((exp) => {
            return `
          <div class="session-card">
            <h3>${exp.name}</h3>
            ${exp.tags ? `<span class="sub">Tags: ${exp.tags.join(', ')}</span>` : ''}
            ${exp.created ? `<br><span class="sub">Created: ${new Date(exp.created).toLocaleString()}</span>` : ''}
          </div>
        `;
          })
          .join('');

  return base(
    'Explore',
    `
    <h2>Explorations</h2>
    <p class="sub">${explorations.length} explorations</p>
    ${exploreHtml}
  `,
    theme,
  );
}

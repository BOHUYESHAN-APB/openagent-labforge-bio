/**
 * extendai-lab Web Dashboard + MCP Server
 *
 * Single-process: Bun.serve (HTTP @ 25569) + MCP stdio protocol.
 * Started via `bun run extendai-server` (registered as local MCP in allBuiltinMcps).
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { renderDashboard, renderDocs, renderSkills, renderPlans, renderConfigEditor, renderErrorPage } from './pages';

const PORT = 25569;
const HOST = '127.0.0.1';

// ── State ────────────────────────────────────────────
let workspaceRoot = process.cwd();
const connectedSSE = new Set<ReadableStreamDefaultController<Uint8Array>>();

// ── SSE broadcast ────────────────────────────────────
function broadcastSSE(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoded = new TextEncoder().encode(payload);
  for (const ctrl of connectedSSE) {
    try { ctrl.enqueue(encoded); } catch { connectedSSE.delete(ctrl); }
  }
}

// ── Helpers ──────────────────────────────────────────
function getDocDirs(root: string): string[] {
  const candidates = ['doc', 'docs', 'document', 'documents'];
  return candidates.filter((d) => existsSync(join(root, d)));
}

async function listDir(dir: string): Promise<{ name: string; type: 'file' | 'dir'; path: string }[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' as const : 'file' as const,
        path: relative(workspaceRoot, join(dir, e.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function scanDocFolders(root: string) {
  const dirs = getDocDirs(root);
  const result: { dirName: string; files: ReturnType<typeof listDir> extends Promise<infer T> ? T : never }[] = [];
  for (const d of dirs) {
    const files = await listDir(join(root, d));
    if (files.length > 0) result.push({ dirName: d, files });
  }
  return result;
}

// ── MCP protocol handler ─────────────────────────────
function handleMcpMessage(msg: unknown): unknown {
  if (typeof msg !== 'object' || !msg) return { error: 'invalid message' };
  const m = msg as Record<string, unknown>;

  if (m.method === 'tools/list') {
    return {
      tools: [
        { name: 'extendai_list_skills', description: 'List all available document/design skills', inputSchema: { type: 'object', properties: { category: { type: 'string', description: 'Filter by category: document, deck, social, proto, office' } } } },
        { name: 'extendai_read_plan', description: 'Read a saved plan', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Plan name or "latest"' } } } },
        { name: 'extendai_list_checkpoints', description: 'List session checkpoints', inputSchema: { type: 'object', properties: {} } },
        { name: 'extendai_dashboard_status', description: 'Get dashboard status (sessions, todos, agents)', inputSchema: { type: 'object', properties: {} } },
      ],
    };
  }

  if (m.method === 'tools/call') {
    const params = m.params as Record<string, unknown> | undefined;
    const name = params?.name as string;
    const args = (params?.arguments ?? {}) as Record<string, unknown>;

    switch (name) {
      case 'extendai_list_skills': {
        const skills = listSkills(args.category as string | undefined);
        return { content: [{ type: 'text', text: JSON.stringify(skills, null, 2) }] };
      }
      case 'extendai_read_plan': {
        return { content: [{ type: 'text', text: `Plan reading available at http://${HOST}:${PORT}/plans` }] };
      }
      case 'extendai_list_checkpoints': {
        return { content: [{ type: 'text', text: `Checkpoints available at http://${HOST}:${PORT}/dashboard` }] };
      }
      case 'extendai_dashboard_status': {
        return { content: [{ type: 'text', text: JSON.stringify({ sessions: connectedSSE.size, uptime: process.uptime() }) }] };
      }
      default:
        return { error: `unknown tool: ${name}` };
    }
  }

  return { error: 'unsupported method' };
}

// ── Skills listing ───────────────────────────────────
function listSkills(category?: string) {
  const all = [
    { name: 'doc-kami-parchment', category: 'document', description: '暖羊皮纸文档系统' },
    { name: 'article-magazine', category: 'document', description: '杂志文章模板' },
    { name: 'resume-modern', category: 'document', description: '现代简历模板' },
    { name: 'deck-guizang-editorial', category: 'deck', description: '编辑墨水 PPT' },
    { name: 'deck-swiss-international', category: 'deck', description: '瑞士国际主义 PPT' },
    { name: 'deck-open-slide-canvas', category: 'deck', description: '开放幻灯片画布' },
    { name: 'finance-report', category: 'office', description: '财务报告' },
    { name: 'pm-spec', category: 'office', description: 'PM 规格书' },
    { name: 'eng-runbook', category: 'office', description: '工程 runbook' },
    { name: 'team-okrs', category: 'office', description: '团队 OKR' },
    { name: 'saas-landing', category: 'proto', description: 'SaaS landing page' },
    { name: 'prototype-web', category: 'proto', description: 'Web 原型' },
    { name: 'card-twitter', category: 'social', description: 'Twitter/X 卡片' },
    { name: 'card-xiaohongshu', category: 'social', description: '小红书卡片' },
  ];
  if (category) return all.filter((s) => s.category === category);
  return all;
}

// ── HTTP Route handler ───────────────────────────────
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // SSE endpoint
  if (path === '/api/sse') {
    return new Response(
      new ReadableStream({
        start(ctrl) {
          connectedSSE.add(ctrl);
          ctrl.enqueue(new TextEncoder().encode(`event: connected\ndata: {}\n\n`));
        },
        cancel(ctrl) { connectedSSE.delete(ctrl); },
      }),
      { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } },
    );
  }

  // API: broadcast event from MCP tools
  if (path === '/api/broadcast' && req.method === 'POST') {
    try {
      const body = await req.json() as { event: string; data: unknown };
      broadcastSSE(body.event, body.data);
      return Response.json({ ok: true });
    } catch {
      return Response.json({ ok: false }, { status: 400 });
    }
  }

  // API: save config
  if (path === '/api/config/save' && req.method === 'POST') {
    try {
      const body = await req.json() as { scope: 'project' | 'global'; config: Record<string, unknown> };
      const configPath = body.scope === 'project'
        ? join(workspaceRoot, '.opencode', 'extendai-lab.json')
        : resolve(process.env.APPDATA ?? process.env.HOME ?? '', '.config', 'opencode', 'extendai-lab.json');

      // Backup
      try {
        const existing = await readFile(configPath, 'utf8');
        await writeFile(configPath + '.bak', existing);
      } catch { /* no existing file */ }

      await mkdir(join(configPath, '..'), { recursive: true });
      await writeFile(configPath, JSON.stringify(body.config, null, 2));
      return Response.json({ ok: true, message: 'Saved. Restart OpenCode to apply.', path: configPath });
    } catch (e) {
      return Response.json({ ok: false, error: String(e) }, { status: 500 });
    }
  }

  // API: read config
  if (path === '/api/config/read') {
    const scope = url.searchParams.get('scope') ?? 'project';
    const configPath = scope === 'project'
      ? join(workspaceRoot, '.opencode', 'extendai-lab.json')
      : resolve(process.env.APPDATA ?? process.env.HOME ?? '', '.config', 'opencode', 'extendai-lab.json');
    try {
      const raw = await readFile(configPath, 'utf8');
      return Response.json(JSON.parse(raw));
    } catch {
      return Response.json({ error: 'config not found' }, { status: 404 });
    }
  }

  // Pages
  if (path === '/' || path === '/dashboard') return new Response(renderDashboard({ sessions: connectedSSE.size }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  if (path === '/docs') {
    const docs = await scanDocFolders(workspaceRoot);
    return new Response(await renderDocs(docs), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (path === '/skills') return new Response(renderSkills(listSkills()), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  if (path === '/plans') {
    const plansDir = join(workspaceRoot, '.opencode', 'extendai-lab', 'plans');
    const plans = await listDir(plansDir);
    return new Response(renderPlans(plans), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (path === '/config/project' || path === '/config/global') {
    const scope = path.includes('global') ? 'global' : 'project';
    const configPath = scope === 'project'
      ? join(workspaceRoot, '.opencode', 'extendai-lab.json')
      : resolve(process.env.APPDATA ?? process.env.HOME ?? '', '.config', 'opencode', 'extendai-lab.json');
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(await readFile(configPath, 'utf8')); } catch { /* use empty */ }
    return new Response(renderConfigEditor(config, scope, configPath), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // Style
  if (path === '/style.css') return new Response(STYLE_CSS, { headers: { 'Content-Type': 'text/css' } });

  return new Response(renderErrorPage('Not found'), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ── CSS ──────────────────────────────────────────────
const STYLE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font:14px/1.6 system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9}
nav{background:#161b22;padding:12px 24px;display:flex;gap:20px;border-bottom:1px solid #30363d}
nav a{color:#58a6ff;text-decoration:none;font-weight:500}
nav a:hover{color:#79c0ff}
main{padding:24px;max-width:1200px;margin:0 auto}
h1{font-size:22px;margin-bottom:16px;color:#f0f6fc}
.card{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:16px;margin-bottom:12px}
.card h3{margin-bottom:8px;color:#58a6ff}
.card p{color:#8b949e;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.status{margin-bottom:16px;color:#8b949e;font-size:13px}
form label{display:block;margin-bottom:12px;color:#c9d1d9}
form input,form select,form textarea{width:100%;padding:8px 12px;background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;font:inherit}
form input:focus,form select:focus{outline:none;border-color:#58a6ff}
button{padding:8px 16px;background:#238636;color:#fff;border:none;border-radius:4px;cursor:pointer;font:inherit}
button:hover{background:#2ea043}
.error{color:#f85149;background:#1f1317;padding:12px;border-radius:4px;margin:12px 0}
`;

// ── Start ────────────────────────────────────────────
async function startServer() {
  // Parse workspace root from args or env
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf('--workspace');
  if (rootIdx >= 0 && args[rootIdx + 1]) {
    workspaceRoot = resolve(args[rootIdx + 1]);
  }
  workspaceRoot = process.env.EXTENDAI_WORKSPACE ?? workspaceRoot;

  console.error(`[extendai-lab] Server starting on http://${HOST}:${PORT}`);
  console.error(`[extendai-lab] Workspace: ${workspaceRoot}`);

  const server = Bun.serve({ port: PORT, hostname: HOST, fetch: handleRequest });

  // Handle MCP protocol on stdin in background
  handleMcpStdio();

  process.on('SIGINT', () => {
    server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    server.stop();
    process.exit(0);
  });
}

function handleMcpStdio() {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const response = handleMcpMessage(msg);
        process.stdout.write(JSON.stringify(response) + '\n');
      } catch {
        // skip invalid lines
      }
    }
  });
}

startServer().catch((err) => {
  console.error('[extendai-lab] Failed to start:', err);
  process.exit(1);
});

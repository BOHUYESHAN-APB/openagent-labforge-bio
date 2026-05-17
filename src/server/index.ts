/**
 * extendai-lab Web Dashboard + MCP Server
 *
 * Single process serving both:
 * - MCP stdio protocol (tools for AI agents)
 * - HTTP @ 127.0.0.1:25569 (web dashboard for humans)
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { appendFile } from 'node:fs/promises';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { renderDashboard, renderDocs, renderSkills, renderPlans, renderConfigEditor, renderErrorPage } from './pages';

// ── Constants ─────────────────────────────────────────
const PORT = 25569;
const HOST = '127.0.0.1';
let workspaceRoot = process.cwd();

// ── Logging ───────────────────────────────────────────
const OPENCODE_LOG_DIR = resolve(homedir(), '.local', 'share', 'opencode');
const PLUGIN_LOG_DIR = resolve(OPENCODE_LOG_DIR, 'extendai-lab');
let logFilePath = '';
let pluginLogPath = '';

function initLogger() {
  try { mkdir(OPENCODE_LOG_DIR, { recursive: true }); } catch { /* ignore */ }
  try { mkdir(PLUGIN_LOG_DIR, { recursive: true }); } catch { /* ignore */ }
  const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  logFilePath = join(OPENCODE_LOG_DIR, `extendai-server.${now}.log`);
  pluginLogPath = join(PLUGIN_LOG_DIR, `server.${now}.log`);
}

async function serverLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { await appendFile(logFilePath, line); } catch { /* ignore */ }
  console.error(msg);
}

async function pluginLog(msg: string, data?: unknown) {
  const line = `[${new Date().toISOString()}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}\n`;
  try { await appendFile(pluginLogPath, line); } catch { /* ignore */ }
}

// ── SSE broadcast ────────────────────────────────────
const connectedSSE = new Set<ReadableStreamDefaultController<Uint8Array>>();

function broadcastSSE(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoded = new TextEncoder().encode(payload);
  for (const ctrl of connectedSSE) {
    try { ctrl.enqueue(encoded); } catch { connectedSSE.delete(ctrl); }
  }
}

// ── Helpers ──────────────────────────────────────────
function getDocDirs(root: string): string[] {
  return ['doc', 'docs', 'document', 'documents'].filter((d) => existsSync(join(root, d)));
}

async function listDir(dir: string): Promise<{ name: string; type: 'file' | 'dir'; path: string }[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, type: e.isDirectory() ? 'dir' as const : 'file' as const, path: relative(workspaceRoot, join(dir, e.name)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch { return []; }
}

async function scanDocFolders(root: string) {
  const dirs = getDocDirs(root);
  const result: { dirName: string; files: Awaited<ReturnType<typeof listDir>> }[] = [];
  for (const d of dirs) {
    const files = await listDir(join(root, d));
    if (files.length > 0) result.push({ dirName: d, files });
  }
  return result;
}

// ── Skills ───────────────────────────────────────────
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
  return category ? all.filter((s) => s.category === category) : all;
}

// ── MCP Tools definition ─────────────────────────────
const mcpTools: Tool[] = [
  {
    name: 'extendai_list_skills',
    description: 'List all available document/design skills',
    inputSchema: { type: 'object', properties: { category: { type: 'string', description: 'Filter: document, deck, social, proto, office' } } },
  },
  {
    name: 'extendai_read_plan',
    description: 'Read a saved plan',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Plan name or "latest"' } } },
  },
  {
    name: 'extendai_list_checkpoints',
    description: 'List session checkpoints',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'extendai_dashboard_status',
    description: 'Get dashboard status (sessions, todos, agents)',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── HTTP handler ─────────────────────────────────────
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/api/sse') {
    return new Response(
      new ReadableStream({
        start(ctrl) { connectedSSE.add(ctrl); ctrl.enqueue(new TextEncoder().encode('event: connected\ndata: {}\n\n')); },
        cancel(ctrl) { connectedSSE.delete(ctrl); },
      }),
      { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } },
    );
  }

  if (path === '/api/config/save' && req.method === 'POST') {
    try {
      const body = await req.json() as { scope: 'project' | 'global'; config: Record<string, unknown> };
      const configPath = body.scope === 'project'
        ? join(workspaceRoot, '.opencode', 'extendai-lab.json')
        : resolve(process.env.APPDATA ?? homedir(), '.config', 'opencode', 'extendai-lab.json');
      try { await writeFile(configPath + '.bak', await readFile(configPath, 'utf8')); } catch { /* no existing */ }
      await mkdir(join(configPath, '..'), { recursive: true });
      await writeFile(configPath, JSON.stringify(body.config, null, 2));
      await serverLog(`Config saved: ${configPath}`);
      return Response.json({ ok: true, message: 'Saved. Restart OpenCode to apply.', path: configPath });
    } catch (e) { return Response.json({ ok: false, error: String(e) }, { status: 500 }); }
  }

  if (path === '/api/config/read') {
    const scope = url.searchParams.get('scope') ?? 'project';
    const configPath = scope === 'project'
      ? join(workspaceRoot, '.opencode', 'extendai-lab.json')
      : resolve(process.env.APPDATA ?? homedir(), '.config', 'opencode', 'extendai-lab.json');
    try { return Response.json(JSON.parse(await readFile(configPath, 'utf8'))); }
    catch { return Response.json({ error: 'config not found' }, { status: 404 }); }
  }

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
      : resolve(process.env.APPDATA ?? homedir(), '.config', 'opencode', 'extendai-lab.json');
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(await readFile(configPath, 'utf8')); } catch { /* empty */ }
    return new Response(renderConfigEditor(config, scope, configPath), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (path === '/style.css') return new Response(CSS, { headers: { 'Content-Type': 'text/css' } });

  return new Response(renderErrorPage('Not found'), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

const CSS = `*{margin:0;padding:0;box-sizing:border-box}body{font:14px/1.6 system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9}nav{background:#161b22;padding:12px 24px;display:flex;gap:20px;border-bottom:1px solid #30363d}nav a{color:#58a6ff;text-decoration:none;font-weight:500}nav a:hover{color:#79c0ff}main{padding:24px;max-width:1200px;margin:0 auto}h1{font-size:22px;margin-bottom:16px;color:#f0f6fc}.card{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:16px;margin-bottom:12px}.card h3{margin-bottom:8px;color:#58a6ff}.card p{color:#8b949e;font-size:13px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}.status{margin-bottom:16px;color:#8b949e;font-size:13px}form label{display:block;margin-bottom:12px;color:#c9d1d9}form input,form select,form textarea{width:100%;padding:8px 12px;background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;font:inherit}form input:focus,form select:focus{outline:none;border-color:#58a6ff}button{padding:8px 16px;background:#238636;color:#fff;border:none;border-radius:4px;cursor:pointer;font:inherit}button:hover{background:#2ea043}.error{color:#f85149;background:#1f1317;padding:12px;border-radius:4px;margin:12px 0}`;

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
async function main() {
  initLogger();

  // Parse workspace
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf('--workspace');
  if (rootIdx >= 0 && args[rootIdx + 1]) workspaceRoot = resolve(args[rootIdx + 1]);
  workspaceRoot = process.env.EXTENDAI_WORKSPACE ?? workspaceRoot;

  await serverLog(`Starting extendai-lab MCP server, workspace: ${workspaceRoot}`);

  // ── MCP Server (stdio) ──────────────────────────────
  const mcp = new McpServer(
    { name: 'extendai-lab', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  mcp.setRequestHandler(ListToolsRequestSchema, async () => {
    await serverLog(`MCP: tools/list → ${mcpTools.length} tools`);
    return { tools: mcpTools };
  });

  mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    await serverLog(`MCP: tools/call → ${name}`);

    switch (name) {
      case 'extendai_list_skills': {
        const skills = listSkills(args?.category as string | undefined);
        return { content: [{ type: 'text' as const, text: JSON.stringify(skills, null, 2) }] };
      }
      case 'extendai_read_plan': {
        return { content: [{ type: 'text' as const, text: `Plan reader available at http://${HOST}:${PORT}/plans` }] };
      }
      case 'extendai_list_checkpoints': {
        return { content: [{ type: 'text' as const, text: `Checkpoints available at http://${HOST}:${PORT}/dashboard` }] };
      }
      case 'extendai_dashboard_status': {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ sessions: connectedSSE.size, uptime: process.uptime() }) }] };
      }
      default:
        return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }], isError: true };
    }
  });

  // ── Start HTTP server ───────────────────────────────
  const httpServer = Bun.serve({ port: PORT, hostname: HOST, fetch: handleRequest });
  await serverLog(`HTTP server listening on http://${HOST}:${PORT}`);

  // ── Connect MCP transport ───────────────────────────
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  await serverLog('MCP transport connected (stdio)');

  process.on('SIGINT', () => { httpServer.stop(); process.exit(0); });
  process.on('SIGTERM', () => { httpServer.stop(); process.exit(0); });
}

main().catch(async (err) => {
  // Log to file before crashing
  try {
    initLogger();
    await serverLog(`FATAL: ${String(err)}`);
  } catch { /* can't log */ }
  console.error('[extendai-lab] Fatal:', err);
  process.exit(1);
});

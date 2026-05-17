/**
 * extendai-lab MCP Server + Web Dashboard v3
 * Shared server: one process across OpenCode windows via lock file.
 */
import { readFile, readdir, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync, writeFileSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { renderDashboard, renderSkillsList, renderSkillDetail, renderDocs, renderDocFile, renderPlans, renderPlanFile, renderConfigEditor, renderError } from './pages';

// ── Constants ─────────────────────────────────────────
const PORT = 25569;
const HOST = '127.0.0.1';
const OPENCODE_LOG_DIR = resolve(homedir(), '.local', 'share', 'opencode');
const PLUGIN_LOG_DIR = resolve(OPENCODE_LOG_DIR, 'extendai-lab');
const LOCK_FILE = join(PLUGIN_LOG_DIR, 'server.lock');

let workspaceRoot = process.cwd();
let pluginRoot: string;
let currentTheme = 'dark';
let logFilePath = '';

// ── Logging ───────────────────────────────────────────
function initLogger() {
  try { mkdir(OPENCODE_LOG_DIR, { recursive: true }); } catch {}
  try { mkdir(PLUGIN_LOG_DIR, { recursive: true }); } catch {}
  const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  logFilePath = join(OPENCODE_LOG_DIR, `extendai-server.${now}.log`);
}
async function srvLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { await appendFile(logFilePath, line); } catch {}
  console.error(msg);
}

// ── Shared server via lock file ──────────────────────
function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function findExistingPort(): number | null {
  try {
    const raw = readFileSync(LOCK_FILE, 'utf8');
    const lock = JSON.parse(raw);
    if (lock.port && lock.pid && isProcessAlive(lock.pid)) return lock.port;
    unlinkSync(LOCK_FILE);
  } catch {}
  return null;
}

// ── Skills scanner ────────────────────────────────────
interface SkillInfo { name: string; category: string; zhName: string; description: string; path: string }

function findSkillDirs(): string[] {
  const dirs: string[] = [];
  const pkgSkills = join(pluginRoot, 'src', 'skills');
  if (existsSync(pkgSkills)) dirs.push(pkgSkills);
  const tpSkills = join(pluginRoot, 'ThirdParty', 'html-anything-skills');
  if (existsSync(tpSkills)) dirs.push(tpSkills);
  for (const d of ['guizang-ppt-skill', 'html-ppt-skill']) {
    const p = join(pluginRoot, 'ThirdParty', d);
    if (existsSync(p)) dirs.push(p);
  }
  return dirs;
}

function scanAllSkills(): SkillInfo[] {
  const result: SkillInfo[] = [];
  for (const dir of findSkillDirs()) {
    try {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name.startsWith('.')) continue;
        const skillDir = join(dir, e.name);
        const skillMd = join(skillDir, 'SKILL.md');
        if (!existsSync(skillMd)) continue;
        try {
          const content = readFileSync(skillMd, 'utf8');
          const fm = content.match(/^---\n([\s\S]*?)\n---/);
          let name = e.name, zhName = e.name, description = '', category = 'other';
          if (fm) {
            const front = fm[1];
            name = (front.match(/^name:\s*(.+)$/m)?.[1] ?? e.name).trim();
            zhName = (front.match(/^zh_name:\s*(.+)$/m)?.[1] ?? front.match(/^description:\s*(.+)$/m)?.[1] ?? name).trim();
            description = (front.match(/^description:\s*(.+)$/m)?.[1] ?? '').trim();
            category = (front.match(/^category:\s*(.+)$/m)?.[1] ?? 'other').trim();
          }
          result.push({ name, zhName, description, category, path: skillDir });
        } catch {}
      }
    } catch {}
  }
  return result.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

// ── Doc helpers ───────────────────────────────────────
function getDocDirs(root: string): string[] {
  return ['doc', 'docs', 'document', 'documents'].filter((d) => existsSync(join(root, d)));
}

async function listDir(dir: string) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => !e.name.startsWith('.')).map((e) => ({
      name: e.name, type: e.isDirectory() ? 'dir' as const : 'file' as const,
      path: join(dir, e.name).replace(workspaceRoot, '').replace(/^[/\\]/, ''),
    })).sort((a, b) => a.name.localeCompare(b.name));
  } catch { return []; }
}

function err(status: number, msg: string) {
  return new Response(renderError(msg, currentTheme), { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any);
}

// ── HTTP handler ──────────────────────────────────────
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  const t = currentTheme;

  try {
    if (p === '/api/theme') { currentTheme = url.searchParams.get('theme') ?? 'dark'; return Response.json({ theme: currentTheme }); }

    if (p.startsWith('/skills/') && p !== '/skills') {
      const name = decodeURIComponent(p.slice(8));
      const skill = scanAllSkills().find((s) => s.name === name);
      if (!skill) return err(404, 'Skill not found');
      const md = existsSync(join(skill.path, 'SKILL.md')) ? readFileSync(join(skill.path, 'SKILL.md'), 'utf8') : '';
      const html = existsSync(join(skill.path, 'example.html')) ? readFileSync(join(skill.path, 'example.html'), 'utf8') : '';
      return new Response(renderSkillDetail(skill.zhName, md, html, t), { headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any);
    }

    if (p === '/docs/file') {
      const fpath = (url.searchParams.get('path') ?? '').replace(/\\/g, '/');
      if (!fpath) return err(400, 'Missing path');
      const fullPath = join(workspaceRoot, ...fpath.split('/'));
      if (!existsSync(fullPath)) return err(404, 'Not found: ' + fpath);
      if (statSync(fullPath).isDirectory()) {
        const entries = readdirSync(fullPath, { withFileTypes: true });
        const files = entries.filter((e) => !e.name.startsWith('.')).map((e) => ({
          name: e.name, type: e.isDirectory() ? 'dir' as const : 'file' as const,
          path: fpath + '/' + e.name,
        })).sort((a, b) => a.name.localeCompare(b.name));
        return new Response(renderDocs([{ dirName: fpath, files }], t), { headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any);
      }
      return new Response(renderDocFile(fpath, readFileSync(fullPath, 'utf8'), t), { headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any);
    }

    if (p === '/plans/file') {
      const fpath = (url.searchParams.get('path') ?? '').replace(/\\/g, '/');
      if (!fpath) return err(400, 'Missing path');
      const fullPath = join(workspaceRoot, ...fpath.split('/'));
      if (!existsSync(fullPath) || statSync(fullPath).isDirectory()) return err(404, 'Not found');
      return new Response(renderPlanFile(fpath, readFileSync(fullPath, 'utf8'), t), { headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any);
    }

    if (p === '/api/config/read') {
      const cp = (url.searchParams.get('scope') ?? 'project') === 'project' ? join(workspaceRoot, '.opencode', 'extendai-lab.json') : resolve(process.env.APPDATA ?? homedir(), '.config', 'opencode', 'extendai-lab.json');
      try { return Response.json(JSON.parse(readFileSync(cp, 'utf8'))); } catch { return Response.json({ error: 'not found' }, { status: 404 }); }
    }

    if (p === '/api/config/save' && req.method === 'POST') {
      const body = await req.json() as { scope: string; config: Record<string, unknown> };
      const cp = body.scope === 'project' ? join(workspaceRoot, '.opencode', 'extendai-lab.json') : resolve(process.env.APPDATA ?? homedir(), '.config', 'opencode', 'extendai-lab.json');
      try { writeFileSync(cp + '.bak', existsSync(cp) ? readFileSync(cp, 'utf8') : '{}'); } catch {}
      await mkdir(dirname(cp), { recursive: true });
      await writeFile(cp, JSON.stringify(body.config, null, 2));
      return Response.json({ ok: true, message: 'Saved. Restart OpenCode.', path: cp });
    }

    if (p === '/' || p === '/dashboard') return new Response(renderDashboard({ sessions: 0 }, t), { headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any);
    if (p === '/skills') return new Response(renderSkillsList(scanAllSkills(), t), { headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any);
    if (p === '/docs') {
      const dirs = getDocDirs(workspaceRoot);
      const docs = await Promise.all(dirs.map(async (d) => ({ dirName: d, files: await listDir(join(workspaceRoot, d)) })));
      return new Response(renderDocs(docs.filter((d) => d.files.length > 0), t), { headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any);
    }
    if (p === '/plans') {
      const plans = await listDir(join(workspaceRoot, '.opencode', 'extendai-lab', 'plans'));
      return new Response(renderPlans(plans, t), { headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any);
    }
    if (p === '/config/project' || p === '/config/global') {
      const scope = p.includes('global') ? 'global' : 'project';
      const cp = scope === 'project' ? join(workspaceRoot, '.opencode', 'extendai-lab.json') : resolve(process.env.APPDATA ?? homedir(), '.config', 'opencode', 'extendai-lab.json');
      let config: Record<string, unknown> = {};
      try { config = JSON.parse(readFileSync(cp, 'utf8')); } catch {}
      return new Response(renderConfigEditor(config, scope, cp, t), { headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any);
    }

    return err(404, 'Not found');
  } catch (e) { return err(500, String(e)); }
}

// ── MCP Tools ─────────────────────────────────────────
const mcpTools: Tool[] = [
  { name: 'extendai_list_skills', description: 'List all document/design skills', inputSchema: { type: 'object', properties: { category: { type: 'string' } } } },
  { name: 'extendai_read_plan', description: 'Read a plan', inputSchema: { type: 'object', properties: { name: { type: 'string' } } } },
  { name: 'extendai_list_checkpoints', description: 'List checkpoints', inputSchema: { type: 'object', properties: {} } },
  { name: 'extendai_dashboard_status', description: 'Dashboard status', inputSchema: { type: 'object', properties: {} } },
];

// ═══════════════════════════════════════════════════════
async function main() {
  initLogger();

  // Parse workspace / plugin root
  const args = process.argv.slice(2);
  const ri = args.indexOf('--workspace');
  if (ri >= 0 && args[ri + 1]) workspaceRoot = resolve(args[ri + 1]);
  workspaceRoot = process.env.EXTENDAI_WORKSPACE ?? workspaceRoot;
  try { pluginRoot = resolve(dirname(new URL(import.meta.url).pathname), '..', '..'); } catch { pluginRoot = process.cwd(); }

  // ── Shared server check ─────────────────────────────
  const existingPort = findExistingPort();
  if (existingPort) {
    // Another server is already running — connect as MCP-only (no HTTP)
    await srvLog(`Using existing server on port ${existingPort}`);
    const mcp = new McpServer({ name: 'extendai-lab', version: '1.0.0' }, { capabilities: { tools: {} } });
    mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpTools }));
    mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, args } = req.params;
      if (name === 'extendai_list_skills') return { content: [{ type: 'text' as const, text: JSON.stringify(scanAllSkills()) }] };
      if (name === 'extendai_dashboard_status') return { content: [{ type: 'text' as const, text: JSON.stringify({ workspace: workspaceRoot, shared: true, port: existingPort }) }] };
      return { content: [{ type: 'text' as const, text: `Done. Dashboard: http://${HOST}:${existingPort}` }] };
    });
    const trans = new StdioServerTransport();
    await mcp.connect(trans);
    await srvLog('MCP connected (shared mode)');
    process.stdin.on('end', () => { srvLog('stdin closed'); process.exit(0); });
    return;
  }

  // ── First instance: start full server ──────────────
  writeFileSync(LOCK_FILE, JSON.stringify({ port: PORT, pid: process.pid }));
  await srvLog(`Starting server on port ${PORT}`);
  const skills = scanAllSkills();
  await srvLog(`Scanned ${skills.length} skills`);

  const mcp = new McpServer({ name: 'extendai-lab', version: '1.0.0' }, { capabilities: { tools: {} } });
  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpTools }));
  mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name } = req.params;
    if (name === 'extendai_list_skills') return { content: [{ type: 'text' as const, text: JSON.stringify(scanAllSkills()) }] };
    if (name === 'extendai_dashboard_status') return { content: [{ type: 'text' as const, text: JSON.stringify({ workspace: workspaceRoot, skills: skills.length, port: PORT }) }] };
    return { content: [{ type: 'text' as const, text: `Dashboard: http://${HOST}:${PORT}` }] };
  });

  Bun.serve({ port: PORT, hostname: HOST, fetch: handleRequest });
  await srvLog(`HTTP: http://${HOST}:${PORT}`);

  const trans = new StdioServerTransport();
  await mcp.connect(trans);
  await srvLog('MCP connected (primary)');

  // Cleanup on stdin close
  process.stdin.on('end', () => {
    srvLog('Parent exited, cleaning up');
    try { unlinkSync(LOCK_FILE); } catch {}
    process.exit(0);
  });
  process.on('SIGINT', () => { try { unlinkSync(LOCK_FILE); } catch {} process.exit(0); });
  process.on('SIGTERM', () => { try { unlinkSync(LOCK_FILE); } catch {} process.exit(0); });
}

main().catch(async (e) => { try { await srvLog(`FATAL: ${e}`); } catch {} console.error(e); process.exit(1); });

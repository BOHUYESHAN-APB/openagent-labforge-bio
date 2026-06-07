/**
 * extendai-lab MCP Server + Web Dashboard v3
 * Shared server: one process across OpenCode windows via lock file.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  academicTools,
  checkTools,
  handleAcademicBuildDocx,
} from '../academic/tools/index.js';
import {
  renderConfigEditor,
  renderDashboard,
  renderDocFile,
  renderDocs,
  renderError,
  renderHtmlPage,
  renderHtmlViewer,
  renderPlanFile,
  renderPlans,
  renderSkillDetail,
  renderSkillsList,
  renderTeamsPage,
  renderSessionsPage,
  renderChangesPage,
  renderExplorePage,
} from './pages';

// ── Constants ─────────────────────────────────────────
// Use fixed port 25569 for predictable dashboard access.
// If port is occupied, Bun.serve will throw an error.
const PORT = 25569;
const HOST = '127.0.0.1';
const OPENCODE_LOG_DIR = resolve(homedir(), '.local', 'share', 'opencode');
const PLUGIN_LOG_DIR = resolve(OPENCODE_LOG_DIR, 'extendai-lab');

let workspaceRoot = process.cwd();
// Determine plugin root from the dist path at module load time (before main)
const _getPluginRoot = () => {
  try {
    return resolve(dirname(new URL(import.meta.url).pathname), '..', '..');
  } catch {
    return process.cwd();
  }
};
const pluginRoot: string = _getPluginRoot();
let currentTheme = 'dark';
let logFilePath = '';

// ── Logging ───────────────────────────────────────────
function initLogger() {
  try {
    mkdir(OPENCODE_LOG_DIR, { recursive: true });
  } catch {}
  try {
    mkdir(PLUGIN_LOG_DIR, { recursive: true });
  } catch {}
  const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  logFilePath = join(OPENCODE_LOG_DIR, `extendai-server.${now}.log`);
}
async function srvLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    await appendFile(logFilePath, line);
  } catch {}
  console.error(msg);
}

// ── Skills scanner ────────────────────────────────────
interface SkillInfo {
  name: string;
  category: string;
  zhName: string;
  description: string;
  path: string;
}

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
          let name = e.name,
            zhName = e.name,
            description = '',
            category = 'other';
          if (fm) {
            const front = fm[1];
            name = (front.match(/^name:\s*(.+)$/m)?.[1] ?? e.name).trim();
            zhName = (
              front.match(/^zh_name:\s*(.+)$/m)?.[1] ??
              front.match(/^description:\s*(.+)$/m)?.[1] ??
              name
            ).trim();
            description = (
              front.match(/^description:\s*(.+)$/m)?.[1] ?? ''
            ).trim();
            category = (
              front.match(/^category:\s*(.+)$/m)?.[1] ?? 'other'
            ).trim();
          }
          result.push({ name, zhName, description, category, path: skillDir });
        } catch {}
      }
    } catch {}
  }
  return result.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}

// ── Doc helpers ───────────────────────────────────────
function getDocDirs(root: string): string[] {
  return ['doc', 'docs', 'document', 'documents'].filter((d) =>
    existsSync(join(root, d)),
  );
}

async function listDir(dir: string) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        type: e.isDirectory() ? ('dir' as const) : ('file' as const),
        path: join(dir, e.name)
          .replace(workspaceRoot, '')
          .replace(/^[/\\]/, ''),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function err(status: number, msg: string) {
  return new Response(renderError(msg, currentTheme), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  } as any);
}

// ── HTTP handler ──────────────────────────────────────
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  const t = currentTheme;

  try {
    if (p === '/api/theme') {
      currentTheme = url.searchParams.get('theme') ?? 'dark';
      return Response.json({ theme: currentTheme });
    }

    if (p.startsWith('/skills/') && p !== '/skills') {
      const name = decodeURIComponent(p.slice(8));
      const skill = scanAllSkills().find((s) => s.name === name);
      if (!skill) return err(404, 'Skill not found');
      const md = existsSync(join(skill.path, 'SKILL.md'))
        ? readFileSync(join(skill.path, 'SKILL.md'), 'utf8')
        : '';
      const html = existsSync(join(skill.path, 'example.html'))
        ? readFileSync(join(skill.path, 'example.html'), 'utf8')
        : '';
      return new Response(renderSkillDetail(skill.zhName, md, html, t), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      } as any);
    }

    if (p === '/docs/file') {
      const fpath = (url.searchParams.get('path') ?? '').replace(/\\/g, '/');
      if (!fpath) return err(400, 'Missing path');
      const fullPath = join(workspaceRoot, ...fpath.split('/'));
      if (!existsSync(fullPath)) return err(404, 'Not found: ' + fpath);
      if (statSync(fullPath).isDirectory()) {
        const entries = readdirSync(fullPath, { withFileTypes: true });
        const files = entries
          .filter((e) => !e.name.startsWith('.'))
          .map((e) => ({
            name: e.name,
            type: e.isDirectory() ? ('dir' as const) : ('file' as const),
            path: fpath + '/' + e.name,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return new Response(renderDocs([{ dirName: fpath, files }], t), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        } as any);
      }
      return new Response(
        renderDocFile(fpath, readFileSync(fullPath, 'utf8'), t),
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any,
      );
    }

    if (p === '/plans/file') {
      const fpath = (url.searchParams.get('path') ?? '').replace(/\\/g, '/');
      if (!fpath) return err(400, 'Missing path');
      const fullPath = join(workspaceRoot, ...fpath.split('/'));
      if (!existsSync(fullPath) || statSync(fullPath).isDirectory())
        return err(404, 'Not found');
      return new Response(
        renderPlanFile(fpath, readFileSync(fullPath, 'utf8'), t),
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any,
      );
    }

    if (p === '/api/config/read') {
      const cp =
        (url.searchParams.get('scope') ?? 'project') === 'project'
          ? join(workspaceRoot, '.opencode', 'extendai-lab.json')
          : resolve(
              process.env.APPDATA ?? homedir(),
              '.config',
              'opencode',
              'extendai-lab.json',
            );
      try {
        return Response.json(JSON.parse(readFileSync(cp, 'utf8')));
      } catch {
        return Response.json({ error: 'not found' }, { status: 404 });
      }
    }

    if (p === '/api/config/save' && req.method === 'POST') {
      const body = (await req.json()) as {
        scope: string;
        config: Record<string, unknown>;
      };
      const cp =
        body.scope === 'project'
          ? join(workspaceRoot, '.opencode', 'extendai-lab.json')
          : resolve(
              process.env.APPDATA ?? homedir(),
              '.config',
              'opencode',
              'extendai-lab.json',
            );
      try {
        writeFileSync(
          cp + '.bak',
          existsSync(cp) ? readFileSync(cp, 'utf8') : '{}',
        );
      } catch {}
      await mkdir(dirname(cp), { recursive: true });
      await writeFile(cp, JSON.stringify(body.config, null, 2));
      return Response.json({
        ok: true,
        message: 'Saved. Restart OpenCode.',
        path: cp,
      });
    }

    if (p === '/' || p === '/dashboard') {
      const skills = scanAllSkills();
      const pagesDir = join(
        workspaceRoot,
        '.opencode',
        'extendai-lab',
        'pages',
      );
      let recentHtml: string[] = [];
      try {
        recentHtml = readdirSync(pagesDir)
          .filter((f) => f.endsWith('.html'))
          .slice(-6);
      } catch {}
      return new Response(
        renderDashboard(t, {
          skills: skills.length,
          workspace: workspaceRoot,
          port: PORT,
          recentHtml,
        }),
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any,
      );
    }
    if (p === '/view')
      return new Response(renderHtmlViewer(t), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      } as any);
    if (p.startsWith('/view/')) {
      const name = decodeURIComponent(p.slice(6));
      const pagesDir = join(
        workspaceRoot,
        '.opencode',
        'extendai-lab',
        'pages',
      );
      const fp = join(pagesDir, name);
      if (!existsSync(fp)) return err(404, 'Page not found: ' + name);
      return new Response(renderHtmlPage(name, readFileSync(fp, 'utf8'), t), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      } as any);
    }
    if (p === '/api/html-pages') {
      const pagesDir = join(
        workspaceRoot,
        '.opencode',
        'extendai-lab',
        'pages',
      );
      try {
        return Response.json(
          readdirSync(pagesDir).filter((f) => f.endsWith('.html')),
        );
      } catch {
        return Response.json([]);
      }
    }
    if (p === '/skills')
      return new Response(renderSkillsList(scanAllSkills(), t), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      } as any);
    if (p === '/docs') {
      const dirs = getDocDirs(workspaceRoot);
      const docs = await Promise.all(
        dirs.map(async (d) => ({
          dirName: d,
          files: await listDir(join(workspaceRoot, d)),
        })),
      );
      return new Response(
        renderDocs(
          docs.filter((d) => d.files.length > 0),
          t,
        ),
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any,
      );
    }
    if (p === '/plans') {
      const plans = await listDir(
        join(workspaceRoot, '.opencode', 'extendai-lab', 'plans'),
      );
      return new Response(renderPlans(plans, t), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      } as any);
    }
    if (p === '/teams') {
      try {
        const { listAllTeamStatuses } = await import('../features/team-mode/team-runtime/status.js');
        const config = {} as any;
        const teams = await listAllTeamStatuses(config);
        return new Response(renderTeamsPage(teams, t), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        } as any);
      } catch {
        return new Response(renderTeamsPage([], t), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        } as any);
      }
    }
    if (p === '/sessions') {
      const boulderFile = join(workspaceRoot, '.opencode', 'extendai-lab', 'boulder.json');
      const plansDir = join(workspaceRoot, '.opencode', 'extendai-lab', 'plans');
      let boulder = {};
      if (existsSync(boulderFile)) {
        try { boulder = JSON.parse(readFileSync(boulderFile, 'utf8')); } catch {}
      }
      const plans = existsSync(plansDir)
        ? readdirSync(plansDir).filter(f => f.endsWith('.md')).map(f => {
            const content = readFileSync(join(plansDir, f), 'utf8');
            const total = (content.match(/- \[ \]/g) || []).length;
            const completed = (content.match(/- \[x\]/g) || []).length;
            return { name: f, total, completed };
          })
        : [];
      return new Response(renderSessionsPage({ boulder, plans }, t), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      } as any);
    }
    if (p === '/changes') {
      const changesDir = join(workspaceRoot, '.opencode', 'extendai-lab', 'changes');
      let changes: any[] = [];
      try {
        changes = readdirSync(changesDir, { withFileTypes: true })
          .filter(e => e.isDirectory())
          .map(e => {
            const statusFile = join(changesDir, e.name, 'status.json');
            try {
              const status = JSON.parse(readFileSync(statusFile, 'utf8'));
              return { name: e.name, ...status };
            } catch {
              return { name: e.name, status: 'unknown' };
            }
          });
      } catch {}
      return new Response(renderChangesPage(changes, t), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      } as any);
    }
    if (p === '/explore') {
      const exploreDir = join(workspaceRoot, '.opencode', 'extendai-lab', 'explore');
      let explorations: any[] = [];
      try {
        explorations = readdirSync(exploreDir, { withFileTypes: true })
          .filter(e => e.isDirectory())
          .map(e => {
            const contextFile = join(exploreDir, e.name, 'context.json');
            try {
              const context = JSON.parse(readFileSync(contextFile, 'utf8'));
              return { name: e.name, ...context };
            } catch {
              return { name: e.name };
            }
          });
      } catch {}
      return new Response(renderExplorePage(explorations, t), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      } as any);
    }
    if (p === '/config/project' || p === '/config/global') {
      const scope = p.includes('global') ? 'global' : 'project';
      const cp =
        scope === 'project'
          ? join(workspaceRoot, '.opencode', 'extendai-lab.json')
          : resolve(
              process.env.APPDATA ?? homedir(),
              '.config',
              'opencode',
              'extendai-lab.json',
            );
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(readFileSync(cp, 'utf8'));
      } catch {}
      return new Response(renderConfigEditor(config, scope, cp, t), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      } as any);
    }
    // TODO: Implement papers library page (P1 priority)
    // if (p === '/papers') {
    //   const { loadPaperDatabase } = await import('../academic/tools/index.js');
    //   const papers = loadPaperDatabase(workspaceRoot);
    //   return new Response(renderPapersLibrary(papers, t), { headers: { 'Content-Type': 'text/html; charset=utf-8' } } as any);
    // }

    // ── Team Agent API ──────────────────────────────────
    if (p === '/api/teams') {
      try {
        // Use the enhanced status aggregation
        const { listAllTeamStatuses } = await import('../features/team-mode/team-runtime/status.js');
        const config = {} as any; // TODO: load actual config
        const teams = await listAllTeamStatuses(config);
        return Response.json({ teams });
      } catch (error) {
        // Fallback to file-based status
        const teamsDir = join(workspaceRoot, '.opencode', 'extendai-lab', 'teams');
        try {
          const teams = readdirSync(teamsDir, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => {
              const statusFile = join(teamsDir, e.name, 'status.json');
              try {
                const status = JSON.parse(readFileSync(statusFile, 'utf8'));
                return { name: e.name, ...status };
              } catch {
                return { name: e.name, status: 'unknown' };
              }
            });
          return Response.json({ teams });
        } catch {
          return Response.json({ teams: [] });
        }
      }
    }

    if (p.startsWith('/api/teams/') && !p.includes('/tasks') && !p.includes('/messages')) {
      // Get specific team status
      const teamRunId = p.split('/')[3];
      try {
        const { aggregateStatus } = await import('../features/team-mode/team-runtime/status.js');
        const config = {} as any; // TODO: load actual config
        const status = await aggregateStatus(teamRunId, config);
        if (status) {
          return Response.json(status);
        }
        return Response.json({ error: 'Team not found' }, { status: 404 });
      } catch {
        return Response.json({ error: 'Failed to get team status' }, { status: 500 });
      }
    }

    if (p.startsWith('/api/teams/') && p.includes('/tasks')) {
      const teamName = p.split('/')[3];
      const tasksFile = join(workspaceRoot, '.opencode', 'extendai-lab', 'teams', teamName, 'tasks.json');
      try {
        const tasks = JSON.parse(readFileSync(tasksFile, 'utf8'));
        return Response.json({ team: teamName, tasks });
      } catch {
        return Response.json({ team: teamName, tasks: [] });
      }
    }

    if (p.startsWith('/api/teams/') && p.includes('/messages')) {
      const teamName = p.split('/')[3];
      const messagesFile = join(workspaceRoot, '.opencode', 'extendai-lab', 'teams', teamName, 'messages.json');
      try {
        const messages = JSON.parse(readFileSync(messagesFile, 'utf8'));
        return Response.json({ team: teamName, messages });
      } catch {
        return Response.json({ team: teamName, messages: [] });
      }
    }

    // ── Session-to-Team Registry API ────────────────────
    if (p === '/api/team-sessions') {
      try {
        const { getAllTeamSessions } = await import('../features/team-mode/team-runtime/session-to-team-registry.js');
        const sessions = getAllTeamSessions();
        return Response.json({ sessions });
      } catch {
        return Response.json({ sessions: [] });
      }
    }

    // ── Session Status API ──────────────────────────────
    if (p === '/api/sessions') {
      const boulderFile = join(workspaceRoot, '.opencode', 'extendai-lab', 'boulder.json');
      const plansDir = join(workspaceRoot, '.opencode', 'extendai-lab', 'plans');
      try {
        let boulder = {};
        if (existsSync(boulderFile)) {
          boulder = JSON.parse(readFileSync(boulderFile, 'utf8'));
        }
        const plans = existsSync(plansDir)
          ? readdirSync(plansDir)
              .filter(f => f.endsWith('.md'))
              .map(f => {
                const content = readFileSync(join(plansDir, f), 'utf8');
                const total = (content.match(/- \[ \]/g) || []).length;
                const completed = (content.match(/- \[x\]/g) || []).length;
                return { name: f, total, completed };
              })
          : [];
        return Response.json({ boulder, plans });
      } catch {
        return Response.json({ boulder: {}, plans: [] });
      }
    }

    if (p === '/api/sessions/active') {
      const boulderFile = join(workspaceRoot, '.opencode', 'extendai-lab', 'boulder.json');
      try {
        if (existsSync(boulderFile)) {
          const boulder = JSON.parse(readFileSync(boulderFile, 'utf8'));
          return Response.json({ active: true, ...boulder });
        }
        return Response.json({ active: false });
      } catch {
        return Response.json({ active: false });
      }
    }

    // ── Changes API ─────────────────────────────────────
    if (p === '/api/changes') {
      const changesDir = join(workspaceRoot, '.opencode', 'extendai-lab', 'changes');
      try {
        const changes = readdirSync(changesDir, { withFileTypes: true })
          .filter(e => e.isDirectory())
          .map(e => {
            const statusFile = join(changesDir, e.name, 'status.json');
            try {
              const status = JSON.parse(readFileSync(statusFile, 'utf8'));
              return { name: e.name, ...status };
            } catch {
              return { name: e.name, status: 'unknown' };
            }
          });
        return Response.json({ changes });
      } catch {
        return Response.json({ changes: [] });
      }
    }

    // ── Explore API ─────────────────────────────────────
    if (p === '/api/explore') {
      const exploreDir = join(workspaceRoot, '.opencode', 'extendai-lab', 'explore');
      try {
        const explorations = readdirSync(exploreDir, { withFileTypes: true })
          .filter(e => e.isDirectory())
          .map(e => {
            const contextFile = join(exploreDir, e.name, 'context.json');
            try {
              const context = JSON.parse(readFileSync(contextFile, 'utf8'));
              return { name: e.name, ...context };
            } catch {
              return { name: e.name };
            }
          });
        return Response.json({ explorations });
      } catch {
        return Response.json({ explorations: [] });
      }
    }

    return err(404, 'Not found');
  } catch (e) {
    return err(500, String(e));
  }
}

// ── MCP Tools ─────────────────────────────────────────
const mcpTools: Tool[] = [
  {
    name: 'extendai_list_skills',
    description: 'List all document/design skills',
    inputSchema: {
      type: 'object',
      properties: { category: { type: 'string' } },
    },
  },
  {
    name: 'extendai_read_plan',
    description: 'Read a plan',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
  },
  {
    name: 'extendai_list_checkpoints',
    description: 'List checkpoints',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'extendai_dashboard_status',
    description: 'Dashboard status',
    inputSchema: { type: 'object', properties: {} },
  },
  ...academicTools,
];

// ═══════════════════════════════════════════════════════
async function main() {
  initLogger();

  // Parse workspace / plugin root
  const args = process.argv.slice(2);
  const ri = args.indexOf('--workspace');
  if (ri >= 0 && args[ri + 1]) workspaceRoot = resolve(args[ri + 1]);
  workspaceRoot = process.env.EXTENDAI_WORKSPACE ?? workspaceRoot;

  // Track actual port assigned by the OS
  let actualPort = PORT;

  // ── Start independent server (no sharing) ───────────
  // Each OpenCode window gets its own MCP server instance.
  // stdio transport is 1:1, so sharing doesn't work.
  await srvLog('Starting independent server with dynamic port');
  const skills = scanAllSkills();
  await srvLog(`Scanned ${skills.length} skills`);

  const mcp = new McpServer(
    { name: 'extendai-lab', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mcpTools,
  }));
  mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: toolArgs } = req.params;
    if (name === 'extendai_list_skills')
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(scanAllSkills()) },
        ],
      };
    if (name === 'extendai_dashboard_status')
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              workspace: workspaceRoot,
              skills: skills.length,
              port: actualPort,
            }),
          },
        ],
      };

    // Academic tools
    if (name === 'academic_check_tools') {
      const tools = (toolArgs as any)?.tools;
      const results = await checkTools(tools);
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(results, null, 2) },
        ],
      };
    }
    if (name === 'academic_build_docx') {
      const docxPath = await handleAcademicBuildDocx(toolArgs as any);
      return {
        content: [
          { type: 'text' as const, text: `DOCX generated: ${docxPath}` },
        ],
      };
    }

    return {
      content: [
        { type: 'text' as const, text: `Dashboard: http://${HOST}:${actualPort}` },
      ],
    };
  });

  const server = Bun.serve({ port: PORT, hostname: HOST, fetch: handleRequest });
  actualPort = server.port ?? 0;
  await srvLog(`HTTP: http://${HOST}:${actualPort}`);

  const trans = new StdioServerTransport();
  await mcp.connect(trans);
  await srvLog('MCP connected (primary)');

  // Cleanup on stdin close
  process.stdin.on('end', () => {
    srvLog('Parent exited, cleaning up');
    process.exit(0);
  });
  process.on('SIGINT', () => {
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    process.exit(0);
  });
}

main().catch(async (e) => {
  try {
    await srvLog(`FATAL: ${e}`);
  } catch {}
  console.error(e);
  process.exit(1);
});

# Agent Coding Guidelines

This document provides guidelines for AI agents operating in this repository.

## Project Overview

**oh-my-opencode-slim** - A lightweight agent orchestration plugin for OpenCode, a slimmed-down fork of oh-my-opencode. Built with TypeScript, Bun, and Biome.

## Commands

| Command | Description |
|---------|-------------|
| `bun run build` | Build TypeScript to `dist/` (both index.ts and cli/index.ts) |
| `bun run typecheck` | Run TypeScript type checking without emitting |
| `bun test` | Run all tests with Bun |
| `bun run lint` | Run Biome linter on entire codebase |
| `bun run format` | Format entire codebase with Biome |
| `bun run check` | Run Biome check with auto-fix (lint + format + organize imports) |
| `bun run check:ci` | Run Biome check without auto-fix (CI mode) |
| `bun run dev` | Build and run with OpenCode |

**Running a single test:** Use Bun's test filtering with the `-t` flag:
```bash
bun test -t "test-name-pattern"
```

## Code Style

### General Rules
- **Formatter/Linter:** Biome (configured in `biome.json`)
- **Line width:** 80 characters
- **Indentation:** 2 spaces
- **Line endings:** LF (Unix)
- **Quotes:** Single quotes in JavaScript/TypeScript
- **Trailing commas:** Always enabled

### TypeScript Guidelines
- **Strict mode:** Enabled in `tsconfig.json`
- **No explicit `any`:** Generates a linter warning (disabled for test files)
- **Module resolution:** `bundler` strategy
- **Declarations:** Generate `.d.ts` files in `dist/`

### Imports
- Biome auto-organizes imports on save (`organizeImports: "on"`)
- Let the formatter handle import sorting
- Use path aliases defined in TypeScript configuration if present

### Naming Conventions
- **Variables/functions:** camelCase
- **Classes/interfaces:** PascalCase
- **Constants:** SCREAMING_SNAKE_CASE
- **Files:** kebab-case for most, PascalCase for React components

### Error Handling
- Use typed errors with descriptive messages
- Let errors propagate appropriately rather than catching silently
- Use Zod for runtime validation (already a dependency)

### Git Integration
- Biome integrates with git (VCS enabled)
- Commits should pass `bun run check:ci` before pushing

## Project Structure

```
oh-my-opencode-slim/
├── src/
│   ├── agents/       # Agent factories (orchestrator, explorer, oracle, etc.)
│   ├── cli/          # CLI entry point
│   ├── commands/     # Slash command templates (/ol-checkpoint, /ol-grill, etc.)
│   ├── config/       # Constants, schemas, MCP defaults
│   ├── council/      # Council manager (multi-LLM session orchestration)
│   ├── hooks/        # OpenCode lifecycle hooks
│   ├── mcp/          # MCP server definitions
│   ├── multiplexer/  # Tmux/Zellij pane integration for child sessions
│   ├── skills/       # Skill definitions (included in package publish)
│   ├── template-skills/ # Template skill system (category-based loading)
│   ├── tools/        # Tool definitions (council, webfetch, AST-grep, etc.)
│   └── utils/        # Shared utilities (tmux, session helpers)
├── ThirdParty/       # Third-party skills (HTML templates, PPT generators)
├── resources/        # Bio skills and academic skills
├── dist/             # Built JavaScript and declarations
├── docs/             # User-facing documentation
├── biome.json        # Biome configuration
├── tsconfig.json     # TypeScript configuration
└── package.json      # Project manifest and scripts
```

## Skill Registration — Three Methods

This plugin uses three distinct methods to register skills. Understanding which method to use is critical.

### Method 1: Standard Registration (`configSkills.paths`)

Skills in directories listed in `configSkills.paths` are **fully exposed** — they appear in the user's skill list AND the AI can load them via the `skill` tool.

**Use for:** Skills that users may actively trigger via `/skill-name` (complete workflows).

**Currently registered:** `src/skills/` only (academic-writing, team-mode, agent-browser, playwright, dev-browser, git-master, frontend-ui-ux, etc.)

### Method 2: Tool-Based Loading (`load_skill_template` / `load_bio_skills`)

Skills loaded on-demand by the AI via dedicated tools. **Not exposed to users** — the AI sees only the tool description with category names.

**Use for:** Template collections, domain-specific toolkits, anything with many variants that would overwhelm the user.

**Implementation:** See `src/template-skills/` (template skills) and `src/bio-skills/` (bioinformatics).

**Categories:**
- `html-deck` — HTML presentations (html-ppt, guizang-ppt)
- `html-templates` — 70+ HTML page templates (dashboards, landing pages, cards, etc.)
- `academic-tools` — Academic tools (CNKI parser, citation matching, MD→DOCX, LaTeX)
- Bio skills: 442 skills across 64 categories via `load_bio_skills`

### Method 3: Built-in Prompts (TS code / agent system prompt)

Skills whose content is embedded directly in agent prompts or TypeScript code. **Not exposed to users, not loaded via tools** — always available to the agent.

**Use for:** Behavioral guidelines, coding philosophy, internal conventions that agents should always follow.

**Examples:** `code-philosophy`, `frontend-philosophy`, `karpathy-guidelines`, `plan-protocol`, `document-formatting`

### How to Add a New Skill

1. **Determine the method:** Is it user-triggered (Method 1)? Template/tool (Method 2)? Always-on guidance (Method 3)?
2. **Method 1:** Add SKILL.md to `src/skills/<name>/`. It auto-registers via `configSkills.paths`.
3. **Method 2:** Add SKILL.md to the appropriate `ThirdParty/` or `resources/` directory. Add the directory to `TEMPLATE_SKILL_CATEGORIES` in `src/template-skills/catalog.ts`. The tool handles the rest.
4. **Method 3:** Embed content in agent prompts or create a command template in `src/commands/`.

## Key Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `@opencode-ai/sdk` - OpenCode AI SDK
- `zod` - Runtime validation

## Development Workflow

1. Make code changes
2. Update docs when behavior, commands, configuration, workflows, or user-facing output changes
   - Check `README.md` plus relevant files in `docs/`
   - Keep examples, command snippets, and feature lists in sync with the code
   - If no doc update is needed, explicitly confirm that in your final summary
3. Run `bun run check:ci` to verify linting and formatting
4. Run `bun run typecheck` to verify types
5. Run `bun test` to verify tests pass
6. Commit changes

## Tmux Session Lifecycle Management

When working with tmux integration, understanding the session lifecycle is crucial for preventing orphaned processes and ghost panes.

### Session Lifecycle Flow

```
Task Launch:
  session.create() → tmux pane spawned → task runs

Task Completes Normally:
  session.status (idle) → extract results → session.abort()
  → session.deleted event → tmux pane closed

Task Cancelled:
  cancel() → session.abort() → session.deleted event
  → tmux pane closed

Session Deleted Externally:
  session.deleted event → task cleanup → tmux pane closed
```

### Key Implementation Details

**1. Graceful Shutdown (src/utils/tmux.ts)**
```typescript
// Always send Ctrl+C before killing pane
spawn([tmux, "send-keys", "-t", paneId, "C-c"])
await delay(250)
spawn([tmux, "kill-pane", "-t", paneId])
```

**2. Session Abort Timing (src/council/council-manager.ts)**
- Call `session.abort()` AFTER extracting task results
- This ensures content is preserved before session termination
- Triggers `session.deleted` event for cleanup

**3. Event Handlers (src/index.ts)**
The multiplexer session handler must stay wired up:
- `multiplexerSessionManager.onSessionDeleted()` - closes tmux/zellij panes

### Testing Tmux Integration

After making changes to session management:

```bash
# 1. Build the plugin
bun run build

# 2. Run from local fork (in ~/.config/opencode/opencode.jsonc):
# "plugin": ["file:///path/to/oh-my-opencode-slim"]

# 3. Launch test tasks
@explorer count files in src/
@librarian search for Bun documentation

# 4. Verify no orphans
ps aux | grep "opencode attach" | grep -v grep
# Should return 0 processes after tasks complete
```

### Common Issues

**Ghost panes remaining open:**
- Check that `session.abort()` is called after result extraction
- Verify `session.deleted` handler is wired in src/index.ts

**Orphaned opencode attach processes:**
- Ensure graceful shutdown sends Ctrl+C before kill-pane
- Check that tmux pane closes before process termination

## Pre-Push Code Review

Before pushing changes to the repository, always run a code review to catch issues like:
- Duplicate code
- Redundant function calls
- Race conditions
- Logic errors

### Using `/review` Command (Recommended)

OpenCode has a built-in `/review` command that automatically performs comprehensive code reviews:

```bash
# Review uncommitted changes (default)
/review

# Review specific commit
/review <commit-hash>

# Review branch comparison
/review <branch-name>

# Review PR
/review <pr-url-or-number>
```

**Why use `/review` instead of asking @oracle manually?**
- Standardized review process with consistent focus areas (bugs, structure, performance)
- Automatically handles git operations (diff, status, etc.)
- Context-aware: reads full files and convention files (AGENTS.md, etc.)
- Delegates to specialized @build subagent with proper permissions
- Provides actionable, matter-of-fact feedback

### Workflow Before Pushing

1. **Make your changes**
   ```bash
   # ... edit files ...
   ```

2. **Stage changes**
   ```bash
   git add .
   ```

3. **Run code review**
   ```
   /review
   ```

4. **Address any issues found**

5. **Run checks**
   ```bash
   bun run check:ci
   bun test
   ```

6. **Commit and push**
   ```bash
   git commit -m "..."
   git push origin <branch>
   ```

**Note:** The `/review` command found issues in our PR #127 (duplicate code, redundant abort calls) that neither linter nor tests caught. Always use it before pushing!

## Common Patterns

- This is an OpenCode plugin - most functionality lives in `src/`
- The CLI entry point is `src/cli/index.ts`
- The main plugin export is `src/index.ts`
- Agent factories are in `src/agents/` — each agent has its own file + optional `.test.ts`
- Skills are located in `src/skills/` (included in package publish)
- Multiplexer session management is in `src/multiplexer/`
- Council manager (multi-LLM orchestration) is in `src/council/`
- Tmux utilities are in `src/utils/tmux.ts`
- 468 tests across 35 files — run `bun test` to verify

## Repository Map

A full codemap is available at `codemap.md` in the project root.

Before working on any task, read `codemap.md` to understand:
- Project architecture and entry points
- Directory responsibilities and design patterns
- Data flow and integration points between modules

For deep work on a specific folder, also read that folder's `codemap.md`.

## Best Practices (v1.0.24+)

### Command System Architecture

The plugin uses a **dual-trigger command system**:

1. **Hook Trigger** (`command.execute.before`): Intercepts commands, reads files, builds context, injects into `output.parts`
2. **Template Trigger**: OpenCode injects the command's `template` as a prompt to the LLM

**Example**: `/ol-start-work` command
- Hook reads plan file, updates boulder.json, injects execution context
- Template provides workflow instructions
- Both triggers fire for the same command

**Key insight**: Commands are detected correctly. If a command "doesn't work," the issue is usually in the injected context or template content, not the detection mechanism.

### Tool Description Best Practices

Tool descriptions are the **only** way LLMs decide when and how to use tools. Follow these rules:

1. **Be explicit about required behavior**:
   ```typescript
   // ❌ Bad: Vague
   description: "Save a plan to .opencode/extendai-lab/plans/"
   
   // ✅ Good: Explicit
   description: `Save a planner-created markdown plan to .opencode/extendai-lab/plans/
   
   CRITICAL: You MUST use this tool to save the plan. Do NOT output the plan content in the conversation. Do NOT ask the user where to save it.`
   ```

2. **State prohibitions clearly**: Tell the LLM what NOT to do
3. **Provide context**: Explain when to use the tool
4. **One source of truth**: Don't repeat instructions in prompts — put them in the tool description

### Auto-Review System (v1.0.24)

The auto-review system now supports **two modes**:

**Option A: Self-Review (Main Agent Checklist)**
- Use for simple tasks, single-file changes, low-risk work
- Main agent performs review using internal checklist
- No child session spawn = higher cache hit rate, lower cost

**Option B: Delegate to @oracle (Sub-Agent)**
- Use for complex/high-risk work, multi-file refactoring, security-sensitive changes
- Spawns child session (keeps main UI clean for users who prefer it)
- Independent review with fresh context

**Design principle**: Give the LLM the choice. It knows the task complexity better than we do.

### MCP Server Architecture (v1.0.24)

**Before v1.0.24**: Shared server logic (first window works, subsequent windows fail)
**After v1.0.24**: Independent servers (each window gets its own MCP server instance)

**Why the change**: MCP stdio transport is 1:1 — cannot share across processes. Attempting to share causes connection failures in subsequent windows.

**Trade-off**: More server processes vs. reliable multi-window support. We chose reliability.

### Cross-Window State Management

When executing `/ol-start-work` in a **new window** (isolated context):

1. **Hook already did the work**: Plan file located, boulder.json updated, session ID appended
2. **All info is injected**: Plan path, progress, session ID are in the hook-injected context
3. **Don't ask for paths**: The LLM has everything it needs

**Common mistake**: LLM claims it "cannot find the plan" → Actually, the plan path is in the injected context. The LLM should read the context, not ask the user.

**Fix**: Enhanced hook context with explicit "Cross-window state recovery" section (v1.0.24).

### Context Pressure Management

**Current state**: Sessions can reach ~140K tokens, approaching 500K danger threshold.

**Symptoms of context pressure**:
- Hallucinations
- Incorrect responses
- Forgetting earlier instructions
- Context corruption

**Mitigation strategies**:
1. Use checkpoint commands to save state and start fresh sessions
2. Avoid unnecessary verbose output
3. Use `load_agent_instructions` instead of spawning child sessions (preserves cache)
4. Monitor context usage via dashboard

**Future**: Auto checkpoint light (v2.1.0) will automatically manage context pressure.

### Delete Guard Safety

The delete guard intercepts destructive commands in these tools:
- bash, shell, exec, execute_command, powershell
- run_command, system, cmd, terminal (v1.0.24+)

**How it works**:
1. Detects dangerous patterns (rm -rf, Remove-Item, etc.)
2. Replaces command with echo message explaining the block
3. LLM sees the block in tool result
4. LLM must explain to user why the command is needed
5. User approves or denies

**Design principle**: AI proposes, user disposes. Same security model as OpenCode's built-in permission system.

### Tool Description vs. Prompt Injection

**Anti-pattern**: Repeating instructions in prompts
```typescript
// ❌ Bad: Instructions in prompt
const PROMPT = "Remember to save plans using save_plan tool, not output to conversation"
```

**Best practice**: Instructions in tool description
```typescript
// ✅ Good: Instructions in tool description
description: `CRITICAL: You MUST use this tool to save the plan. Do NOT output to conversation.`
```

**Why**: Tool descriptions are stable (high cache hit rate). Prompts change frequently (cache invalidation, token waste).

### Subagent Usage Philosophy

**Main-agent-first principle**: Most work happens in the primary orchestrator.

**When to spawn a child session**:
- User explicitly requests it (wants clean UI)
- Complex/high-risk work needing independent review
- Genuinely need specialist's external knowledge (e.g., @librarian for library docs)

**When NOT to spawn**:
- Simple tasks the main agent can do
- Just need to read specialist's instructions → use `load_agent_instructions`
- Cost-sensitive scenarios (Chinese providers with token-based pricing)

**Trade-off**: Child sessions = 0% cache hit initially. Main agent = 95-100% cache hit.

## Plan Mode System (v1.3.5+)

### Overview

Plan mode allows any main orchestrator (engineer, bio-analyst, chem-analyst, deep-worker) to temporarily switch the active agent to `prometheus` (planner) for structured strategic planning. Prometheus has **read-only access** — it cannot edit files, run commands, or call sub-agents.

### Tools

| Tool | Available to | Effect |
|------|-------------|--------|
| `plan_enter` | engineer, deep-worker, bio-orchestrator, chem-orchestrator | Enters plan mode: saves `returnAgent`, activates plan overlay, sets `output.message.agent` to `prometheus` |
| `plan_exit` | prometheus ONLY | Exits plan mode: clears plan overlay, restores `returnAgent` via `output.message.agent` |

### Agent Switching — Three-Layer Mechanism

The overlay system uses three hook layers to switch the effective agent:

```
1. tool.execute.before / command.execute.before
   → Sets output.message.agent to target agent
   → OpenCode reads lastUser.agent → UI agent display switches

2. experimental.chat.system.transform
   → Detects active overlay → early-returns for prometheus
   → Keeps prometheus system prompt stack isolated from main orchestrator prompt

3. tool.execute.before (deny logic)
   → When plan overlay is active, denies: write, edit, bash, exec,
     execute_command, powershell, shell, task, subtask
   → Prometheus itself cannot call plan_enter (no nested plan mode)
```

### Plan Mode Lifecycle

```
Main agent calls plan_enter
  ↓
tool.execute.before: saves returnAgent, activates plan overlay
  ↓
system.transform: injects PLAN_MODE_INSTRUCTIONS on top of prometheus prompt
  ↓
Prometheus works through 5-phase workflow:
  Phase 1: Analyze requirements
  Phase 2: Research context
  Phase 3: Design solution
  Phase 4: Write structured plan
  Phase 5: Call save_plan then plan_exit
  ↓
plan_exit → clears overlay, restores original agent
  ↓
Original agent receives the saved plan and begins execution
```

### Plan Mode Restrictions

- **Prometheus CAN**: read, glob, grep, webfetch, Question, save_plan, plan_exit
- **Prometheus CANNOT**: write, edit, bash, task, subtask, plan_enter
- The `plan_exit` tool is **mandatory** — if prometheus stops without calling it, the session stays in read-only plan mode

# Skills

Skills are specialized prompt-guidance packages you can assign to agents or load
on demand. Unlike MCPs, which are running servers, skills are instruction bundles
that change **how an agent approaches a task**.

Skills are not the same as `/ol-preset` runtime model presets:

| Concept | Example | Effect |
|---------|---------|--------|
| Runtime preset | `/ol-preset powerful` | Changes agent models/providers/settings |
| Skill / guidance | `/ol-karpathy` or `karpathy-guidelines` | Changes task behavior and review criteria |

ExtendAI Lab bundles several skills locally. Some can also be installed or
managed through the OpenCode/skills ecosystem, but the bundled skills below ship
with this plugin.

---

## Skill Registration — Three Methods

This plugin uses three distinct methods to register skills. Understanding which method to use is critical.

### Method 1: Standard Registration (`configSkills.paths`)

Skills in directories listed in `configSkills.paths` are **fully exposed** — they appear in the user's skill list AND the AI can load them via the `skill` tool.

**Use for:** Skills that users may actively trigger via `/skill-name` (complete workflows).

**Currently registered (24 skills):**

| Skill | Description |
|-------|-------------|
| `academic-writing` | Academic writing workflow with literature management, citation validation, multi-format citations |
| `agent-browser` | Browser automation via agent-browser CLI |
| `ai-slop-remover` | Removes AI-generated code smells |
| `brainstorming` | Socratic design dialogue - explores intent before implementation |
| `cnki-citation` | CNKI export parsing |
| `code-philosophy` | Internal logic and data flow philosophy |
| `code-review` | Comprehensive code review methodology |
| `codemap` | Repository codemap generation |
| `dev-browser` | Browser automation with persistent page state |
| `document-formatting` | DOCX formatting rules (Chinese academic) |
| `frontend-philosophy` | Visual & UI philosophy |
| `frontend-ui-ux` | UI/UX design guidelines |
| `git-master` | Git workflow management |
| `karpathy-guidelines` | Coding behavior guardrails |
| `plan-protocol` | Implementation plan guidelines |
| `plan-review` | Plan review criteria |
| `playwright` | Browser automation via Playwright MCP |
| `playwright-cli` | Browser automation via playwright-cli |
| `receiving-code-review` | Technical rigor when handling review feedback |
| `review-work` | Work review guidelines |
| `simplify` | Behavior-preserving code simplification |
| `systematic-debugging` | 4-phase root cause analysis |
| `team-mode` | Parallel multi-agent coordination |
| `test-driven-development` | RED-GREEN-REFACTOR cycle |

### Method 2: Tool-Based Loading (`load_skill_template` / `load_bio_skills`)

Skills loaded on-demand by the AI via dedicated tools. **Not exposed to users** — the AI sees only the tool description with category names.

**Use for:** Template collections, domain-specific toolkits, anything with many variants that would overwhelm the user.

**Categories:**

| Category | Tool | Skills | Location |
|----------|------|--------|----------|
| `academic-tools` | `load_skill_template` | 9 | `resources/academicSkills/` |
| `html-deck` | `load_skill_template` | 2 | `ThirdParty/html-ppt-skill`, `ThirdParty/guizang-ppt-skill` |
| `html-templates` | `load_skill_template` | 75+ | `ThirdParty/html-anything-skills` |
| Bio skills (89 categories) | `load_bio_skills` | 617 | `resources/bioSkills/` |

**Academic tools breakdown:**

| Skill | Purpose |
|-------|---------|
| `academic-pipeline` | Complete research-to-publication pipeline (6 stages, 7 agents) |
| `cnki-parser` | CNKI export → BibTeX converter |
| `cite-match` | Body-text citation matching engine |
| `md2docx` | Markdown → HTML → DOCX pipeline |
| `latex-pipeline` | LaTeX template + compilation |
| `citation-database` | Local vector database for citations |
| `research-writing-skill` | Paper writing, revision, peer review |
| `office-academic-skill` | Academic Word/PPT generation |
| `scientific-toolkit-skill` | Scientific computing (MATLAB/Python) |

### Method 3: Built-in Prompts (TS code / agent system prompt)

Skills whose content is embedded directly in agent prompts or TypeScript code. **Not exposed to users, not loaded via tools** — always available to the agent.

**Use for:** Behavioral guidelines, coding philosophy, internal conventions that agents should always follow.

**Examples:** `code-philosophy`, `frontend-philosophy`, `karpathy-guidelines`, `plan-protocol`, `document-formatting`

---

## Available Skills

### Recommended (via installer)

| Skill | Description | Assigned to by default |
|-------|-------------|----------------------|
| [`agent-browser`](#agent-browser) | High-performance browser automation | `designer` |

### Bundled in repo

| Skill | Description | Assigned to by default |
|-------|-------------|----------------------|
| [`karpathy-guidelines`](#karpathy-guidelines) | Coding behavior guardrails: think first, keep changes simple, edit surgically, verify goals | On demand via `/ol-karpathy` or skill loading |
| [`simplify`](#simplify) | Behavior-preserving code simplification | `oracle` |
| [`codemap`](#codemap) | Repository codemap generation | `orchestrator` |

---

## karpathy-guidelines

**Behavioral coding guidelines migrated from
[andrej-karpathy-skills](https://github.com/vtroisWhite/andrej-karpathy-skills).**

`karpathy-guidelines` is a bundled skill for reducing common LLM coding mistakes:

1. Think before coding — surface assumptions and ambiguity before editing.
2. Simplicity first — avoid speculative features and unnecessary abstractions.
3. Surgical changes — only touch lines required by the user request.
4. Goal-driven execution — define success criteria and verify them.

There are two ways to use it:

| Method | Use when |
|--------|----------|
| `/ol-karpathy [task-or-review-target]` | You want a user-facing prompt command to apply the guidelines to the current task or review |
| `skill(name="karpathy-guidelines")` | An agent or orchestrator workflow explicitly loads skills |

This skill does **not** switch models or presets. Use `/ol-preset` for runtime model
configuration.

---

## simplify

**Behavior-preserving simplification for readability and maintainability.**

`simplify` is a bundled skill for clarity-focused refactoring without behavior changes. It helps `oracle` reduce unnecessary complexity, improve naming and structure, and keep simplification work scoped and reviewable.

By default, this skill is assigned to `oracle`, which owns code review, maintainability review, and simplification guidance. The `orchestrator` should route simplification requests to `oracle` instead of handling them as a top-level specialty itself.

Source: adapted from Addy Osmani's `code-simplification` skill and bundled locally as `simplify`.

---

## agent-browser

**External browser automation for visual verification and testing.**

`agent-browser` provides full high-performance browser automation. It allows agents to browse the web, interact with page elements, take screenshots, and verify visual state — useful for UI/UX work, end-to-end testing, and researching live documentation.

---

## codemap

**Automated repository mapping through hierarchical codemaps.**

`codemap` empowers the Orchestrator to build and maintain a deep architectural understanding of any codebase. Instead of reading thousands of lines of code on every task, agents refer to hierarchical `codemap.md` files describing the *why* and *how* of each directory.

**How to use:** Ask the Orchestrator to `run codemap`. It automatically detects whether to initialize a new map or update an existing one.

**Why it's useful:**
- **Instant onboarding** — understand unfamiliar codebases in seconds
- **Efficient context** — agents read architectural summaries, saving tokens and improving accuracy
- **Change detection** — only modified folders are re-analyzed
- **Timeless documentation** — focuses on high-level design, not implementation details

See **[Codemap Skill](codemap.md)** for full documentation including manual commands and technical details.

---

## Skills Assignment

Control which skills each agent can use in `~/.config/opencode/extendai-lab.json` (or `.jsonc`):

| Syntax | Meaning |
|--------|---------|
| `["*"]` | All installed skills |
| `["*", "!agent-browser"]` | All skills except `agent-browser` |
| `["simplify"]` | Only `simplify` |
| `[]` | No skills |
| `["!*"]` | Deny all skills |

**Rules:**
- `*` expands to all available installed skills
- `!item` excludes a specific skill
- Conflicts (e.g. `["a", "!a"]`) → deny wins (principle of least privilege)

**Example:**

```json
{
  "presets": {
    "my-preset": {
      "orchestrator": {
        "skills": ["codemap"]
      },
      "oracle": {
        "skills": ["simplify"]
      },
      "designer": {
        "skills": ["agent-browser"]
      },
      "fixer": {
        "skills": []
      }
    }
  }
}
```

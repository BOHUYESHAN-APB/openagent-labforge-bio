# Compatibility Status

## Current State (2026-05-10)

### ✅ Active Development
- **OpenCode Plugin** - Full feature set
  - Todo continuation with auto-review
  - 18 specialized agents (6 primary + 12 subagents)
  - Three-tier prompt system (Heavy/Light/Turbo)
  - Checkpoint-based memory architecture
  - 14 slash commands
  - Bioinformatics capabilities (439 skills, 2 MCPs)
  - MCP server integration
  - Multiplexer support (tmux/zellij)

### ⏸️ On Hold Indefinitely
- **OpenClaude Compatibility** - Code exists but not maintained
- **Codex Compatibility** - Code exists but not maintained
- **Claude Desktop Compatibility** - Code exists but not maintained

## Why On Hold?

The OpenClaude/Codex adapters were developed to explore cross-runtime compatibility, but several challenges emerged:

1. **Feature Gap**: These runtimes lack OpenCode's plugin system, making it impossible to replicate core features like:
   - Event hooks (todo-continuation, auto-review)
   - Runtime session management
   - Dynamic tool registration
   - Context pressure handling

2. **Maintenance Burden**: Maintaining adapters for multiple runtimes diverts resources from improving the core OpenCode experience.

3. **Limited Value**: Without plugin hooks, the adapters can only provide:
   - Static agent files
   - Skill files
   - MCP server configs
   - Basic prompt instructions
   
   This is a significantly degraded experience compared to the full OpenCode plugin.

## What's Preserved?

The codebase retains all adapter code in case future development resumes:

- `src/compat/adapters/` - Runtime adapters (openclaude, codex, claude)
- `src/compat/renderers/` - File rendering logic
- `src/compat/config-writers/` - Config file writers
- `src/cli/compat.ts` - CLI commands for installation
- Tests for all compatibility features

## Future Possibilities

If these runtimes add plugin systems or event hooks in the future, we can resume development. The adapter architecture is designed to be extensible.

For now, **focus is 100% on OpenCode**.

## Branch Strategy

- `master` - OpenCode-focused development (current)
- `feature/compat-openclaude-codex` - Snapshot of compatibility work (frozen)

## Questions?

See [docs/architecture/compatibility-roadmap.md](docs/architecture/compatibility-roadmap.md) for the original compatibility vision.

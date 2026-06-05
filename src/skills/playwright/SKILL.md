---
name: playwright
description: "Browser automation via Playwright MCP server. BEST FOR: complex multi-step browser workflows, testing, scenarios needing full Playwright API. REQUIRES: `browser_puppeteer` MCP server enabled in config. If MCP is not available, use `agent-browser` or `playwright-cli` instead."
---

# Playwright Browser Automation

**When to use this skill**: Complex browser automation needing full Playwright API. Requires `browser_puppeteer` MCP server enabled.

**MCP Setup**: This skill uses the `browser_puppeteer` MCP server. It is **disabled by default**. Enable it in your config:

```jsonc
{
  "enabled_mcps": ["browser_puppeteer"]
}
```

**Other browser skills** (pick the right one):
- `agent-browser` — standalone CLI, no MCP needed (quickest for simple tasks)
- `playwright-cli` — playwright via CLI commands (no MCP)
- `dev-browser` — persistent page state with Node.js scripts

## Quick Start

Once MCP is enabled, the Playwright tools are available directly:
- `browser_navigate` — navigate to URL
- `browser_click` — click element
- `browser_type` — type text
- `browser_screenshot` — take screenshot
- `browser_snapshot` — get page accessibility tree

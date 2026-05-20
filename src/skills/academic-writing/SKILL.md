---
name: academic-writing
description: Academic writing workflow with literature management, citation validation, and Chinese academic formatting
category: academic
---

# Academic Writing Skill

Comprehensive academic writing support for ExtendAI Lab, including literature management, citation validation, document conversion, and Chinese academic formatting (GB/T 7714-2015).

## Core Principles

1. **On-Demand Tool Checking** — Only check tools when the user needs to write a paper, not on every startup
2. **AI Uses Bash for Papis** — Don't use MCP for papis commands; use bash directly to avoid context overhead
3. **MD → HTML → DOCX Pipeline** — Avoid Markdown syntax leakage in final documents
4. **Chinese Academic Formatting** — Follow GB/T 7714-2015 standards

## Available Tools

### 1. `academic_check_tools(tools?)`

Check if academic writing tools are installed.

**When to use:**
- User mentions writing a paper, thesis, or manuscript
- User asks about academic writing setup
- Before running document conversion

**Parameters:**
- `tools` (optional): Array of specific tools to check. If not provided, checks all.
  - Available: `papis`, `pandoc`, `gh`, `python-docx`, `wsl`, `docker`, `xelatex`, `noteexpress`

**Example:**
```typescript
// Check all tools
academic_check_tools()

// Check specific tools
academic_check_tools({ tools: ["papis", "pandoc", "python-docx"] })
```

**Response format:**
```json
{
  "papis": {
    "installed": true,
    "version": "papis 0.13"
  },
  "pandoc": {
    "installed": true,
    "version": "pandoc 3.1.2"
  },
  "python-docx": {
    "installed": false,
    "installCmd": "pip install python-docx"
  }
}
```

### 2. `academic_build_docx(manuscriptPath, options?)`

Generate DOCX from Markdown manuscript using MD → HTML → DOCX pipeline.

**Pipeline:**
1. Pandoc converts MD to HTML (with citation processing if `.bib` file exists)
2. Python script converts HTML to DOCX with Chinese academic formatting

**Parameters:**
- `manuscriptPath` (required): Path to manuscript.md
- `options` (optional):
  - `fontCn`: Chinese font (default: SimSun 宋体)
  - `fontEn`: English/number font (default: Times New Roman)
  - `fontHeading`: Heading font (default: SimHei 黑体)
  - `sizeTitle`: Title font size in pt (default: 16)
  - `sizeHeading`: Heading font size in pt (default: 15)
  - `sizeBody`: Body font size in pt (default: 14)
  - `lineSpacing`: Line spacing multiplier (default: 1.5)

**Example:**
```typescript
academic_build_docx({
  manuscriptPath: "manuscripts/paper.md",
  options: {
    fontCn: "SimSun",
    fontEn: "Times New Roman",
    lineSpacing: 1.5
  }
})
```

## Workflow

### Setup Phase

1. **Check tools** (only when user needs to write):
   ```
   Call academic_check_tools()
   ```

2. **Install missing tools** (guide user):
   - Papis: `pip install papis`
   - Pandoc: https://pandoc.org/installing.html
   - python-docx: `pip install python-docx beautifulsoup4 lxml`

### Literature Management

**Use bash commands directly** (don't create MCP tools for papis):

```bash
# Add paper from DOI
papis add paper.pdf --from doi 10.1234/example

# Add paper from arXiv
papis add --from arxiv 2301.12345

# Search papers
papis list --all

# Open paper
papis open <paper-name>

# Export BibTeX
papis export --all --format bibtex > references.bib
```

### Writing Phase

1. **Create manuscript** in Markdown:
   ```markdown
   # Paper Title
   
   ## Abstract
   
   This paper presents...
   
   ## Introduction
   
   Previous work [@smith2020] has shown...
   
   ## References
   ```

2. **Create bibliography** (if using citations):
   ```bash
   papis export --all --format bibtex > manuscripts/paper.bib
   ```

3. **Validate citations** (manual check):
   - Extract citation keys from manuscript: `[@citationKey]`
   - Check if they exist in `paper.bib`

### Document Generation

1. **Generate DOCX**:
   ```typescript
   academic_build_docx({
     manuscriptPath: "manuscripts/paper.md"
   })
   ```

2. **Output**: `manuscripts/paper.docx` with:
   - Chinese text in SimSun (宋体)
   - English text in Times New Roman
   - Headings in SimHei (黑体)
   - Proper font sizes (16pt title, 15pt headings, 14pt body)
   - 1.5 line spacing
   - Processed citations (if `.bib` file exists)

## Chinese Academic Formatting (GB/T 7714-2015)

### Font Standards

- **Chinese text**: SimSun (宋体)
- **English text and numbers**: Times New Roman
- **Headings**: SimHei (黑体)

### Font Sizes

- **Title**: 三号 (16pt)
- **Headings**: 小三 (15pt)
- **Body**: 四号 (14pt)

### Layout

- **Line spacing**: 1.5
- **Margins**: 1 inch (top/bottom), 1.25 inch (left/right)

### Citations

- Use GB/T 7714-2015 citation style
- Pandoc processes citations with `--citeproc` flag
- Bibliography file: `manuscript.bib` (same name as `.md` file)

## Common Patterns

### Pattern 1: New Paper from Scratch

```
User: "I want to write a paper about machine learning"

AI:
1. Check if tools are installed: academic_check_tools()
2. If missing, guide installation
3. Help user create manuscript.md
4. Guide user to add papers: papis add paper.pdf --from doi <DOI>
5. Export bibliography: papis export --all --format bibtex > paper.bib
6. Generate DOCX: academic_build_docx({ manuscriptPath: "paper.md" })
```

### Pattern 2: Convert Existing Markdown

```
User: "Convert my paper.md to DOCX with Chinese formatting"

AI:
1. Check if pandoc and python-docx are installed
2. Generate DOCX: academic_build_docx({ manuscriptPath: "paper.md" })
3. Inform user of output location
```

### Pattern 3: Custom Formatting

```
User: "Generate DOCX with KaiTi font for Chinese"

AI:
academic_build_docx({
  manuscriptPath: "paper.md",
  options: {
    fontCn: "KaiTi",
    fontEn: "Times New Roman",
    sizeBody: 12
  }
})
```

## Troubleshooting

### Pandoc Not Found

```
Error: Failed to run pandoc. Make sure it is installed.

Solution: Install pandoc from https://pandoc.org/installing.html
```

### python-docx Not Found

```
Error: Missing required library: No module named 'docx'

Solution: pip install python-docx beautifulsoup4 lxml
```

### Citations Not Processed

**Cause**: No `.bib` file found

**Solution**:
1. Export bibliography: `papis export --all --format bibtex > paper.bib`
2. Ensure `.bib` file has same name as `.md` file
3. Re-run `academic_build_docx()`

### Font Not Available

**Cause**: System doesn't have the specified font

**Solution**:
- Windows: Install font from Control Panel → Fonts
- Linux: Install font package (e.g., `fonts-wqy-zenhei` for Chinese)
- macOS: Install font from Font Book

## Environment-Specific Notes

### Windows

- Checks WSL installation for Docker
- NoteExpress detection (GUI app, no CLI)
- Use PowerShell or WSL for bash commands

### WSL

- OpenCode running in WSL checks Docker directly
- Can access Windows file system via `/mnt/c/`

### Linux / macOS

- Direct tool checking
- Standard package managers (apt, brew)

## Future Enhancements (P1)

- `academic_list_papers()` — Visualize paper library
- `academic_validate_citations()` — Automated citation validation
- `academic_detect_missing_citations()` — Suggest citations for uncited sentences
- `academic_build_html_preview()` — Generate HTML preview
- Dashboard `/papers` page — Web-based paper library browser

## References

- GB/T 7714-2015: 信息与文献 参考文献著录规则
- Pandoc Manual: https://pandoc.org/MANUAL.html
- python-docx Documentation: https://python-docx.readthedocs.io/
- Papis Documentation: https://papis.readthedocs.io/

---
name: academic-md2docx
description: Convert Markdown papers to properly formatted DOCX using Pandoc (recommended) or HTML intermediate pipeline. Pandoc is the most reliable tool for academic document conversion with full support for citations, cross-references, templates, and formatting. Use when the user has a Markdown manuscript and needs a formatted Word document.
tool_type: cli
primary_tool: pandoc
---

# Academic MD → DOCX

Convert Markdown academic papers to properly formatted DOCX files using Pandoc.

## Recommended: Pandoc Direct Conversion

**Pandoc is the industry-standard tool for academic document conversion.**
It handles citations, cross-references, templates, and formatting reliably.

### Basic Usage

```bash
# Simple conversion
pandoc paper.md -o paper.docx

# With citation processing
pandoc paper.md --citeproc --bibliography=refs.bib -o paper.docx

# With reference template (recommended for Chinese papers)
pandoc paper.md \
  --reference-doc=template.docx \
  --citeproc \
  --bibliography=refs.bib \
  -o paper.docx
```

### Reference Template (template.docx)

Create a `template.docx` with your desired styles:

1. Open a blank Word document
2. Define styles:
   - **Normal**: SimSun 14pt, 1.5 line spacing
   - **Heading 1**: SimHei 16pt (三号)
   - **Heading 2**: SimHei 15pt (小三)
   - **Heading 3**: SimHei 14pt (四号)
   - **Hyperlink**: Blue, underline (for citations)
3. Save as `template.docx`

Pandoc will apply these styles to the converted document.

### Citation Processing

```bash
# Markdown with citations
pandoc paper.md \
  --citeproc \
  --bibliography=refs.bib \
  --csl=gb-t-7714-2015-numeric.csl \
  -o paper.docx
```

**Citation styles**:
- GB/T 7714-2015: `gb-t-7714-2015-numeric.csl`
- Nature: `nature.csl`
- APA: `apa.csl`

Download CSL files from: https://github.com/citation-style-language/styles

### Cross-References and Hyperlinks

Pandoc preserves Markdown links as Word hyperlinks:

```markdown
See [Section 2](#section-2) for details.

## Section 2 {#section-2}

Content here.
```

This creates clickable cross-references in Word.

### Advanced Options

```bash
# Full example with all options
pandoc paper.md \
  --reference-doc=template.docx \
  --citeproc \
  --bibliography=refs.bib \
  --csl=gb-t-7714-2015-numeric.csl \
  --number-sections \
  --toc \
  --toc-depth=3 \
  --metadata title="论文标题" \
  -o paper.docx
```

**Options explained**:
- `--reference-doc`: Apply Word template styles
- `--citeproc`: Process citations from `.bib` file
- `--bibliography`: BibTeX file path
- `--csl`: Citation style (CSL file)
- `--number-sections`: Auto-number headings (1, 1.1, 1.1.1)
- `--toc`: Generate table of contents
- `--toc-depth`: TOC depth (1-6)
- `--metadata`: Set document metadata

### Filters and Lua Scripts

For advanced formatting, use Pandoc Lua filters:

```bash
pandoc paper.md \
  --lua-filter=chinese-formatting.lua \
  -o paper.docx
```

Example `chinese-formatting.lua`:
```lua
function Para(elem)
  -- Add first-line indent for Chinese paragraphs
  return elem
end
```

## Alternative: HTML Intermediate Pipeline

**Use only when Pandoc is unavailable or specific HTML processing is needed.**

```
paper.md  →  paper.html (pandoc)  →  paper.docx (python-docx)
```

This pipeline has limitations:
- May lose hyperlinks during HTML→DOCX conversion
- Requires manual font/style application via python-docx
- More complex, more error-prone

## Two Pipelines Comparison

| Feature | Pandoc Direct | HTML Intermediate |
|---------|---------------|-------------------|
| **Reliability** | ⭐⭐⭐⭐⭐ Industry standard | ⭐⭐⭐ May have issues |
| **Citations** | ✅ Full `--citeproc` support | ⚠️ Manual processing |
| **Cross-references** | ✅ Preserved as hyperlinks | ❌ Often broken |
| **Templates** | ✅ `--reference-doc` | ⚠️ Manual styling |
| **Formatting** | ✅ CSL + template | ⚠️ python-docx manual |
| **Complexity** | ⭐ Single command | ⭐⭐⭐ Multi-step |
| **Recommendation** | **Use by default** | Use only if Pandoc unavailable |

### When to Use Which

| Situation | Tool | Command |
|-----------|------|---------|
| **Default / Most cases** | **Pandoc** | `pandoc paper.md --reference-doc=template.docx -o paper.docx` |
| Chinese paper with citations | **Pandoc** | `pandoc paper.md --citeproc --bibliography=refs.bib --csl=gb-t-7714-2015-numeric.csl -o paper.docx` |
| Need cross-references | **Pandoc** | `pandoc paper.md --reference-doc=template.docx -o paper.docx` |
| Pandoc not available | HTML pipeline | `python scripts/md2docx.py paper.md --pipeline html` |
| Custom post-processing | HTML pipeline | Use python-docx for manual edits |

## Citation Formatting (Critical)

### Markdown Source Format

```markdown
正文中引用第一篇文献[1]，第二篇文献[2]表达上调。

## 参考文献

[1] 作者A,作者B,作者C,等.论文标题A[J].期刊名称,2026.
[2] 作者D.论文标题B[D].大学名称,2025.
```

**Note**: Use placeholder author/title names. Do NOT invent real-sounding
Chinese names or paper titles — AI may treat them as actual citations.

### Citation Marker Rules

- **Format**: `[1]`, `[2]`, etc. (square brackets + number)
- **Style**: Superscript (上标)
- **Font size**: Same as body text (14pt / 四号)
- **Position**: Immediately after the cited content, before punctuation

### Word Cross-Reference (Pipeline B Recommended)

**python-docx does NOT support Word bookmarks or cross-references natively.**

For working hyperlinks in Word, use **Pipeline B** with Pandoc:

```bash
# Pandoc with citation processing and reference template
pandoc paper.md \
  --reference-doc=template.docx \
  --from markdown \
  --to docx \
  -o paper.docx
```

The `template.docx` should define:
- Hyperlink style (blue, underline)
- Superscript style for citation markers

Pandoc will automatically convert `[text](#anchor)` to Word hyperlinks.

### Python-docx Limitations

**What python-docx CAN do:**
- Set superscript formatting
- Set font size and family
- Insert plain text `[1]` markers

**What python-docx CANNOT do:**
- Create Word bookmarks
- Create Word cross-references
- Create clickable hyperlinks that survive Word editing

**Workaround**: Use Pipeline B (Pandoc direct) for documents that need
working reference hyperlinks.

### Example: Superscript Formatting Only

```python
from docx import Document
from docx.shared import Pt

def add_citation_marker(paragraph, ref_number):
    """Add superscript citation marker [N] - no hyperlink"""
    run = paragraph.add_run(f'[{ref_number}]')
    run.font.superscript = True
    run.font.size = Pt(14)  # Same as body text
    run.font.name = 'Times New Roman'
```

This creates a superscript `[1]` but **without** clickable hyperlink.

### Advanced: REF Field Codes (Clickable Cross-References)

**For users who need clickable citations in python-docx output**, use Word's
`REF` field codes. This is what Word's "Insert Cross-reference" feature uses.

**Key insight**: `HYPERLINK \l` does NOT work reliably. Use `REF bookmark \h`.

```python
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

_global_bookmark_id = 0

def add_ref_field(paragraph, text, bookmark_name, superscript=False):
    """
    Add { REF bookmark_name \\h } Word field code.
    This creates a clickable cross-reference that jumps to the bookmark.
    """
    # 1. Field begin
    r1 = OxmlElement('w:r')
    fld_begin = OxmlElement('w:fldChar')
    fld_begin.set(qn('w:fldCharType'), 'begin')
    fld_begin.set(qn('w:dirty'), 'true')  # Force Word to recalculate
    r1.append(fld_begin)
    paragraph._element.append(r1)
    
    # 2. Field instruction: " REF bookmark_name \h "
    r2 = OxmlElement('w:r')
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = f' REF {bookmark_name} \\h '  # Note: spaces required
    r2.append(instr)
    paragraph._element.append(r2)
    
    # 3. Field separator
    r3 = OxmlElement('w:r')
    fld_sep = OxmlElement('w:fldChar')
    fld_sep.set(qn('w:fldCharType'), 'separate')
    r3.append(fld_sep)
    paragraph._element.append(r3)
    
    # 4. Display text (what user sees)
    r4 = OxmlElement('w:r')
    rpr = OxmlElement('w:rPr')
    if superscript:
        va = OxmlElement('w:vertAlign')
        va.set(qn('w:val'), 'superscript')
        rpr.append(va)
    sz = OxmlElement('w:sz')
    sz.set(qn('w:val'), '28')  # 14pt * 2
    rpr.append(sz)
    r4.append(rpr)
    t = OxmlElement('w:t')
    t.set(qn('xml:space'), 'preserve')
    t.text = text
    r4.append(t)
    paragraph._element.append(r4)
    
    # 5. Field end
    r5 = OxmlElement('w:r')
    fld_end = OxmlElement('w:fldChar')
    fld_end.set(qn('w:fldCharType'), 'end')
    r5.append(fld_end)
    paragraph._element.append(r5)

def add_bookmark(paragraph, name):
    """Add bookmark to paragraph (for cross-reference target)"""
    global _global_bookmark_id
    bid = str(_global_bookmark_id)
    _global_bookmark_id += 1
    
    bm_start = OxmlElement('w:bookmarkStart')
    bm_start.set(qn('w:id'), bid)
    bm_start.set(qn('w:name'), name)
    
    bm_end = OxmlElement('w:bookmarkEnd')
    bm_end.set(qn('w:id'), bid)
    
    # CRITICAL: bookmarkStart must come AFTER w:pPr
    ppr = paragraph._element.find(qn('w:pPr'))
    if ppr is not None:
        idx = list(paragraph._element).index(ppr) + 1
        paragraph._element.insert(idx, bm_start)
    else:
        paragraph._element.insert(0, bm_start)
    paragraph._element.append(bm_end)

# Usage example:
# In body text:
p = doc.add_paragraph()
p.add_run('正文引用')
add_ref_field(p, '[1]', 'ref-1', superscript=True)

# In reference section:
ref_p = doc.add_paragraph('[1] 作者A. 论文标题[J]. 期刊, 2026.')
add_bookmark(ref_p, 'ref-1')
```

**Post-processing: Enable field updates**

After saving the DOCX, modify `word/settings.xml` to auto-update fields:

```python
import zipfile

# Save document first
doc.save('paper_tmp.docx')

# Add updateFields flag
with zipfile.ZipFile('paper_tmp.docx', 'r') as zin:
    with zipfile.ZipFile('paper.docx', 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == 'word/settings.xml':
                if b'<w:updateFields' not in data:
                    data = data.replace(
                        b'</w:settings>',
                        b'<w:updateFields w:val="true"/></w:settings>'
                    )
            zout.writestr(item, data)

os.remove('paper_tmp.docx')
```

**Verification in Word:**
1. Select citation `[1]` → entire field should have gray background
2. Press `Alt+F9` → shows `{ REF ref-1 \h }`
3. `Ctrl+Click` → jumps to reference entry

**Why REF works but HYPERLINK doesn't:**

| Field Code | Syntax | Reliability |
|------------|--------|-------------|
| `HYPERLINK \l "bookmark"` | With quotes | ❌ Unstable in some Word versions |
| `REF bookmark \h` | No quotes | ✅ Standard cross-reference method |

**Reference**: Full working implementation at user's desktop files (verified).

### Common Mistakes to Avoid

❌ **Wrong**: Assuming python-docx supports bookmarks
```python
# This does NOT work - python-docx has no bookmark API
add_bookmark(paragraph, 'ref1')  # No such function
```

❌ **Wrong**: Using HTML `<sup>` tags in Markdown
```markdown
正文引用<sup>[1]</sup>  # HTML tags leak into Word
```

❌ **Wrong**: Inventing realistic-sounding citations in examples
```markdown
[1] 李金哲,刘斯超.烯效唑对番茄...  # AI may treat as real citation
```

✅ **Correct**: Use Pandoc for hyperlinks
```bash
pandoc paper.md --to docx -o paper.docx  # Preserves [text](#anchor)
```

✅ **Correct**: Use placeholder names in examples
```markdown
[1] 作者A,作者B.论文标题[J].期刊,2026.  # Clearly a placeholder
```

## Quick Start

```bash
# Recommended: Pandoc with template
pandoc paper.md --reference-doc=template.docx -o paper.docx

# With citations
pandoc paper.md \
  --citeproc \
  --bibliography=refs.bib \
  --csl=gb-t-7714-2015-numeric.csl \
  --reference-doc=template.docx \
  -o paper.docx

# Fallback: HTML pipeline (if Pandoc unavailable)
python scripts/md2docx.py paper.md -o paper.docx --pipeline html
```

## Formatting Rules (Template-based)

| Element | Chinese | English |
|---------|---------|---------|
| Body font | SimSun (宋体) | Times New Roman |
| Heading font | SimHei (黑体) | Times New Roman |
| Size | 14pt body, 15pt heading | Same |
| Line spacing | 1.5× | Same |
| Reference list | 14pt, hanging indent | Same |

## Workflow Tips

- **Use Pandoc by default** — most reliable for academic documents
- Create a `template.docx` with your institution's style requirements
- For citation-heavy papers, use `--citeproc` with `.bib` file
- Download CSL files from https://github.com/citation-style-language/styles
- Always verify output: check fonts, page numbers, reference formatting
- Use HTML pipeline only when Pandoc is unavailable

## Dependencies

- `pandoc` — Document converter (primary tool, **required**)
- `python-docx` — DOCX generation (for HTML pipeline fallback)
- `markdown` — MD→HTML conversion (for HTML pipeline)

## Document Metadata Rules

### Author Information

**Default behavior**: Remove author metadata from generated DOCX/PPTX files.

python-docx and python-pptx automatically insert default author names
(e.g., "python-docx" or system username). This should be cleared:

```python
from docx import Document

doc = Document()
# ... add content ...

# Clear default author metadata before saving
doc.core_properties.author = ''
doc.core_properties.last_modified_by = ''

doc.save('paper.docx')
```

**Exception**: If the user explicitly specifies an author name, use it:

```python
# Only if user says "作者写成张三"
doc.core_properties.author = '张三'
```

**When to ask**: If a tool or template requires author information, ask the
user first. Do NOT use placeholder names or system defaults.

### Same Rule for PPTX

```python
from pptx import Presentation

prs = Presentation()
# ... add slides ...

# Clear author metadata
prs.core_properties.author = ''
prs.core_properties.last_modified_by = ''

prs.save('presentation.pptx')
```

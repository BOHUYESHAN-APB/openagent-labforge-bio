---
name: academic-writing
description: Academic writing workflow with literature management, citation validation, LaTeX/MD pipelines, local citation vector database, and Chinese academic formatting (GB/T 7714-2015)
category: academic
exposure: standard
---

# Academic Writing Skill

Comprehensive academic writing support for ExtendAI Lab. Covers the full pipeline: literature management → PDF parsing → citation database → writing → output generation.

## Architecture Overview

```
                    ┌─────────────────────────────────────┐
                    │        文献入库 Pipeline             │
 CNKI ──► cnki-parser ──┐                                │
 DOI ───► papis ────────┤                                │
 手动 ──► 直接导入 ────┼──► 统一 BibTeX 库 (.bib)        │
 Zotero ► Better BibTeX ┤                                │
                    └─────────────────────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────┐
                    │     PDF 解析 + 向量入库 Pipeline    │
 论文 PDF ──► doc-parser ──► 结构化文本                    │
               (PyMuPDF)     ├── 分句 → BGE 嵌入           │
                             └── 写入 Chroma 向量库        │
                    └─────────────────────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────┐
                    │        写作 + 输出 Pipeline          │
 管线A: MD ──► Python Direct ──► DOCX  ✅（v4 主力）      │
 管线B: MD ──► Pandoc ────────► DOCX  （快速草稿）        │
 管线C: MD ──► Pandoc ────────► HTML  （仅预览）          │
 管线D: TeX ──► xelatex+biber ─► PDF  （LaTeX 用户）      │
                    └─────────────────────────────────────┘
```

## Core Principles

1. **On-Demand Tool Checking** — Only check tools when the user needs to write a paper, not on every startup
2. **Main Pipeline: Python Direct (v4)** — MD → python-docx low-level XML with REF field codes (verified production)
3. **Pandoc Only for Drafts** — Pandoc 用于快速草稿，不用于最终输出
4. **HTML Only for Preview** — HTML 仅用于预览，**禁止** HTML→DOCX 管线
5. **PDF 解析标准化** — 统一走 doc-parser 脚本，不依赖模型自身解析能力
6. **本地引用数据库** — Chroma + BGE 向量库，实现文段→论文溯源

## Available Skills (Load on Demand)

| Skill | Location | Load command | Purpose |
|-------|----------|-------------|---------|
| `academic-cnki-parser` | `resources/academicSkills/citation/cnki-parser/` | `skill("academic-cnki-parser")` | CNKI 导出→BibTeX |
| `academic-cite-match` | `resources/academicSkills/citation/cite-match/` | `skill("academic-cite-match")` | `[[cite:keywords]]`→`[N]` 标记匹配 |
| `academic-md2docx` | `resources/academicSkills/formatting/md2docx/` | `skill("academic-md2docx")` | MD→DOCX 三管线指南 |
| `academic-latex-pipeline` | `resources/academicSkills/writing/latex-pipeline/` | `skill("academic-latex-pipeline")` | LaTeX 模板+编译 |
| `academic-citation-database` | `resources/academicSkills/writing/citation-database/` | `skill("academic-citation-database")` | 本地向量数据库 |
| `document-formatting` | `src/skills/document-formatting/` | `skill("document-formatting")` | DOCX 排版规范 v4 |
| `research-writing-skill` | `resources/academicSkills/writing/research-writing-skill/` | `skill("research-writing-skill")` | 论文写作、修改、润色、审稿回复 |
| `office-academic-skill` | `resources/academicSkills/office/office-academic-skill/` | `skill("office-academic-skill")` | 学术 Word/PPT 生成与编辑 |
| `scientific-toolkit-skill` | `resources/academicSkills/computing/scientific-toolkit-skill/` | `skill("scientific-toolkit-skill")` | 科研计算、MATLAB/Python、数据分析 |

## Tool Checking

Use `academic_check_tools()` to check available tools:

```typescript
// Check all
academic_check_tools()

// Check specific
academic_check_tools({ tools: ["pandoc", "papis", "python-docx", "xelatex"] })
```

| Tool | Check command | Purpose |
|------|--------------|---------|
| `pandoc` | `pandoc --version` | MD→DOCX/BibTeX 处理 |
| `papis` | `papis --version` | 文献管理（DOI/arXiv 导入） |
| `python-docx` | `python -c "from docx import Document"` | DOCX 生成（v4 管线） |
| `PyMuPDF` | `python -c "import fitz"` | PDF 文本解析 |
| `xelatex` | `xelatex --version` | LaTeX 编译 |
| `biber` | `biber --version` | 参考文献处理 |
| `chromadb` | `python -c "import chromadb"` | 向量数据库 |
| `sentence-transformers` | `python -c "import sentence_transformers"` | 嵌入模型 |
| `jieba` | `python -c "import jieba"` | 中文分词 |

## Writing Workflows

### Workflow A: Markdown → DOCX (v4 Pipeline, 主力)

```markdown
1. 准备 Markdown 源文件（含 [N] 引用标记 + 有序列表参考文献）
2. 运行 pipeline A：python build_docx_ref_codes.py
3. 输出：DOCX 文件（REF field code + 自动编号 [1][2][3] 格式）
```

### Workflow B: LaTeX → PDF

```markdown
1. 准备 .tex 源文件（ctex + biblatex）
2. 运行编译管线：xelatex → biber → xelatex ×2
3. 输出：PDF 文件
```

### Workflow C: 文献入库

```markdown
1. 从 CNKI/Zotero/DOI 获取文献元数据
2. 统一导出为 .bib 文件
3. 下载 PDF 全文
4. 运行 doc-parser 提取文本 → 写入本地向量数据库
```

## Pipeline Comparison

| Feature | Pipeline A (Python Direct) | Pipeline B (Pandoc) | Pipeline D (LaTeX) |
|---------|---------------------------|---------------------|---------------------|
| **输出格式** | DOCX | DOCX | PDF |
| **引用** | REF field code ✅ | 静态超链接 ⚠️ | BibLaTeX ✅ |
| **编号** | Word 自动编号 `[1][2][3]` | 静态文本 | BibLaTeX 控制 |
| **中文排版** | 完全控制 ✅ | 依赖 template.docx | ctex 宏包 ✅ |
| **速度** | 中等 | 快 | 慢（多次编译） |
| **推荐场景** | **最终论文输出** | 快速草稿 | 需要 PDF 的 LaTeX 用户 |

## Reference Implementation

生产验证的 v4 脚本路径（Windows）：
```
F:\swxxx\scripts\build_docx_ref_codes.py
```

核心实现：
- Markdown 直接解析（正则分块）
- `{ REF ref-N \h }` field code 交叉引用
- 自定义 `word/numbering.xml` 实现 `[1]` 编号格式
- python-docx 底层 XML 操作（OxmlElement）
- `word/settings.xml` 注入 `updateFields`

## Future Enhancements (P2 — 暂不实现)

- `academic_detect_missing_citations()` — 基于向量库的文段缺失引用检测
- `academic_build_html_preview()` — 集成到 dashboard 的 HTML 预览
- OCR 兜底管线（ocrmypdf + tesseract）
- 更多 CSL 引文样式

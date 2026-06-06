# Stage 5: FINALIZE

## Purpose
Generate final output in target format

## Agents
- `format_selector` — Chooses output format based on target
- `document_generator` — Generates final document
- `quality_checker` — Final quality verification

## Process
1. Format selector determines target format
2. Document generator creates final document
3. Quality checker verifies output
4. Bibliography is generated
5. Quality report is produced

## Inputs
- Revised Draft (from Stage 4)
- Citation List (from Stage 4)
- Target venue/format

## Outputs
- Final Document (MD/DOCX/LaTeX/PDF)
- Bibliography (formatted)
- Quality Report

## Format Options

### Markdown (.md)
- Best for: web, version control, GitHub
- Tools: None required
- Limitations: Limited formatting

### DOCX (.docx)
- Best for: Word users, journals, collaboration
- Tools: python-docx, pandoc
- Features: REF field codes, track changes

### LaTeX (.tex)
- Best for: conferences, PDF generation
- Tools: xelatex, biber
- Features: Professional typesetting

### PDF (.pdf)
- Best for: submission, printing
- Tools: LaTeX, pandoc, wkhtmltopdf
- Features: Fixed layout

## Quality Gates
- [ ] Format matches target requirements
- [ ] Citations properly formatted
- [ ] Bibliography complete
- [ ] No formatting errors
- [ ] Document renders correctly

## User Checkpoint
User confirms:
1. Format is correct
2. Content is complete
3. Ready for submission/distribution

## Mode Differences
- **Academic Mode**: Full bibliography, proper formatting
- **Engineering Mode**: Simple format, minimal bibliography

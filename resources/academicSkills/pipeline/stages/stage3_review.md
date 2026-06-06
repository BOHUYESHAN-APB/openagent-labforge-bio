# Stage 3: REVIEW

## Purpose
Quality check and improvement suggestions

## Agents
- `quality_reviewer` — Checks overall quality and clarity
- `methodology_reviewer` — Reviews research methodology (academic mode)
- `citation_reviewer` — Verifies citation accuracy and completeness

## Process
1. Quality reviewer evaluates clarity, coherence, evidence, writing quality
2. Methodology reviewer checks research methods (academic mode)
3. Citation reviewer verifies all citations
4. Review report is generated with scores and suggestions

## Inputs
- First Draft (from Stage 2)
- Citation List (from Stage 2)

## Outputs
- Review Report with scores (0-100)
- Improvement Suggestions
- Citation Verification Report

## Quality Gates
- [ ] Overall score ≥ 70
- [ ] No critical issues
- [ ] All citations verified
- [ ] Methodology sound (academic mode)

## User Checkpoint
User reviews:
1. Review report
2. Improvement suggestions
3. Decides whether to proceed or revise

## Scoring Guide
- 90-100: Excellent, ready for submission
- 80-89: Good, minor revisions needed
- 70-79: Acceptable, moderate revisions needed
- 60-69: Below standard, major revisions needed
- <60: Unacceptable, rewrite required

## Mode Differences
- **Academic Mode**: Full review with methodology check
- **Engineering Mode**: Quick review, focus on clarity

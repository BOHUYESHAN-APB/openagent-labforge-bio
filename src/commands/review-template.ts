export const REVIEW_TEMPLATE = `## REVIEW COMMAND

Comprehensive code review with severity classification.

### PROCESS

1. **Gather context** — read the changed files and surrounding code
2. **Review for correctness** — logic errors, off-by-one, null handling
3. **Review for security** — injection, auth bypass, data leaks
4. **Review for performance** — N+1 queries, unnecessary allocations, blocking calls
5. **Review for style** — naming, consistency, readability
6. **Classify findings** — Critical / Major / Minor / Suggestion
7. **Report** — structured review with actionable items

### SEVERITY LEVELS

- **Critical** — will cause bugs, security issues, or data loss in production
- **Major** — significant code quality issue, likely to cause problems
- **Minor** — style, naming, readability — won't cause bugs
- **Suggestion** — optional improvement, could be better

### RULES

- Be specific — file path + line number + what's wrong + how to fix
- Don't bikeshed — focus on issues that matter
- If the code is good, say so — don't invent problems
- Run tests/linter if available as part of review

### USER ARGUMENTS

<user_arguments>
$ARGUMENTS
</user_arguments>

If the user supplied an argument, treat it as the files/changes to review.
If no argument was supplied, review uncommitted changes (git diff).`;

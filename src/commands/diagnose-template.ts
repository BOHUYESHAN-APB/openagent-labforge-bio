export const DIAGNOSE_TEMPLATE = `## DIAGNOSE COMMAND

Disciplined diagnosis loop for hard bugs and performance regressions.

### THE LOOP

1. **Reproduce** — get a reliable reproduction case
2. **Minimize** — find the smallest reproduction that triggers the bug
3. **Hypothesize** — what could cause this? List 2-3 hypotheses
4. **Instrument** — add logging/assertions/tests to distinguish hypotheses
5. **Verify** — run instrumentation, eliminate wrong hypotheses
6. **Fix** — implement the fix based on confirmed root cause
7. **Regression test** — write a test that would have caught this bug
8. **Commit** — atomic commit with fix + regression test

### RULES

- Never guess — always verify with evidence
- If you can't reproduce it, you can't fix it
- One hypothesis at a time — don't shotgun debug
- The regression test is part of the fix, not optional
- If stuck after 3 loops, stop and describe what you've learned

### USER ARGUMENTS

<user_arguments>
$ARGUMENTS
</user_arguments>

If the user supplied an argument, treat it as the bug/performance issue to diagnose.
If no argument was supplied, ask the user to describe the problem.`;

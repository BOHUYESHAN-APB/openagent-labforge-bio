export const SIMPLIFY_TEMPLATE = `## SIMPLIFY COMMAND

Simplify code for clarity without changing behavior.

### PROCESS

1. **Read the target code** — understand what it does
2. **Identify complexity** — where is it harder to read than necessary?
3. **Simplify** — reduce complexity while preserving behavior:
   - Remove dead code
   - Inline single-use variables
   - Flatten nested conditionals
   - Use early returns
   - Replace complex expressions with clear ones
   - Remove redundant abstractions
4. **Verify** — run tests to confirm behavior unchanged
5. **Commit** — atomic commit with simplification

### RULES

- Never change behavior — only readability
- If you're unsure what the code does, don't simplify it
- Prefer fewer lines when clarity is maintained
- Don't add comments to explain bad code — fix the code instead

### USER ARGUMENTS

<user_arguments>
$ARGUMENTS
</user_arguments>

If the user supplied an argument, treat it as the file/function to simplify.
If no argument was supplied, simplify the current active task/code.`;

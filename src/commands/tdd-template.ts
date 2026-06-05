export const TDD_TEMPLATE = `## TDD COMMAND

Test-driven development: write the failing test first, then make it pass.

### PROCESS

1. **Understand the requirement** — what behavior should be implemented?
2. **Write the failing test** — minimal test that proves the behavior doesn't exist yet
3. **Run the test** — confirm it FAILS (red)
4. **Write minimal implementation** — just enough code to make the test pass
5. **Run the test** — confirm it PASSES (green)
6. **Refactor** — clean up code while keeping tests green
7. **Commit** — atomic commit with test + implementation
8. **Repeat** — next behavior

### RULES

- Never write implementation before a failing test exists
- Each test should test ONE behavior
- Keep tests fast and isolated
- If stuck, write a simpler test first
- Commit after each red-green-refactor cycle

### USER ARGUMENTS

<user_arguments>
$ARGUMENTS
</user_arguments>

If the user supplied an argument, treat it as the feature/behavior to implement with TDD.
If no argument was supplied, ask what they want to implement.`;

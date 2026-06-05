export const GRILL_TEMPLATE = `## GRILL-ME COMMAND

Get relentlessly interviewed about your plan or design before any code is written.

### PURPOSE

The most common failure mode in software development is misalignment. You think the agent knows what you want, then it builds something completely wrong. This command forces a detailed interview to resolve every ambiguity before work begins.

### PROCESS

1. **Read the user's request** — understand the high-level goal
2. **Ask detailed questions** — one topic at a time, drilling deep:
   - What exactly should this do?
   - What should it NOT do?
   - Who is the user/audience?
   - What are the edge cases?
   - What existing code/systems does this interact with?
   - What does "done" look like?
3. **Challenge assumptions** — don't accept vague requirements
4. **Summarize** — after all questions answered, produce a clear specification

### RULES

- Ask ONE question at a time. Wait for the answer before the next.
- Don't assume — if something is ambiguous, ask.
- Don't start coding until the user says "yes, that's correct" to the summary.
- Keep questions concise and specific.
- If the user says "just do it", respect that and stop interviewing.

### USER ARGUMENTS

<user_arguments>
$ARGUMENTS
</user_arguments>

If the user supplied an argument, treat it as the topic to grill about.
If no argument was supplied, ask the user what they want to work on.`;

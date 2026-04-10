---
description: Investigate an issue or bug — gather symptoms, build hypotheses, find root cause
argument-hint: 'description of the issue or Notion ticket URL'
allowed-tools: Read, Glob, Grep, Agent, AskUserQuestion, Bash(git:*, npx pnpm:*, curl:*), mcp__claude_ai_Notion__notion-fetch, mcp__claude_ai_Notion__notion-get-comments
---

You are investigating an issue or bug to find its root cause before any code gets written. This command produces a **finding** — not a fix. Follow the steps below exactly. Always adhere to any rules or requirements set out in any CLAUDE.md files.

**CRITICAL**: This command is for **understanding problems**, not solving them. Do NOT write production code, do NOT propose implementation changes, do NOT create a fix PR. Do NOT write any files. All findings are presented directly in the conversation. After the investigation, the user decides whether to hand off to `/kaipos.quick` or `/kaipos.spec` for the fix.

User input: $ARGUMENTS

---

## Step 1. Gather symptoms from the user

Before touching any code, interview the user to understand the problem. Use AskUserQuestion in **multiple rounds** — don't try to collect everything at once. Start broad, then drill into specifics based on answers.

**If `$ARGUMENTS` contains a Notion URL or ticket ID**, fetch the ticket details and comments first:

- Call `mcp__claude_ai_Notion__notion-fetch` to get the ticket title, description, and properties
- Call `mcp__claude_ai_Notion__notion-get-comments` to read any discussion or context on the ticket
- Use this information to skip questions you can already answer

**Round 1 — What's happening?**

Ask the user to describe the problem in their own words. Prompt for:

- What is the expected behavior vs actual behavior?
- When did the issue first appear? (recent deploy, always been there, intermittent?)
- How severe is it? (blocking, degraded experience, cosmetic, etc.)

**Round 2 — Reproduction**

Based on the first answer, ask targeted follow-up questions:

- Can the user reproduce it reliably? What are the exact steps?
- Does it happen in a specific environment? (local, staging, production)
- Are there any error messages, logs, or screenshots available?

**Round 3+ — Narrowing down**

Continue asking follow-up questions until you have enough context to form an initial hypothesis. Areas to probe based on what you learn:

- Specific inputs or data that trigger the issue
- Whether the issue is isolated or affects multiple areas
- Recent changes that might be related (ask the user if they suspect anything)
- Any workarounds that have been tried

Do NOT explore the codebase yet. Do NOT write any files during this step.

## Step 2. Form initial hypothesis

Based on the symptoms, state your initial hypothesis clearly to the user:

> **Initial hypothesis**: _<one or two sentences describing what you think might be going wrong and why>_

Ask the user if this aligns with their intuition, or if they have a different suspicion. Use AskUserQuestion. This is a checkpoint — the user might redirect you toward a more promising direction before you invest time exploring.

## Step 3. Investigate the codebase

Now explore the codebase to test your hypothesis. Use Agent (subagent_type: Explore), Glob, Grep, and Read. Focus on:

- The code path that the symptoms point to
- Recent changes in the affected area (`git log --oneline -20 -- <path>`)
- Related tests — do they pass? Do they cover the scenario described?
- Configuration, environment variables, or feature flags that might be relevant
- Error handling and edge cases in the affected code

Be systematic. If your initial hypothesis doesn't hold up, say so and pivot. Don't force evidence to fit a theory.

Do NOT write any files during this step.

## Step 4. Share findings and ask for input

Present what you found so far to the user — **not as a final report**, but as a checkpoint. Use AskUserQuestion to have a conversation:

- Show the relevant code paths you traced
- Highlight anything surprising or suspicious
- If you found the likely root cause, explain it clearly
- If you're stuck or see multiple possibilities, lay them out and ask the user which direction to explore next

**This is the most interactive step.** Go back and forth with the user as many times as needed. Each round should:

1. Share a finding or observation
2. Ask a targeted question or propose a next investigative step
3. Act on the user's response

Keep going until you and the user agree on the root cause, or agree that you've narrowed it down as far as you can.

## Step 5. Verify the root cause (if possible)

If the investigation points to a clear root cause, try to verify it without writing production code:

- Check if a specific test case is missing that would catch this
- Use `git log` / `git blame` to confirm when the issue was introduced
- Check if the issue exists in other similar code paths

Report what you verified and what remains uncertain.

## Step 6. Present the investigation summary

Output the full investigation summary directly in the conversation. Use this structure:

```text
## Investigation Summary

**Status**: <Confirmed root cause | Likely root cause | Inconclusive — needs more data>

### Symptoms
- ...

### Root Cause
...

### Evidence
- ...

### Affected Scope
- ...

### Suggested Fix Direction
- ...

### Open Questions
- ...
```

Do NOT write this to a file. It lives in the conversation only.

## Step 7. Recommend next steps

Based on the investigation, recommend the appropriate next action using AskUserQuestion:

- **Small fix (~8 files or fewer)**: Suggest `/kaipos.quick <notion_url_or_short_id> <title>` with a concrete description informed by the investigation.
- **Larger fix or architectural change**: Suggest `/kaipos.spec <notion_url_or_short_id> <title>` with a concrete description.
- **Needs more investigation**: Explain what additional information is needed and from whom (e.g., "we need production logs from the last 24 hours" or "this might be a data issue — can you check the affected records?").
- **Not a bug**: If the investigation reveals the behavior is expected or the issue is elsewhere (e.g., upstream service, user error), explain why and suggest closing the ticket.

**Do NOT proceed to implementation.** The user decides the next step.

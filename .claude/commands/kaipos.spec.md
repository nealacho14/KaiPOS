---
description: Create a spec file and branch from a Notion ticket
argument-hint: 'https://notion.so/... or NT-195de922 short description'
allowed-tools: Read, Write, Glob, Grep, AskUserQuestion, Bash(git:*), mcp__claude_ai_Notion__notion-fetch, mcp__claude_ai_Notion__notion-update-page
---

You are creating a spec from a Notion ticket. This works for features, enhancements, bug fixes, or any other task. For small changes that fit in a single PR (~8 files or fewer), consider `/kaipos.quick` instead. Follow the steps below exactly. Always adhere to any rules or requirements set out in any CLAUDE.md files.

**CRITICAL**: This command writes a spec file and nothing else. Do NOT propose implementation, do NOT offer to execute code, do NOT show a plan summary with execution options. The only file you create is the spec.

User input: $ARGUMENTS

---

## Step 1. Verify clean working directory

Run `git status`. If there are staged or unstaged **modifications** (modified/deleted files), **stop immediately** and tell the user to commit or stash before running this command. Untracked files are fine — they won't be affected by branch switching.

## Step 2. Parse arguments and fetch Notion ticket

@.claude/includes/argument-parsing.md

@.claude/includes/notion-integration.md

Use the fetched Notion ticket data (title, description, status, priority) to pre-populate the spec in later steps.

Also derive: 4. **`branch_name`** — Format: `NT-<short_id>/<task_slug>/feature` (e.g., `NT-195de922/add-product-search/feature`)

## Step 3. Explore the codebase

If codebase exploration was already performed in this conversation (e.g., by `/kaipos.follow-up`), skip this step and use the existing findings.

Before writing the spec, explore the codebase to understand relevant existing code. Use Glob, Grep, and Read to find:

@.claude/includes/codebase-exploration.md

## Step 3.5. Size check

Based on your exploration, assess the scope:

- Will this change ~8 files or fewer?
- Is it a single coherent change (bug fix, small enhancement)?

If yes, use AskUserQuestion to offer the user a choice:

- **Use `/kaipos.quick` instead (Recommended)**: Faster path for small, single-PR changes.
- **Continue with full flow**: Proceed with spec creation.

If the user chooses quick, stop here and tell them to run `/clear` then `/kaipos.quick <notion_url_or_short_id> <description>`.

## Step 4. Interview the user

@.claude/includes/user-interview.md

## Step 5. Create branch

Branch format: `NT-<short_id>/<task_slug>/feature`

@.claude/includes/branch-creation.md

## Step 6. Write the spec

Create the spec file at `.specs/NT-<short_id>_<task_slug>/spec.md`.

Use the exact structure from @.specs/templates/spec.template.md.

Pre-populate the metadata table from the Notion ticket data. Use the ticket description to seed the Context section. Do not include technical implementation details or code examples — the spec defines **what** and **why**, not **how**.

## Step 7. Update Notion ticket status (best-effort)

Call `mcp__claude_ai_Notion__notion-update-page` to set the ticket status to "In Progress". If this fails, warn the user but continue.

## Step 8. Summary

After saving, print:

```text
Notion Ticket: NT-<short_id> (<task_title>)
Branch: <branch_name>
Spec file: .specs/NT-<short_id>_<task_slug>/spec.md
```

Do NOT repeat the full spec in chat unless asked. Do NOT commit anything or create a PR.

Wait for user feedback. Once aligned, tell the user:

> Run `/clear` first, then `/kaipos.plan` to start with fresh context.

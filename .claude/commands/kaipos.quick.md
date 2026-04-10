---
description: Plan and implement a small change without a formal spec
argument-hint: 'https://notion.so/... or NT-195de922 short description'
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Bash(git:*, gh:*, npx pnpm:*), mcp__claude_ai_Notion__notion-fetch, mcp__claude_ai_Notion__notion-update-page
---

You are planning and implementing a small, self-contained change — same rigor as `/kaipos.plan` + `/kaipos.implement`, but driven by a user description instead of a spec file. This is the **recommended path for bug fixes** and small enhancements. Follow the steps below exactly. Always adhere to any rules or requirements set out in any CLAUDE.md files.

**CRITICAL**: This command is for **single-PR changes**. If the scope grows beyond that, redirect to the full flow.

User input: $ARGUMENTS

---

## Step 1. Parse arguments and fetch Notion ticket

@.claude/includes/argument-parsing.md

@.claude/includes/notion-integration.md

## Step 2. Deep codebase exploration

If codebase exploration was already performed in this conversation (e.g., by `/kaipos.follow-up`), skip this step and use the existing findings.

@.claude/includes/codebase-exploration.md

## Step 3. Size check

**Before writing any code**, assess the scope:

- How many files will change?
- Is this a single coherent change or multiple loosely related changes?
- Will it need more than one PR to review cleanly?

**If the change will touch more than ~8 files, require multiple phases, or involve architectural decisions**, use AskUserQuestion to let the user choose:

- **Switch to full flow (Recommended)**: Tell the user to run `/clear`, then `/kaipos.spec <notion_url_or_short_id> <description>` (fill in a concrete suggestion based on what you know).
- **Proceed anyway**: Continue at the user's own risk, but note that this won't have stacked PRs or a formal spec.

## Step 4. Interview the user

@.claude/includes/user-interview.md

## Step 5. Write the plan

Create the plan file at `.specs/NT-<short_id>_<task_slug>/quick-plan.md`.

Use the exact structure from @.specs/templates/quick-plan.template.md.

After saving, print:

```text
Notion Ticket: NT-<short_id> (<task_title>)
Plan file: .specs/NT-<short_id>_<task_slug>/quick-plan.md
```

Do NOT repeat the full plan in chat unless asked.

## Step 6. STOP — Wait for plan approval

@.claude/includes/plan-approval-gate.md

## Step 7. Create the branch

Branch format: `NT-<short_id>/<task_slug>/feature`

@.claude/includes/branch-creation.md

## Step 8. Implement

Implement the change. Follow the same principles as `/kaipos.implement`:

- Follow existing codebase conventions
- Add or update tests where applicable (see **Testing approach** below)
- Update documentation if the change introduces patterns others need to know about (follow the rules in the Documentation section of CLAUDE.md, or run `/kaipos.update-docs` after implementation)

@.claude/includes/testing-approach.md

@.claude/includes/follow-up-awareness.md

## Step 9. Verify

@.claude/includes/verification-steps.md

Tick the verification checkboxes in the plan file.

## Step 10. Commit, push, and create PR

@.claude/includes/commit-and-pr.md

## Step 11. STOP and wait for PR feedback

**Do NOT start another task.** Tell the user the PR is ready for review.

The user (or their team) will now review the PR. They may come back with feedback, change requests, or questions **in this same conversation**. If they do:

- Address the feedback (fix code, update tests, etc.)
- Run verification again (Step 9)
- Push the changes to the same branch

**Only once the user is satisfied with the PR**, the task is complete.

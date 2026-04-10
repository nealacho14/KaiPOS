---
description: Pick a follow-up task, then spec it or implement it directly (quick flow)
argument-hint: '(optional) path to follow-up.md file'
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Bash(git:*), Skill, mcp__claude_ai_Notion__notion-search, mcp__claude_ai_Notion__notion-create-pages
---

You are helping the user pick a follow-up task from a `follow-up.md` file and hand off to either `/kaipos.quick` or `/kaipos.spec` for execution. Follow the steps below exactly. Always adhere to any rules or requirements set out in any CLAUDE.md files.

User input: $ARGUMENTS

---

## Step 1. Find follow-up.md files

1. If `$ARGUMENTS` contains a file path, use that.
2. Otherwise, search for all `follow-up.md` files under `.specs/`:
   ```text
   .specs/*/follow-up.md
   ```
3. If no `follow-up.md` files exist, tell the user there are no follow-up tasks and stop.

## Step 2. Show open items

Read all found `follow-up.md` files. Collect all **unchecked** items (`- [ ]`) across all files. If there are no unchecked items, tell the user all follow-up tasks have been addressed and stop.

Present the open items to the user as a numbered list, grouped by source file. Ask the user to pick one using AskUserQuestion.

## Step 3. Gather context

Read the spec and plan from the same `.specs/` folder as the selected `follow-up.md` to understand the original context. Ask the user any clarifying questions about the selected follow-up task using AskUserQuestion.

## Step 4. Collect inputs

Before modifying any files, gather the inputs needed:

@.claude/includes/argument-parsing.md

Also derive: 4. **`branch_name`** — Format: `NT-<short_id>/<task_slug>/feature` (e.g., `NT-195de922/extract-shared-utils/feature`)

Confirm both `short_id` (or Notion ticket URL) and `task_title` with the user before proceeding. If the follow-up task doesn't have a Notion ticket yet, offer to create one via `mcp__claude_ai_Notion__notion-create-pages` (best-effort) or let the user provide an existing ticket URL.

## Step 5. Verify clean working directory

Run `git status`. If there are staged or unstaged **modifications** (modified/deleted files), **stop immediately** and tell the user to commit or stash before continuing. Untracked files are fine.

## Step 6. Create the feature branch

Branch format: `NT-<short_id>/<task_slug>/feature`

@.claude/includes/branch-creation.md

## Step 7. Explore the codebase

Before deciding on the flow, explore the codebase to understand relevant existing code.

@.claude/includes/codebase-exploration.md

## Step 8. Mark follow-up as picked up

1. Mark the selected follow-up item as checked (`- [x]`) in the source `follow-up.md` file.
2. Stage and commit:
   ```bash
   git add <path to the edited follow-up.md>
   git commit -m "Mark follow-up task as picked up: <brief description>"
   ```

## Step 9. Size check and handoff

Based on your exploration, assess the scope and present a recommendation using AskUserQuestion:

- **Quick flow (Recommended for ~8 files or fewer)**: Single-PR change, faster path.
- **Full spec flow**: For larger or multi-phase work.

Based on the user's choice, invoke the next command using the Skill tool. Pass the Notion ticket URL or `<short_id> <task_title>` as arguments:

- **Quick flow**: `Skill("kaipos.quick", "<notion_url_or_short_id> <task_title>")`
- **Spec flow**: `Skill("kaipos.spec", "<notion_url_or_short_id> <task_title>")`

The exploration context from Step 7 carries forward in the conversation — the invoked command will reuse it instead of re-exploring.

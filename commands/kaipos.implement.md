---
description: Implement the next uncompleted phase of a plan
argument-hint: '(optional) [path to plan file]'
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Bash(git:*, gh:*, npx pnpm:*), mcp__claude_ai_Notion__notion-update-page
---

You are implementing the next uncompleted phase of a plan. Follow the steps below exactly. Always adhere to any rules or requirements set out in any CLAUDE.md files.

User input: $ARGUMENTS

---

## Step 1. Locate the plan and find next phase

@.claude/includes/plan-file-location.md

Read the plan and find the **first phase where not all task checkboxes are ticked**. If all phases are complete, tell the user all phases are implemented and suggest running `/kaipos.qa` for end-to-end QA.

## Step 2. Determine the base branch and create the stacked branch

Determine the intended base branch from the plan:

- **Phase 1**: intended base is the `feature` branch (`NT-<short_id>/<task_slug>/feature`)
- **Phase N**: intended base is the previous phase's branch (`NT-<short_id>/<task_slug>/<previous_phase_slug>`)

**Check if the intended base branch has been merged into `main`**:

```bash
git fetch origin
git branch -r --merged origin/main | grep -E "origin/<intended_base_branch>$"
```

- If the intended base **has been merged** into `main`, use `main` as the base instead.
- If the intended base **has not been merged**, use it as the base.

```bash
git switch <base_branch>
git pull
git switch -c NT-<short_id>/<task_slug>/<phase_slug>
```

If the branch already exists, ask the user how to resolve it.

## Step 3. Implement the phase

Implement every task listed in the phase. For each task:

- Follow existing codebase conventions
- Add or update tests where applicable (see **Testing approach** below)
- Update documentation if the phase introduces patterns others need to know about (follow the rules in the Documentation section of CLAUDE.md, or run `/kaipos.update-docs` after implementation)

@.claude/includes/testing-approach.md

@.claude/includes/follow-up-awareness.md

## Step 4. Verify

@.claude/includes/verification-steps.md

## Step 5. Update the plan

In the plan file, tick off all completed task checkboxes (`- [x]`) and verification checkboxes for this phase.

## Step 6. Commit, push, and create PR

@.claude/includes/commit-and-pr.md

## Step 7. STOP and wait for PR feedback

**Do NOT continue to the next phase.** Tell the user the PR is ready for review.

The user (or their team) will now review the PR. They may come back with feedback, change requests, or questions **in this same conversation**. If they do:

- Address the feedback (fix code, update tests, etc.)
- Run verification again (Step 4)
- Push the changes to the same branch

**Only once the user is satisfied with the PR**, tell them:

> Run `/clear` first, then `/kaipos.implement` to start the next phase with fresh context.

If all phases are now complete, tell them instead:

> Run `/clear` first, then `/kaipos.qa` for end-to-end QA with fresh context.

**Do NOT suggest saying "continue" in this conversation.** Each new phase must be a fresh `/kaipos.implement` invocation after `/clear`.

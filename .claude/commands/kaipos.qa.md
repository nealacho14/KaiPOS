---
description: End-to-end QA after all phases of a plan are implemented
argument-hint: '(optional) path to plan file'
allowed-tools: Read, Write, Glob, Grep, AskUserQuestion, Bash(npx pnpm:*, git:*, gh:*, curl:*), mcp__claude_ai_Notion__notion-update-page
---

You are guiding the user through end-to-end QA after all phases of a plan have been implemented. Follow the steps below exactly. Always adhere to any rules or requirements set out in any CLAUDE.md files.

**CRITICAL**: This command guides QA verification. Do NOT propose new features, do NOT offer to implement fixes automatically. Report findings and let the user decide next steps.

User input: $ARGUMENTS

---

## Step 1. Locate the plan and verify all phases are complete

@.claude/includes/plan-file-location.md

Read the plan and verify **all phase task checkboxes are ticked**. If any phase has uncompleted tasks, tell the user to finish implementation first via `/kaipos.implement` or `/kaipos.implement-parallel` and stop.

## Step 2. Review the QA Plan

Read the **QA Plan** section at the bottom of the plan file. Also read the spec file (from the same `.specs/` folder) to understand the acceptance criteria.

## Step 3. Review the implementation

Read the key files across all phases. Understand the full scope of what was built. Do NOT write any files during this step.

## Step 4. Setup

Before running individual checks, identify any **shared setup** the user needs to do once (e.g., start the dev server, seed test data, set environment variables). Present these as prerequisite steps and use AskUserQuestion to confirm the setup is ready before proceeding.

If no shared setup is needed, skip this step.

## Step 5. Guide the user through end-to-end verification

Walk through each QA check **one at a time**. Individual checks should focus on **what to verify**, not on repeating setup instructions. For each check:

1. **Present the check**: Explain exactly what to do (commands to run, UI actions to take, endpoints to hit) and what the expected behavior is. Be specific — don't say "verify it works", say "run `pnpm dev` and navigate to `/admin/products`, you should see..."
2. **Ask pass/fail**: Use AskUserQuestion with two options: **Pass** and **Fail**.
3. **If Fail**: Ask a follow-up AskUserQuestion for a brief description of what went wrong (expected vs actual).
4. **Record immediately**: Update the QA Plan checkbox in the plan file before moving to the next check:
   - **Pass**: tick the checkbox (`- [x]`)
   - **Fail**: leave unchecked and add a failure note (`- [ ] Step description — **FAIL**: <user's description>`)
5. **Move to next check** and repeat.

Do NOT present all checks at once. One check, one response, one result — then the next.

## Step 6. Wrap up

### Create the QA results branch

Determine the branch name: start with `NT-<short_id>/<task_slug>/qa-results`. If that branch already exists (e.g., from a previous QA run), increment a suffix: `qa-results-2`, `qa-results-3`, etc., until an unused name is found.

### If all QA checkboxes pass

1. Create the QA results branch
2. Commit the updated plan file
3. Push and create a **draft** PR (`gh pr create --draft`) targeting the last phase branch (or `main` if it's already merged)
4. Update Notion ticket status to "Done" via `mcp__claude_ai_Notion__notion-update-page` (best-effort)
5. Congratulate the user — the task is ready for final review and merge
6. If a `follow-up.md` exists in the `.specs/` folder for this task, tell the user:
   > Run `/clear` first, then `/kaipos.follow-up` to pick up follow-up tasks with fresh context.

### If any QA checkbox failed

1. Add a new phase to the plan (e.g., `## Phase N: QA Fixes`) that includes:
   - A task for each failed QA checkbox, describing what needs to be fixed
   - The standard Verification section (typecheck/lint/build)
   - The standard PHASE GATE comment block
   - Branch and target following the same stacking rules as other phases
2. Create the QA results branch
3. Commit the updated plan file (QA results + new fixes phase)
4. Push and create a **draft** PR (`gh pr create --draft`) targeting the last phase branch (or `main` if it's already merged)
5. Update Notion ticket status to indicate QA issues (best-effort)
6. Tell the user:
   > Run `/clear` first, then `/kaipos.implement` or `/kaipos.implement-parallel` to pick up the QA fixes phase. After fixes, run `/clear` and `/kaipos.qa` again.

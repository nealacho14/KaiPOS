---
description: Implement a phase in a worktree for parallel multi-phase work
argument-hint: '(optional) [path to plan file]'
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Bash(git:*, gh:*, npx pnpm:*), mcp__claude_ai_Notion__notion-update-page
---

You are implementing a phase of a multi-phase plan in a **git worktree**, allowing parallel implementation of independent phases in isolated directories without affecting the main working directory. Follow the steps below exactly. Always adhere to any rules or requirements set out in any CLAUDE.md files.

User input: $ARGUMENTS

---

## Step 1. Locate the plan and select the phase

@.claude/includes/plan-file-location.md

Read the plan and count the total number of phases by counting `## Phase N:` headers. **If the plan has only one phase, stop immediately** and tell the user:

> This is a single-phase plan. Use `/kaipos.implement` instead.

If all phases are complete, tell the user all phases are implemented and suggest running `/kaipos.qa` for end-to-end QA.

<!-- CAVEAT: The Phase Status table is NOT reliable for coordinating parallel worktrees.
     Each worktree has its own copy of the plan on a separate branch, so `in-progress`
     set in one worktree is invisible to others. The user is responsible for telling
     each session which phase to implement. Do NOT rely on the status table to prevent
     two worktrees from picking the same phase. -->

**Ask the user to confirm which phase to implement.** The Phase Status table may be stale because each worktree works on a separate branch — do not auto-select based on status values. List the available phases and let the user choose.

> **Parallel coordination warning**: Each worktree session is isolated — there is no shared lock or state between sessions. Before starting, confirm with the user that no other session is already working on the same phase. If two sessions implement the same phase, one will produce duplicate work that must be discarded.

## Step 2. Create the worktree

Determine the base branch using **dependency relationships** (not stacking order):

- **Independent phase** (`Depends on: none`): base is the `feature` branch (`NT-<short_id>/<task_slug>/feature`)
- **Dependent phase** (`Depends on: Phase X`): base is the branch of the phase that unblocked it (i.e., the dependency phase's branch `NT-<short_id>/<task_slug>/<dependency_phase_slug>`)
- **Multiple dependencies** (`Depends on: Phase X, Phase Y`): **all** dependency branches must be merged into `main` before this phase can start. Base the worktree on `main`. If any dependency branch has not been merged yet, tell the user which ones are outstanding and do not proceed.

**Check if the intended base branch has been merged into `main`**:

```bash
git fetch origin
# For single dependency: check if it's merged
git branch -r --merged origin/main | grep -E "origin/<dependency_branch>$"
# For multiple dependencies: check ALL are merged — if any is missing, stop and tell the user
```

If the base is merged into `main`, use `main` instead.

```bash
git worktree add ../KaiPOS-<phase_slug> -b NT-<short_id>/<task_slug>/<phase_slug> <base_branch>
cd ../KaiPOS-<phase_slug>
```

After creating the worktree and changing into it, all implementation (Steps 3–6) runs inside the worktree directory. Tell the user the worktree path so they know where files are being modified.

### Error handling

If any of the following occur, **stop and ask the user** how to proceed:

- **Branch already exists**: The phase branch name is taken (either locally or on remote). Offer to reuse the existing branch or pick a new name.
- **Worktree path conflict**: The directory `../KaiPOS-<phase_slug>` already exists. Offer to remove the stale worktree (`git worktree remove <path>`) or use a suffixed path (`-2`, `-3`, etc.).
- **Base branch not found**: The intended base branch doesn't exist locally or on remote. Fall back to `main` and inform the user.
- **`Depends on` references invalid phase**: A dependency lists a phase number that doesn't exist in the plan. Warn the user and leave the phase as `blocked` until they fix the plan.

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

In the plan file:

1. Tick off all completed task checkboxes (`- [x]`) and verification checkboxes for this phase.
2. Update the **Phase Status** table:
   - Set the completed phase's status to `done`
   - For each phase that is currently `blocked`, parse its `**Depends on**` field (e.g., `Phase 1, Phase 3`) into a list of dependency phase numbers. Then check the status of **every** listed dependency in the Phase Status table:
     - If **all** dependencies have status `done` → change the blocked phase to `pending`
     - If **some** dependencies are still `pending`, `in-progress`, or `blocked` → leave it as `blocked`
   - If a `**Depends on**` field references a phase number that doesn't exist in the plan, warn the user about the invalid dependency and leave the phase as `blocked`

   Example: Phase 4 has `Depends on: Phase 1, Phase 3`. Phase 1 is now `done` but Phase 3 is `in-progress` → Phase 4 stays `blocked`. Once Phase 3 is also `done`, Phase 4 becomes `pending`.

## Step 6. Commit, push, and create PR

@.claude/includes/commit-and-pr.md

Include additional fields in the PR body:

- Phase: <N> of <total>
- Depends on: <dependency phases or "none">

## Step 7. Clean up worktree and STOP

After the PR is created, clean up the worktree:

```bash
cd /Users/keljohe10/Documents/Personal/KaiPOS
git worktree remove ../KaiPOS-<phase_slug>
```

**Do NOT continue to the next phase.** Tell the user the PR is ready for review.

The user (or their team) will now review the PR. They may come back with feedback, change requests, or questions **in this same conversation**. If they do:

- Re-create the worktree if needed to address feedback
- Address the feedback (fix code, update tests, etc.)
- Run verification again (Step 4)
- Push the changes to the same branch
- Clean up the worktree again

**Do NOT suggest saying "continue" in this conversation.** Each new phase must be a fresh `/kaipos.implement-parallel` invocation after `/clear`.

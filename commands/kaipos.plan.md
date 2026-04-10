---
description: Create a detailed implementation plan for a spec
argument-hint: '(optional) path to spec file'
allowed-tools: Read, Write, Glob, Grep, Agent, AskUserQuestion, Bash(git:*, gh:*, npx pnpm:*), mcp__claude_ai_Notion__notion-fetch
---

You are creating a phased implementation plan from a spec. This works for features, enhancements, bug fixes, or any other task. For small changes that fit in a single PR (~8 files or fewer), consider `/kaipos.quick` instead. Follow the steps below exactly. Always adhere to any rules or requirements set out in any CLAUDE.md files.

**CRITICAL**: This command writes a plan file and nothing else. Do NOT propose implementation, do NOT offer to execute code, do NOT show a plan summary with execution options. The only files you create are the plan (and optionally follow-up.md).

User input: $ARGUMENTS

---

## Step 1. Locate the spec

Find the spec file:

1. If `$ARGUMENTS` contains a file path, use that.
2. Otherwise, derive from the current branch name — the branch should be `NT-<short_id>/<task_slug>/feature`, and the spec lives at `.specs/NT-<short_id>_<task_slug>/spec.md`.
3. If neither works, ask the user to provide the path. **Do not proceed without a valid spec file.**

Read the spec file and extract the `short_id`, `task_slug`, and `notion_page_id`.

Also re-read the Notion ticket via `mcp__claude_ai_Notion__notion-fetch` to check for any updates since the spec was created. If the fetch fails, proceed with the spec as-is.

## Step 2. Deep codebase exploration

@.claude/includes/codebase-exploration.md

## Step 3. Interview the user

@.claude/includes/user-interview.md

## Step 4. Write the phased plan

Create the plan file at `.specs/NT-<short_id>_<task_slug>/plan.md`.

Use the exact structure from the appropriate template:

- **Single-phase**: @.specs/templates/plan.template.md
- **Multi-phase sequential**: @.specs/templates/plan-multi.template.md (phases must be done in order)
- **Multi-phase parallel**: @.specs/templates/plan-parallel.template.md (phases can be implemented simultaneously via `/kaipos.implement-parallel`)

### Choosing the implementation path

After exploration (Step 2) and interview (Step 3), **ask the user which implementation path to use** before writing the plan. Present the options with your recommendation based on what you learned:

- **Single-phase** (`/kaipos.implement`): Work is cohesive, affects ~8 files or fewer, and has no clear breakpoints. Uses the `feature` branch directly — no separate phase branch. The PR targets `main`.
- **Multi-phase sequential** (`/kaipos.implement`): Work is broken into independently reviewable chunks, each phase stacked on the previous one. Phases are implemented one at a time. Use when phases have dependencies that require strict ordering (e.g., schema first, then API, then UI).
- **Multi-phase parallel** (`/kaipos.implement-parallel`): Independent phases can be implemented simultaneously in separate worktrees. Use when phases touch unrelated files or modules with minimal dependencies between them. Requires Phase Status table and Dependency Graph in the plan.

If the scope turns out to be single-phase, consider whether `/kaipos.quick` would be a better fit and suggest it to the user.

### Rules for phases

- Each phase is a coherent, independently reviewable PR
- **Multi-phase plan**: Phases are **stacked** — each targets the previous phase's branch.
  - **First phase** targets the `feature` branch (`NT-<short_id>/<task_slug>/feature`)
  - Subsequent phases target the previous phase branch
  - Branch format: `NT-<short_id>/<task_slug>/<phase_slug>`
- **Target fallback**: if the target branch has already been merged into `main`, use `main` as the target instead. Note this in the plan.
- **`phase_slug`** rules (same as `task_slug`): lowercase, kebab-case, only `a-z`, `0-9`, `-`, max 30 characters. Should describe what the phase does (e.g., `define-request-schema`, `add-search-filters`, `fix-pagination-bug`).
- Every phase must include a **Verification** section with typecheck/lint/build checkboxes
- Every phase must end with the **PHASE GATE** comment block (copy exactly from template)
- Include documentation updates in the relevant phase (not as a separate phase)
- End with a **QA Plan** section for end-to-end verification

### Phase dependency rules (for `/kaipos.implement-parallel`)

Multi-phase plans must include a **Phase Status** table and a **Dependency Graph** section (right after the plan header, before Phase 1). These are used by `/kaipos.implement-parallel` for worktree-based parallel execution — `/kaipos.implement` ignores them.

- Each phase must have a `**Depends on**:` field listing its prerequisites (other phase numbers) or `none` if it can start independently.
- A phase with `Depends on: none` can be implemented in parallel with other independent phases.
- The **Phase Status** table tracks progress: `pending`, `blocked`, `in-progress`, `done`.
- Initialize status: phases with `Depends on: none` start as `pending`; phases with dependencies start as `blocked`.
- Populate the `Unblocks` column by inverting the dependency graph.
- Analyze actual code dependencies to determine the graph — don't assume phases are sequential.

## Step 5. Identify follow-up tasks

Actively analyze the code areas touched by this plan and look for issues that are **out of scope but worth tracking**:

- **Duplication** — code that could be extracted into shared functions or modules
- **Shallow modules** — large interfaces hiding thin implementations that could be deepened
- **Feature envy** — logic that lives far from the data it operates on
- **Hard-to-test code** — tight coupling, hidden dependencies, side effects that make testing difficult
- **Existing code the new plan reveals as problematic** — patterns that will conflict with or be made worse by the planned changes

**Follow-up threshold**: Log something as a follow-up when it's not required for the current task to work correctly, would improve code quality but isn't blocking, or requires significant refactoring beyond the current scope. If it's a quick fix and directly related, include it in the plan instead.

If you find any, create `.specs/NT-<short_id>_<task_slug>/follow-up.md` using @.specs/templates/follow-up.template.md. If nothing meaningful surfaces, skip this step — don't force it.

## Step 6. Summary

After saving, print:

```text
Notion Ticket: NT-<short_id> (<task_title>)
Plan file: .specs/NT-<short_id>_<task_slug>/plan.md
Phases: <count>
```

Do NOT repeat the full plan in chat unless asked.

## Step 7. STOP — Wait for plan approval

@.claude/includes/plan-approval-gate.md

## Step 8. Commit and create PR

1. Commit all files in `.specs/NT-<short_id>_<task_slug>/` (spec + plan + optional follow-up.md)
2. Push the `feature` branch
3. Create a **draft** PR (`gh pr create --draft`) from `NT-<short_id>/<task_slug>/feature` → `main`

Then tell the user:

> Run `/clear` first, then `/kaipos.implement` (single-phase or sequential) or `/kaipos.implement-parallel` (multi-phase parallel) to start implementation with fresh context.

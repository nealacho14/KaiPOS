---
description: Update documentation after code changes
argument-hint: '(optional) description of what changed'
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(npx pnpm:*, git diff:*, git log:*)
---

You are updating the project documentation to reflect recent code changes. Follow the steps below exactly.

User input: $ARGUMENTS

---

## Step 1. Understand what changed

Determine the scope of recent changes:

1. If `$ARGUMENTS` describes what changed, use that as context.
2. Otherwise, inspect the current branch's diff against `main`:
   ```bash
   git diff main...HEAD --stat
   git diff main...HEAD
   ```
3. If there are unstaged/uncommitted changes, also check:
   ```bash
   git diff --stat
   ```

Categorize each change into one of:

- **Behavioral change**: New feature, changed behavior, new API endpoint, changed business rules
- **Structural change**: New package/app, moved files, renamed modules, changed directory layout
- **Configuration change**: New env vars, changed build config, new infrastructure
- **Internal refactor**: Code restructuring that doesn't change behavior or public APIs

Only behavioral, structural, and configuration changes need documentation updates. Internal refactors generally don't.

## Step 2. Identify which docs need updating

Use this decision tree for each change:

### CLAUDE.md updates (root)

- Changed **monorepo structure** (new app/package) → update the Architecture section
- Changed **key commands** → update the Commands section
- Changed **development workflow** or conventions → update the relevant section
- New **environment variables** → update the Environment Variables section
- Changed **infrastructure** → update the Infrastructure & secrets section

### Package/app-level docs

- Changed **backend API routes** or behavior → check if `apps/backend/` has its own README or docs
- Changed **frontend** pages or components → check if `apps/frontend-admin/` has docs
- Changed **shared types or utilities** → check if `packages/shared/` has docs
- Changed **infrastructure** → update `infra/DEPLOYMENT.md` if deployment steps changed

### What NOT to update

- Auto-generated files
- Docs for internal implementation details that aren't developer-facing
- Don't create new documentation files unless the change introduces a wholly new concept that needs its own page

## Step 3. Make the updates

For each doc that needs updating:

1. **Read the current file** to understand its structure and style
2. **Make targeted edits** — update only the sections affected by the change
3. **Match the existing style** — tone, heading levels, formatting conventions
4. **Be factual** — document what the system does, not aspirational features
5. **Keep it concise** — developers read docs to find answers quickly

When adding new sections:

- Place them in logical order relative to existing content
- Use the same heading level pattern as surrounding sections
- Include code examples where they aid understanding

## Step 4. Verify

1. Check that all edited markdown files are valid:
   - No broken relative links
   - Code blocks have language tags
   - Consistent formatting with the rest of the file

## Step 5. Report

Summarize what you updated and why, in a brief list. If any changes were out of scope for documentation (pure internal refactors), mention that no doc updates were needed for those.

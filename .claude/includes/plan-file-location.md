Find the plan file:

1. If `$ARGUMENTS` contains a file path (ends in `.md` or starts with `.specs/`), use that.
2. Otherwise, derive from the current branch name:
   - Get the branch: `git branch --show-current`
   - Expected format: `NT-<short_id>/<task_slug>/...`
   - Plan location: `.specs/NT-<short_id>_<task_slug>/plan.md`
   - Quick plan location: `.specs/NT-<short_id>_<task_slug>/quick-plan.md`
   - Try `plan.md` first, then `quick-plan.md`
3. If neither works, search for plan files: `Glob(".specs/*/plan.md")` and `Glob(".specs/*/quick-plan.md")`
4. If multiple plans exist, ask the user which one to use.
5. **Do not proceed without a valid plan file.**

Read the plan file and extract:

- `short_id` (e.g., `NT-195de922`)
- `task_slug` (e.g., `add-product-search`)
- `notion_page_id` from the metadata table (if present)

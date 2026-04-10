### Commit

Stage all changed files (implementation code + updated plan/spec files). Commit with:

- **Message format**: `NT-<short_id>: <brief description of what was done>`
- Example: `NT-195de922: implement product search endpoint`

Do NOT commit files that contain secrets (`.env`, credentials, keys).

### Push

```bash
git push -u origin <branch_name>
```

### Create draft PR

```bash
gh pr create --draft \
  --title "NT-<short_id>: <task_title>" \
  --body "$(cat <<'EOF'
## Summary
- <bullet points describing what was implemented>

## Notion Ticket
https://notion.so/<notion_page_id_without_dashes>

## Plan
- Plan file: `.specs/NT-<short_id>_<task_slug>/plan.md`
EOF
)"
```

- **Target branch**: `main` for single-phase or Phase 1. For stacked phases, target the previous phase branch.
- If the target branch was already merged into `main`, target `main` instead.

### Update Notion ticket (best-effort)

After creating the PR, call `mcp__claude_ai_Notion__notion-update-page` to set the ticket status to "In Review". If this fails, warn the user but do not block.

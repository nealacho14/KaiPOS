## Notion Integration Patterns

All Notion interactions are **best-effort**. If any Notion MCP tool call fails (rate limit, network, permissions, invalid ID), **warn the user and continue**. Never block the workflow on a Notion failure.

### Fetching ticket details

Use `mcp__claude_ai_Notion__notion-fetch` with the Notion page URL or ID. Extract:

- **Title**: The page title
- **Status**: Look for a `Status` or `Estado` property (select/status type)
- **Priority**: Look for a `Priority` or `Prioridad` property (select type)
- **Description**: The page body content
- **Assignee**: Look for an `Assign` or `Asignado` property (person type)

Property names may vary based on the user's Notion database schema. If a property is not found, skip it — do not error.

### Updating ticket status

Use `mcp__claude_ai_Notion__notion-update-page` to set status at key workflow transitions:

| Workflow Event                                    | Target Status |
| ------------------------------------------------- | ------------- |
| Spec created (`/kaipos.spec`)                     | In Progress   |
| PR created (`/kaipos.implement`, `/kaipos.quick`) | In Review     |
| QA passed (`/kaipos.qa`)                          | Done          |
| QA failed (`/kaipos.qa`)                          | QA Failed     |

If the status property name or allowed values don't match, warn the user and ask them to confirm the correct property name and value. Do NOT retry with guesses.

### Posting comments

Use `mcp__claude_ai_Notion__notion-get-comments` to read existing discussion on a ticket.

Comments are useful for:

- Investigation summaries (`/kaipos.investigate`)
- QA results summaries (`/kaipos.qa`)

### Creating tickets

Use `mcp__claude_ai_Notion__notion-create-pages` to create new Notion pages for follow-up tasks. Requires knowing the parent database ID — ask the user if not available.

### Notion URL construction

To link back to a Notion page from PRs and specs, construct:
`https://notion.so/<notion_page_id_without_dashes>`

Example: For UUID `195de922-1179-449f-ab80-75a27c979105`, the URL is:
`https://notion.so/195de9221179449fab8075a27c979105`

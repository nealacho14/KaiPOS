Parse `$ARGUMENTS` to extract a Notion ticket reference and derive identifiers.

**Accepted input formats:**

1. **Notion URL**: `https://www.notion.so/workspace/Page-Title-195de9221179449fab8075a27c979105` or `https://notion.so/195de922-1179-449f-ab80-75a27c979105`
2. **Full UUID**: `195de922-1179-449f-ab80-75a27c979105`
3. **Short ID + description**: `NT-195de922 short description of what to do`

**Extraction steps:**

1. Look for a 32-character hex string (with or without dashes) at the end of a URL or as a standalone token. Strip dashes to get the raw UUID.
2. Call `mcp__claude_ai_Notion__notion-fetch` with the page URL or ID to retrieve the ticket's **title**, **status**, **priority**, and **description/body content**.
3. If the Notion fetch fails (network, permissions, invalid ID), warn the user but do NOT stop. Ask the user to provide the task title and description manually.

**Derive these values:**

1. **`notion_page_id`** — The full Notion page UUID (with dashes): e.g., `195de922-1179-449f-ab80-75a27c979105`
2. **`short_id`** — `NT-` + first 8 hex characters of the UUID (no dashes): e.g., `NT-195de922`
3. **`task_slug`** — Derived from the Notion page title (or user description if no title): lowercase, kebab-case, only `a-z`, `0-9`, `-`, max 30 characters. E.g., `add-product-search`
4. **`task_title`** — The Notion page title as-is (or user-provided description). E.g., `Add product search endpoint`

If `$ARGUMENTS` is empty or doesn't contain a recognizable Notion reference, ask the user to provide a Notion ticket URL using AskUserQuestion.

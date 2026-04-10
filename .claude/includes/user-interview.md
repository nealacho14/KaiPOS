Interview the user to clarify requirements and constraints. Use AskUserQuestion in **multiple rounds** — don't try to collect everything at once.

**Round 1 — Core requirements**

Ask about the essential what and why:

- What is the desired end state?
- What problem does this solve or what value does it add?
- Are there specific acceptance criteria?

Skip questions you can already answer from the Notion ticket description or prior conversation context.

**Round 2 — Constraints and edge cases**

Based on the first answers, drill into:

- Are there performance, security, or UX constraints?
- What edge cases should be handled?
- Are there dependencies on other work or external systems?

**Round 3+ — Technical decisions (if needed)**

If there are meaningful design choices (e.g., which approach to use, API shape, data model), present the options with your recommendation and let the user decide.

**Rules:**

- Don't ask questions you can answer from the codebase exploration or Notion ticket
- Don't ask more than 3 questions per round
- Stop interviewing when you have enough context to write the spec or plan
- If the user says "just go with your best judgment", do so — don't push for more detail

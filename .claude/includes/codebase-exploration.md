Before writing anything, explore the codebase to understand relevant existing code. Use Glob, Grep, and Read to find:

- **Related files** — components, modules, functions that touch the same domain or feature area
- **Similar patterns** — how the codebase handles comparable features (e.g., if adding a new API route, look at existing routes for patterns)
- **Shared utilities** — existing helpers in `packages/shared` that can be reused
- **Data models** — relevant types in `packages/shared/types` and database collections in `apps/backend/src/db/`
- **Existing conventions** — naming, file organization, import patterns
- **CLAUDE.md files** — project-level and package-level instructions that must be followed

KaiPOS monorepo areas to check based on scope:

| If the change involves... | Explore...                                                                     |
| ------------------------- | ------------------------------------------------------------------------------ |
| Backend API routes        | `apps/backend/src/functions/`, `apps/backend/src/index.ts` (local Hono routes) |
| Database operations       | `apps/backend/src/db/client.ts`, `apps/backend/src/db/collections.ts`          |
| Frontend pages/components | `apps/frontend-admin/src/`                                                     |
| Shared types              | `packages/shared/src/types/`                                                   |
| Shared utilities          | `packages/shared/src/utils/`                                                   |
| Infrastructure/deployment | `infra/lib/`, `infra/bin/`                                                     |

Document what you find — these findings inform the spec, plan, or implementation.

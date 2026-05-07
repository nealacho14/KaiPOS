# @kaipos/e2e

Cypress end-to-end suite for the KaiPOS admin SPA. Runs against any deployed
frontend (default: local `pnpm dev` on `http://localhost:3000`; in CI: the
staging URL configured in GitHub Actions Variables as `CYPRESS_BASE_URL`).

## Quick start (local)

```bash
# from repo root, in one terminal
pnpm dev                       # backend :4000 + frontend :3000

# in another terminal
pnpm --filter @kaipos/e2e cy:open
# or, headless
pnpm --filter @kaipos/e2e cy:run
# convenience alias from repo root
pnpm e2e
```

The first run installs the Cypress binary (~250 MB cache).

## Required environment

Copy `apps/e2e/.env.example` to `apps/e2e/.env`, or export the variables in
your shell. Cypress strips the `CYPRESS_` prefix automatically:
`CYPRESS_USER_ADMIN_EMAIL` is read as `Cypress.env('USER_ADMIN_EMAIL')`.

| Variable                                    | Purpose                                |
| ------------------------------------------- | -------------------------------------- |
| `CYPRESS_BASE_URL`                          | Frontend URL the suite drives.         |
| `CYPRESS_USER_ADMIN_EMAIL` / `..._PASSWORD` | Pre-seeded admin used by `auth.cy.ts`. |

> Phase 2 will add `CYPRESS_USER_<ROLE>_*` for `manager`, `supervisor`,
> `cashier`, `waiter`, `kitchen`, plus a parallel set for the second
> tenant business (`cypress-biz-b`).

## Why no `test` script?

This workspace deliberately omits a `test` script so the repo-wide
`pnpm test` (run by the pre-commit hook and the `quality` CI job) does
not invoke Cypress. Cypress needs a running frontend and an installed
binary — neither is appropriate for the lint/unit-test loop. The
dedicated `e2e` CI job introduced in Phase 4 invokes Cypress directly
(`pnpm --filter @kaipos/e2e cy:run`).

## Custom commands

Defined in `src/support/commands.ts` and typed via `cypress.d.ts`:

- `cy.apiLogin(email, password)` — POSTs `/api/auth/login` and writes the
  same `kaipos:accessToken` / `kaipos:refreshToken` / `kaipos:user` keys
  the SPA expects in `localStorage`.
- `cy.loginAs(role)` — wrapper that maps a role (`'admin' | 'manager' |
'supervisor' | 'cashier' | 'waiter' | 'kitchen'`) to the env-driven
  credentials and calls `cy.apiLogin`.
- `cy.logout()` — best-effort POST to `/api/auth/logout`, then clears the
  session keys.

## Staging seed contract

The Cypress suite in this phase only needs the pre-existing admin user
that ships with the default `db:seed` (`admin@lacocinadekai.com` /
`admin123`). Phase 2 introduces `db:seed-cypress`, which provisions:

- Two tenants: `cypress-biz-a` and `cypress-biz-b`.
- One branch per tenant.
- One user per role (`admin`, `manager`, `supervisor`, `cashier`,
  `waiter`, `kitchen`) per tenant — so cross-tenant scoping can be
  exercised without polluting demo data.

The script will be idempotent and refuse to run against Atlas under the
same guards as `db:seed`. SKUs created inside Cypress will be prefixed
`CYP-` (and, in CI, `CYP-${GITHUB_RUN_ID}-` to avoid cross-run
collisions when several PRs hit staging in parallel).

## Conventions

- Specs live under `src/**/*.cy.ts` (one file per area).
- Never create or delete user accounts from inside a test — only mutate
  transient data (e.g. a product the test created), and clean it up in
  `afterEach`.
- Prefer API-level fixtures (`cy.apiLogin`, future `cy.apiCreateProduct`)
  over driving the UI when the goal is to set up state, not exercise a
  flow.

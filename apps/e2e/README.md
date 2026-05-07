# @kaipos/e2e

Cypress end-to-end suite for the KaiPOS admin SPA. Runs against any deployed
frontend (default: local `pnpm dev` on `http://localhost:3000`; in CI: the
staging URL configured in GitHub Actions Variables as `CYPRESS_BASE_URL`).

## Quick start (local)

```bash
# from repo root, in one terminal
pnpm dev                       # backend :4000 + frontend :3000

# provision the Cypress fixtures once (idempotent — safe to rerun)
pnpm --filter @kaipos/backend db:seed-cypress

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
`CYPRESS_USER_ADMIN_A_EMAIL` is read as `Cypress.env('USER_ADMIN_A_EMAIL')`.

| Variable                                       | Purpose                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `CYPRESS_BASE_URL`                             | Frontend URL the suite drives.                                           |
| `CYPRESS_USER_ADMIN_EMAIL` / `..._PASSWORD`    | Pre-seeded admin from `db:seed` (used by `auth.cy.ts` only).             |
| `CYPRESS_USER_<ROLE>_<TENANT>_EMAIL/_PASSWORD` | Per-(role × tenant) accounts from `db:seed-cypress`. See `.env.example`. |
| `CYPRESS_USER_SUPER_ADMIN_EMAIL/_PASSWORD`     | Global super_admin from `db:seed-cypress` (no tenant suffix).            |

`<ROLE>` is one of `ADMIN`, `MANAGER`, `SUPERVISOR`, `CASHIER`, `WAITER`,
`KITCHEN`. `<TENANT>` is `A` (cypress-biz-a) or `B` (cypress-biz-b).

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
- `cy.loginAs(role, tenant?)` — wrapper that maps a role to env-driven
  credentials and calls `cy.apiLogin`. Defaults to tenant `'a'`. Pass
  `'b'` for cross-tenant scenarios. `super_admin` ignores the tenant arg.
- `cy.logout()` — best-effort POST to `/api/auth/logout`, then clears the
  session keys.
- `cy.apiCreateProduct({ branchId, name, price, category, sku, ... })` —
  creates a product via the API using the current session. Returns the
  created row so its `_id` can drive cleanup. Prefix the SKU with
  `cypressSkuPrefix()` from `src/support/fixtures.ts` so the cleanup
  helper finds it.
- `cy.apiDeleteProduct(id)` — DELETE a product by id; tolerates 404 so
  it's safe in idempotent `afterEach` paths.
- `cy.apiFindProductsBySku(branchId, prefix)` — lists products on a
  branch and filters client-side to those starting with `prefix`. Used
  by `afterEach` in `products.cy.ts` to sweep leftovers from failed tests.

## Staging seed contract

`pnpm --filter @kaipos/backend db:seed-cypress` provisions (idempotently):

| Tenant          | `_id`                                  | Branch `_id`                           | Fixed product `_id`                    |
| --------------- | -------------------------------------- | -------------------------------------- | -------------------------------------- |
| `cypress-biz-a` | `00000000-0000-4000-8000-000000009100` | `00000000-0000-4000-8000-000000009110` | `00000000-0000-4000-8000-000000009130` |
| `cypress-biz-b` | `00000000-0000-4000-8000-000000009200` | `00000000-0000-4000-8000-000000009210` | `00000000-0000-4000-8000-000000009230` |

Per-tenant accounts (`<role>` ∈ `admin manager supervisor cashier waiter kitchen`):

- `cypress-<role>-a@cypress.test` / password `cypress-<role>-pass-1`
- `cypress-<role>-b@cypress.test` / password `cypress-<role>-pass-1`

Global:

- `cypress-super-admin@cypress.test` / password `cypress-super-admin-pass-1`

The same anti-Atlas guards as `db:seed` apply: refuses to run with
`MONGO_SECRET_ARN` set or against a `mongodb+srv://` URI. Provision staging
either by running this script from a workstation with a tunnel to the
staging Mongo, or via a one-shot post-deploy job.

The fixed product/category IDs let the multi-tenant suite assert
cross-tenant 404s without doing a transient login to discover IDs.

### SKU prefix reservation

Every product the Cypress suite creates uses an SKU starting with
`CYP-${GITHUB_RUN_ID || 'local'}-`. `cleanup` in `afterEach` lists by
that prefix so concurrent CI runs (multiple PRs against the same
staging) don't fight over rows. Do **not** use the `CYP-` prefix for
demo or production data.

The CI job (`.github/workflows/ci.yml`) sets
`CYPRESS_GITHUB_RUN_ID: ${{ github.run_id }}` so the prefix helper at
`src/support/fixtures.ts:cypressSkuPrefix` resolves to a unique value
per workflow run.

## CI configuration

The `e2e` job in `.github/workflows/ci.yml` runs Cypress in parallel
with `quality`. Both must pass for `deploy` to run on `main`. The job
auto-skips if `vars.CYPRESS_BASE_URL` is not set so a fork without
staging credentials can still run lint/typecheck/test.

Configure the following as repo-level **GitHub Actions Variables**
(Settings → Secrets and variables → Actions → Variables tab — _not_
Secrets, since these point at a documented staging environment):

| Variable                                              | Value                                            |
| ----------------------------------------------------- | ------------------------------------------------ |
| `CYPRESS_BASE_URL`                                    | URL of the staging admin SPA                     |
| `CYPRESS_USER_ADMIN_EMAIL` / `..._PASSWORD`           | Pre-seed admin (auth.cy.ts)                      |
| `CYPRESS_USER_<ROLE>_<TENANT>_EMAIL` / `..._PASSWORD` | Per-role × per-tenant accounts from seed-cypress |
| `CYPRESS_USER_SUPER_ADMIN_EMAIL` / `..._PASSWORD`     | Global super_admin from seed-cypress             |

`<ROLE>` ∈ `ADMIN MANAGER SUPERVISOR CASHIER WAITER KITCHEN`,
`<TENANT>` ∈ `A B`. The full list (28 variables) lives in the workflow
file — copy each name verbatim into the Variables tab.

Cypress strips the `CYPRESS_` prefix at runtime, so the suite reads
e.g. `CYPRESS_USER_ADMIN_A_EMAIL` as `Cypress.env('USER_ADMIN_A_EMAIL')`.

## Conventions

- Specs live under `src/**/*.cy.ts` (one file per area).
- Never create or delete user accounts from inside a test — only mutate
  transient data (e.g. a product the test created), and clean it up in
  `afterEach`.
- Prefer API-level fixtures (`cy.apiLogin`, `cy.apiCreateProduct`) over
  driving the UI when the goal is to set up state, not exercise a flow.
- The fixed seeded category/product/branch IDs (`CYPRESS_FIXTURES` in
  `src/support/fixtures.ts`) are stable across reruns — assert against
  them directly in scoping tests instead of discovering at runtime.

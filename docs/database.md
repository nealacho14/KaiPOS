# Database & RBAC

External reader contract (Ferna): see [ferna-integration.md](ferna-integration.md).

## Setup and seed scripts

- `apps/backend/src/db/setup.ts` — creates all collections with `$jsonSchema` validators and indexes (idempotent via `collMod` + `createIndex`). Runs against local/Docker Mongo, and against prod Atlas only from a workstation with a tunnel (or as a one-shot post-deploy job) — never via `pnpm dev` against Atlas, which the backend refuses. Exposed as `pnpm --filter @kaipos/backend db:setup`.
- `apps/backend/src/db/seed.ts` — inserts the real menu of the café **Mura** (business slug `mura`, 1 branch "Alianza Colombo-Francesa", 2 admin users, 13 categories, 64 products, 5 featured `productPreferences`; no kitchen station). The data lives in the pure module `apps/backend/src/db/seed-data/mura-menu.ts` (fixed UUIDs, kebab-case SKUs that double as Ferna slugs, modifier group ids `metodo` / `leche` / `extras` / `michelada` / `adiciones-comida`). Idempotent: skips if business `mura` already exists. **Guard: refuses to run if `MONGO_SECRET_ARN` is set or `MONGO_URI` contains `mongodb+srv://`** — Docker/local only (`db:seed-atlas` reuses `seedData` for prod). Passwords hashed at runtime via `src/lib/password.ts` (`hashPassword`). Env: `MURA_ADMIN_PASSWORD` for `admin@mura.co` (local fallback `admin123`, required on Atlas); `kelvin.hernandezc30@gmail.com` carries its `passwordHash` over from an existing user doc with the same email in another business (the unique index is `{businessId, email}`, so both coexist), else uses `MURA_KELVIN_PASSWORD`, else is skipped locally / aborts on Atlas; `MURA_IMAGE_BASE_URL` overrides the CDN base of the placeholder `imageUrl` (`products/<branchId>/placeholder.webp`, file at `seed-data/assets/product-placeholder.webp`, uploaded once by the operator — the seed never touches S3). Exposed as `pnpm --filter @kaipos/backend db:seed`.
- `apps/backend/scripts/export-mura-fixture.ts` — `pnpm --filter @kaipos/backend menu:export` prints `{ business, branch, categories, products, productPreferences }` from the same module as deterministic JSON (fixed `2026-01-01` timestamps, ISO dates) on stdout. No DB, no logs. This is the fixture handed to the external app Ferna.
- `apps/backend/src/db/purge-business.ts` — **Purging a business.** Deletes every document that belongs to one business, resolved by slug. Exposed as `pnpm --filter @kaipos/backend db:purge-business -- --slug <slug> [--expect-carried-over <email>]... [--yes]`.
  - **Dry-run first, always.** Without `--yes` the script only runs `countDocuments` per collection and prints what it _would_ delete; nothing is written. Re-run with `--yes` only after the counts look right.
  - `--expect-carried-over <email>` (repeatable) asserts that a user with that email already exists under a **different** `businessId` before anything is deleted — use it when an account was re-created in the successor business. Any missing email aborts the run with a non-zero exit.
  - Slugs matching `^cypress-` (`cypress-biz-a`, `cypress-biz-b`) are refused before a connection is opened; an unknown slug exits non-zero with "not found".
  - Deletion order is child-first so an interrupted run never leaves orphans with a missing parent: `refreshTokens` and `passwordResetTokens` (by the business's `userId`s), `loginAttempts` (by the users' emails), `auditLogs` (by `businessId` or `userId`), then `orders`, `productPreferences`, `products`, `categories`, `kitchenStations`, `users`, `branches` (by `businessId`), and finally the `businesses` document itself.
  - **Never touched:** other businesses, the super_admin user (`businessId: '*'`), S3 objects (the script logs the `products/<branchId>/` prefixes it leaves behind so they can be cleaned by hand), and DynamoDB WebSocket connections.
  - Against prod Atlas, run from a workstation with the `personal` AWS profile so the URI is read from Secrets Manager: `AWS_PROFILE=personal MONGO_SECRET_ARN=<arn> pnpm --filter @kaipos/backend db:purge-business -- --slug <slug> --expect-carried-over <email>` (dry-run), then the same command with `--yes`. The script prints a loud "targeting Atlas" banner whenever `MONGO_SECRET_ARN` is set.

## RBAC

Authorization is enforced per-route after `requireAuth()` via `requirePermission(permission)` middleware in `src/middleware/authorize.ts`.

- Roles (in code, English only): `super_admin`, `admin`, `manager`, `supervisor`, `cashier`, `waiter`, `kitchen`.
- The `role → Permission[]` map lives in `@kaipos/shared/permissions`. Permissions are `resource:action` strings (e.g., `users:read`, `products:write`). Permissions are derived from the role at request time — they are not embedded in the JWT. Backend and frontend both import from the same subpath.
- `super_admin` bypasses both the permission check and `businessId` tenant isolation. Their stored `businessId` is the sentinel `SUPER_ADMIN_BUSINESS_ID = '*'` (also exported from `@kaipos/shared/permissions`).
- Denials are audited: middleware fires a `logAuditEvent({ action: 'authorization_failed', metadata: { permission, route, method } })` and returns 403 with the generic message `Insufficient permissions`.
- User CRUD lives in `src/routes/users.ts` and `src/services/users.ts`. Cross-tenant reads return 404 (not 403) so existence isn't leaked. Managers can only assign roles in `{supervisor, cashier, waiter, kitchen}`; violations also emit `authorization_failed`.
- Branch access is enforced by `requireBranchAccess(paramName)` in `src/middleware/branch-access.ts`. It bypasses when the role has `branches:manage` (admin + super_admin) and otherwise checks the `branchIds` carried on the JWT — no per-request DB lookup. `branchIds` is populated by `login`/`refresh` from the user record and refreshed on every refresh-token rotation.

### Permission checks vs. tenant-isolation role checks

Authorization decisions (who can do what) MUST go through `hasPermission(role, permission)` / `requirePermission(permission)` — never inline `role === '...'` in route/service code. The one legitimate exception is tenant-isolation scoping for `super_admin` (who has `businessId === '*'` and therefore needs special handling to scope queries to a specific `businessId`, e.g. in `src/services/users.ts`). If you add a new `role === '...'` check, it must be for tenant scoping, not authorization — otherwise use `hasPermission`.

### Shared module

`Permission`, `ROLE_PERMISSIONS`, `hasPermission`, and `SUPER_ADMIN_BUSINESS_ID` live in `@kaipos/shared` (also importable from `@kaipos/shared/permissions`). Both backend and frontend import from there — there is no local shim.

## Atlas runbooks

All commands run from a workstation with `AWS_PROFILE=personal`, Node 20 (`.nvmrc`) and

```bash
export AWS_PROFILE=personal
export MONGO_SECRET_ARN=arn:aws:secretsmanager:us-east-1:773689548112:secret:kaipos/prod/mongo-uri-1Qsn38
```

### Cutover to the Mura menu (one-off, 2026-09)

Replaces the `la-cocina-de-kai` demo business with `mura` while keeping the Cypress fixture
businesses and the super_admin. Order matters: seed **before** purge so the carry-over admin keeps
its password hash.

1. Deploy `main` containing the seed, purge and upload changes (`pnpm deploy:prod`). Fill the
   `TODO(mura)` contact placeholders in `apps/backend/src/db/seed-data/mura-menu.ts` first.
2. Upload the placeholder image once:
   ```bash
   aws s3 cp apps/backend/src/db/seed-data/assets/product-placeholder.webp \
     s3://kaipos-assets-prod/products/00000000-0000-4000-8000-000000001100/placeholder.webp \
     --content-type image/webp --cache-control "public, max-age=31536000, immutable"
   curl -I https://d6tpeu874uebt.cloudfront.net/products/00000000-0000-4000-8000-000000001100/placeholder.webp
   ```
3. Dry-run the purge (deletes nothing; the carry-over expectation is expected to FAIL here because
   the Mura copy of the account does not exist yet):
   ```bash
   pnpm --filter @kaipos/backend db:purge-business -- --slug la-cocina-de-kai \
     --expect-carried-over kelvin.hernandezc30@gmail.com
   ```
4. Seed Mura (password from a password manager, never typed inline in the command):
   ```bash
   read -s MURA_ADMIN_PASSWORD; export MURA_ADMIN_PASSWORD
   pnpm --filter @kaipos/backend db:seed-atlas
   ```
   Expected log: `carried over passwordHash from business …0100`, 13 categories, 64 products,
   5 preferences, 2 users.
5. Verify (read-only): one `businesses` doc with `slug: 'mura'`, 64 `products` with
   `businessId …1000`, two `users` docs for `kelvin.hernandezc30@gmail.com` with identical
   `passwordHash`.
6. Log in to the prod admin as `kelvin.hernandezc30@gmail.com` (existing password) and
   `admin@mura.co` (new password); the Mura catalog renders.
7. Purge for real (the expectation now passes):
   ```bash
   pnpm --filter @kaipos/backend db:purge-business -- --slug la-cocina-de-kai \
     --expect-carried-over kelvin.hernandezc30@gmail.com --yes
   ```
   Verify: businesses = `mura`, `cypress-biz-a`, `cypress-biz-b`; no `users` with
   `businessId …0100`; super_admin `…9000` intact.
8. GitHub → Settings → Variables: `CYPRESS_USER_ADMIN_EMAIL=admin@mura.co`,
   `CYPRESS_USER_ADMIN_PASSWORD=<MURA_ADMIN_PASSWORD>`. Re-run the post-deploy e2e job and confirm it
   is green.
9. Atlas UI: create DB user `ferna-reader` (role `read` on `kaipos`), add Ferna's egress to Network
   Access, hand the URI to the Ferna side together with `pnpm --filter @kaipos/backend menu:export`
   output. Optional: delete `s3://kaipos-assets-prod/products/00000000-0000-4000-8000-00000000020{0,1,2}/`.

Re-running any step is safe: `db:seed-atlas` skips when slug `mura` exists and the purge exits
non-zero once the business is gone.

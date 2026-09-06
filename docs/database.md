# Database & RBAC

## Setup and seed scripts

- `apps/backend/src/db/setup.ts` — creates all collections with `$jsonSchema` validators and indexes (idempotent via `collMod` + `createIndex`). Runs against local/Docker Mongo, and against prod Atlas only from a workstation with a tunnel (or as a one-shot post-deploy job) — never via `pnpm dev` against Atlas, which the backend refuses. Exposed as `pnpm --filter @kaipos/backend db:setup`.
- `apps/backend/src/db/seed.ts` — inserts the real menu of the café **Mura** (business slug `mura`, 1 branch "Alianza Colombo-Francesa", 2 admin users, 13 categories, 64 products, 5 featured `productPreferences`; no kitchen station). The data lives in the pure module `apps/backend/src/db/seed-data/mura-menu.ts` (fixed UUIDs, kebab-case SKUs that double as Ferna slugs, modifier group ids `metodo` / `leche` / `extras` / `michelada` / `adiciones-comida`). Idempotent: skips if business `mura` already exists. **Guard: refuses to run if `MONGO_SECRET_ARN` is set or `MONGO_URI` contains `mongodb+srv://`** — Docker/local only (`db:seed-atlas` reuses `seedData` for prod). Passwords hashed at runtime via `src/lib/password.ts` (`hashPassword`). Env: `MURA_ADMIN_PASSWORD` for `admin@mura.co` (local fallback `admin123`, required on Atlas); `kelvin.hernandezc30@gmail.com` carries its `passwordHash` over from an existing user doc with the same email in another business (the unique index is `{businessId, email}`, so both coexist), else uses `MURA_KELVIN_PASSWORD`, else is skipped locally / aborts on Atlas; `MURA_IMAGE_BASE_URL` overrides the CDN base of the placeholder `imageUrl` (`products/<branchId>/placeholder.webp`, file at `seed-data/assets/product-placeholder.webp`, uploaded once by the operator — the seed never touches S3). Exposed as `pnpm --filter @kaipos/backend db:seed`.
- `apps/backend/scripts/export-mura-fixture.ts` — `pnpm --filter @kaipos/backend menu:export` prints `{ business, branch, categories, products, productPreferences }` from the same module as deterministic JSON (fixed `2026-01-01` timestamps, ISO dates) on stdout. No DB, no logs. This is the fixture handed to the external app Ferna.

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

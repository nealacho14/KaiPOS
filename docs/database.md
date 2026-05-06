# Database & RBAC

## Setup and seed scripts

- `apps/backend/src/db/setup.ts` — creates all collections with `$jsonSchema` validators and indexes (idempotent via `collMod` + `createIndex`). Runs anywhere: local, Docker, and Atlas prod. Exposed as `pnpm --filter @kaipos/backend db:setup`.
- `apps/backend/src/db/seed.ts` — inserts demo data (1 business "La Cocina de Kai", 1 branch, 2 users, 5 categories, 10 products, 3 modifiers, 6 tables). **Guard: refuses to run if `MONGO_SECRET_ARN` is set or `MONGO_URI` contains `mongodb+srv://`** — Docker/local only. Passwords hashed at runtime via `src/lib/password.ts` (`hashPassword`). Seeded users: `admin@lacocinadekai.com` / `admin123` and `cajero@lacocinadekai.com` / `cajero123`. Idempotent: skips if business `la-cocina-de-kai` already exists. Exposed as `pnpm --filter @kaipos/backend db:seed`.

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

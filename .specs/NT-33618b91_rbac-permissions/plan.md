# Plan: Paso 7 — Sistema de Roles y Permisos (RBAC)

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Notion Ticket  | [NT-33618b91](https://notion.so/33618b913fdd812ea17bea220512046f) |
| Spec           | `.specs/NT-33618b91_rbac-permissions/spec.md`                     |
| Feature Branch | `NT-33618b91/rbac-permissions/feature`                            |
| Target         | `main`                                                            |

<!-- Multi-phase sequential plan. Phases are stacked — each targets the previous phase's branch.
     Phase 1 targets the feature branch; subsequent phases target the previous phase.
     Use `/kaipos.implement` to implement one phase at a time. -->

## Decisions locked during planning

- **Role map** (`role → Permission[]`):
  - `super_admin`: **all permissions + `platform:manage`**; bypasses `businessId` isolation.
  - `admin`: all permissions of its business **except `platform:manage`**.
  - `manager`: `products:read/write`, `orders:read/update/cancel`, **`users:read` + `users:write`** (restricted to target roles in `{supervisor, cashier, waiter, kitchen}`), `reports:view`.
  - `supervisor`: `products:read`, `orders:read/update/cancel`, `reports:view`.
  - `cashier`: `products:read`, `orders:create/read/update`.
  - `waiter`: `products:read`, `orders:create/read`.
  - `kitchen`: `orders:read/update`.
- **`POST /auth/register` is removed.** All authenticated user creation goes through `POST /api/users` protected by `users:write`.
- **`DELETE /api/users/:id` is soft-delete** (`isActive = false`). Consistent with existing `login` check. Idempotent.
- **`super_admin` tenant filter**: `?businessId=<id>` query param on `GET /api/users`. If omitted, returns users across **all** businesses (super_admin only).
- **Audit `metadata.permission`**: plain string, e.g. `"users:read"`. Shape: `{ permission, route, method }`.
- **Manager role boundary**: when `manager` creates or edits a user, target role **must** be in `{supervisor, cashier, waiter, kitchen}`. Otherwise 403 with `authorization_failed`.

---

## Phase 1: Permissions foundation — types, permission map, DB schema

**Branch**: `NT-33618b91/rbac-permissions/permissions-foundation`
**Targets**: `NT-33618b91/rbac-permissions/feature`

Introduces the role/permission model without yet protecting any endpoints. All subsequent phases import from here.

### Tasks

- [x] Extend `UserRole` in `packages/shared/src/types/index.ts` to:
      `'super_admin' | 'admin' | 'manager' | 'supervisor' | 'cashier' | 'waiter' | 'kitchen'`.
- [x] Add `'authorization_failed'` to `AuditAction` union in `packages/shared/src/types/index.ts`.
- [x] Create `apps/backend/src/lib/permissions.ts`:
  - Export `Permission` string-literal union for all 14 permissions in the spec (`products:read/write/delete`, `orders:create/read/update/cancel`, `users:read/write/delete`, `reports:view`, `business:manage`, `branches:manage`, `platform:manage`).
  - Export `ROLE_PERMISSIONS: Record<UserRole, Permission[]>` with the role map from the decisions section above.
  - Export `hasPermission(role: UserRole, permission: Permission): boolean` — `super_admin` returns `true` for everything (bypass); otherwise lookup in the map.
  - Export `SUPER_ADMIN_BUSINESS_ID = '*'` constant for `businessId` bypass sentinel.
- [x] Write `apps/backend/src/lib/permissions.test.ts`:
  - Parameterized matrix: every role × every permission. Assert returned boolean matches `ROLE_PERMISSIONS`.
  - `super_admin` returns `true` for every permission (including hypothetical unlisted ones).
  - `cliente` or other unknown role returns `false` (TS coverage — cast via `as UserRole`).
- [x] Extend `users` `$jsonSchema` in `apps/backend/src/db/setup.ts`:
      `role: { enum: ['super_admin', 'admin', 'manager', 'supervisor', 'cashier', 'waiter', 'kitchen'] }`.
- [x] Extend `auditLogs` `$jsonSchema` `action.enum` in `apps/backend/src/db/setup.ts` with `'authorization_failed'`.
- [x] Update `apps/backend/src/schemas/auth.ts` `registerSchema.role` enum to match the new `UserRole` union (still used by `/auth/register` in this phase; removed in Phase 3).
- [x] Sanity-check that `db:seed` still runs against the updated `$jsonSchema` (admin/cashier values remain valid; no seed data changes required).

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm --filter @kaipos/backend test -- permissions` passes (new `permissions.test.ts`)
- [x] Manual: `pnpm docker:up`, then `pnpm --filter @kaipos/backend db:setup` succeeds and `pnpm --filter @kaipos/backend db:seed` still succeeds end-to-end.
- [x] Manual: `curl -X POST :4001/api/auth/login` for `admin@lacocinadekai.com` / `admin123` still returns a token.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 2: `requirePermission` middleware + audit emission

**Branch**: `NT-33618b91/rbac-permissions/authorize-middleware`
**Targets**: `NT-33618b91/rbac-permissions/permissions-foundation`

Adds the authorization middleware that all future protected routes will use. No routes are wired yet — just the middleware and its tests.

### Tasks

- [ ] Create `apps/backend/src/middleware/authorize.ts`:
  - `export function requirePermission(permission: Permission): MiddlewareHandler<AppEnv>`.
  - Preconditions: `c.get('user')` must be set (if missing, throw `UnauthorizedError` — matches `requireAuth` behavior when chained incorrectly).
  - Happy path: `hasPermission(user.role, permission)` → `await next()`.
  - Deny path: fire-and-forget `logAuditEvent({ action: 'authorization_failed', target: user.userId, userId: user.userId, businessId: user.businessId, metadata: { permission, route: c.req.path, method: c.req.method } })`, then `throw new ForbiddenError('Insufficient permissions')`.
  - Follow the style of `middleware/branch-access.ts` (arrow returning `MiddlewareHandler<AppEnv>`).
- [ ] Create `apps/backend/src/middleware/authorize.test.ts` following `branch-access.test.ts` pattern:
  - Injects `user` via `X-Test-User` header; mounts a dummy protected `GET /protected`.
  - Cases:
    - no user on context → `401` (Unauthorized).
    - every role × every permission matrix via `it.each` — assert 200 when `hasPermission` is true, 403 otherwise.
    - 403 path also asserts `logAuditEvent` was called once with the expected `{ action, metadata.permission, metadata.route, metadata.method, userId, businessId }`.
    - `super_admin` with a permission not listed in `ROLE_PERMISSIONS[super_admin]` (e.g., a made-up one cast to `Permission`) still gets 200 (bypass).
  - Mock `../services/audit.js` `logAuditEvent` via `vi.mock`.
- [ ] Target ≥ 90% line coverage on `authorize.ts` (verified via `pnpm --filter @kaipos/backend test -- --coverage`).

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds
- [ ] `pnpm --filter @kaipos/backend test` passes (incl. new `authorize.test.ts`)
- [ ] Coverage report for `authorize.ts` ≥ 90% lines.
- [ ] Manual: no behavioral change in running backend — middleware exists but is not wired anywhere yet.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 3: `/api/users` CRUD + retire `/auth/register` + docs

**Branch**: `NT-33618b91/rbac-permissions/users-crud-endpoints`
**Targets**: `NT-33618b91/rbac-permissions/authorize-middleware`

Ships the first consumer of `requirePermission` and proves end-to-end behavior.

### Tasks

**Schemas & service**

- [ ] Create `apps/backend/src/schemas/users.ts` with Zod schemas:
  - `listUsersQuerySchema`: `{ businessId?: string }` (only honored for `super_admin`).
  - `createUserSchema`: same shape as today's `registerSchema` (`email`, `password` ≥ 8, `name`, `role` in new enum, `branchIds?`).
  - `updateUserSchema`: `{ name?, role?, branchIds?, isActive? }` — all optional, at least one key required (`z.object({...}).refine(...)`).
  - `userIdParamSchema`: `{ id: z.string().uuid() }`.
- [ ] Create `apps/backend/src/services/users.ts` with pure service functions that accept the acting `TokenPayload`:
  - `listUsers(actor, query) → SafeUser[]` — builds Mongo filter:
    - `super_admin` + no query filter → no `businessId` filter.
    - `super_admin` + `query.businessId` → filter by that id.
    - otherwise → filter by `actor.businessId`.
  - `getUserById(actor, id) → SafeUser` — scopes filter to actor's `businessId` unless `super_admin`. Missing → `NotFoundError` (never 403, per spec).
  - `createUser(actor, data) → SafeUser` — determines `targetBusinessId` (same as `listUsers`), enforces **manager role-boundary** (if actor.role === `manager` and data.role ∉ `{supervisor, cashier, waiter, kitchen}` → `ForbiddenError`), dedupe email within business, hash password, insert. Emits `register` audit event (reuse existing action).
  - `updateUser(actor, id, patch) → SafeUser` — same scoping as `getUserById`; enforces manager role-boundary against **both** existing target role and any incoming `patch.role`; strips `passwordHash`/`businessId`/`_id`/`createdAt`/`createdBy` from patch; `updatedAt = new Date()`.
  - `deactivateUser(actor, id) → SafeUser` — sets `isActive = false` (idempotent). Same scoping. Prevents an actor from deactivating themselves (`ForbiddenError` with code `CANNOT_DEACTIVATE_SELF`). If user already inactive → still 200 with current state.
  - All "not found in scope" paths throw `NotFoundError('User')` → 404 (so cross-tenant access looks indistinguishable from non-existence).
- [ ] Create `apps/backend/src/services/users.test.ts` covering the five service functions:
  - Mongo collection mocked via `vi.mock('../db/collections.js', …)` (follow `services/auth.test.ts` pattern).
  - Matrix: actor = admin vs. super_admin vs. manager vs. cashier; target in-business vs. cross-business.
  - Manager role-boundary: create/update with target role `admin` or `manager` → `ForbiddenError`.
  - Self-deactivation is rejected.
  - Super-admin listing with and without `businessId` query.

**Routes & wiring**

- [ ] Create `apps/backend/src/routes/users.ts` (`const users = new Hono<AppEnv>()`) with:
  - `GET /api/users` → `requireAuth()`, `requirePermission('users:read')`, `validate({ query: listUsersQuerySchema })`, `usersService.listUsers(user!, c.req.query())`.
  - `GET /api/users/:id` → `requireAuth()`, `requirePermission('users:read')`, `validate({ param: userIdParamSchema })`, `usersService.getUserById(user!, id)`.
  - `POST /api/users` → `requireAuth()`, `requirePermission('users:write')`, `validate({ body: createUserSchema })`, `usersService.createUser(user!, body)` → 201.
  - `PATCH /api/users/:id` → `requireAuth()`, `requirePermission('users:write')`, `validate({ param, body: updateUserSchema })`, `usersService.updateUser(user!, id, body)`.
  - `DELETE /api/users/:id` → `requireAuth()`, `requirePermission('users:delete')`, `validate({ param })`, `usersService.deactivateUser(user!, id)` → 200 with updated user.
- [ ] Wire in `apps/backend/src/app.ts`: `app.route('/', usersRoutes)` after `authRoutes`.
- [ ] Create `apps/backend/src/routes/users.test.ts` using `app.request()` (Hono's fetch-in-process harness). Cover acceptance criteria:
  - 401 when no token.
  - 403 + `authorization_failed` audit emission when cashier hits `GET /api/users`.
  - admin can list/get/create/patch/delete in own business.
  - admin gets 404 (not 403) for another business's user id.
  - super_admin lists across all businesses without filter, and filters with `?businessId=`.
  - `DELETE` of self → 403.
  - `POST` with duplicate email → 409.
  - `PATCH` with empty body → 400.

**Retire `/auth/register`**

- [ ] Remove the `POST /api/auth/register` route from `apps/backend/src/routes/auth.ts`.
- [ ] Remove `registerSchema` and the `RegisterRequest`/`RegisterResponse` types (keep if the frontend imports them — verify with `pnpm grep "RegisterRequest\|RegisterResponse"`; currently unused by frontend). Delete if unused.
- [ ] Remove `register` function from `apps/backend/src/services/auth.ts` (and from `auth.test.ts` / `auth.audit.test.ts` — port relevant assertions to `users.test.ts` if they check behavior not already covered there).

**Docs**

- [ ] Update `CLAUDE.md`: remove the line "No test files exist in the backend yet" from the "Commands" section.
- [ ] Add a short "RBAC" subsection under "Backend Pattern" in `CLAUDE.md` describing: roles, where the permission map lives (`apps/backend/src/lib/permissions.ts`), `requirePermission` middleware usage, and the `super_admin` bypass sentinel.

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds
- [ ] `pnpm --filter @kaipos/backend test` passes (all services + route tests green)
- [ ] Manual: spin up `pnpm docker:up`; exercise with curl:
  - Login as `admin@lacocinadekai.com` → get access token.
  - `GET /api/users` with admin token → lists La Cocina de Kai users.
  - `GET /api/users` with cashier token → `403` and a new `auditLogs` row with `action='authorization_failed'` and `metadata.permission='users:read'`.
  - `POST /api/users` with admin token to create a `manager` → 201.
  - `PATCH /api/users/:id` with admin token to rename → 200.
  - `DELETE /api/users/:id` with admin token → 200; subsequent login for that email fails with "Account is deactivated".
- [ ] Manual: confirm `POST /api/auth/register` now returns 404 (route removed).

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

Run end-to-end after all phases are merged to the feature branch.

- [ ] Fresh DB: `pnpm docker:down -v && pnpm docker:up && pnpm --filter @kaipos/backend db:setup && pnpm --filter @kaipos/backend db:seed`. Seed must complete with no validator errors.
- [ ] Login as admin (`admin@lacocinadekai.com` / `admin123`) — returns token.
- [ ] Login as cashier (`cajero@lacocinadekai.com` / `cajero123`) — returns token.
- [ ] `GET /api/users` → admin=200 with 2 users; cashier=403 + audit row.
- [ ] `POST /api/users` → admin creates a `manager`, a `supervisor`, a `waiter`, a `kitchen`; all 201.
- [ ] Newly-created `manager` token: can `POST /api/users` for `cashier` ✓, but gets 403 for role `admin` or `manager` and the denial is audited with `metadata.permission='users:write'`.
- [ ] Newly-created `manager` token: can `GET /api/users` ✓, can `PATCH` a cashier's name ✓, cannot `DELETE` (403 + audit).
- [ ] `GET /api/users/<unknown_id>` as admin → 404 (not 403).
- [ ] Create a second business + admin directly in Mongo (or via a temp super_admin). `GET /api/users/<other-biz-user-id>` as first admin → 404.
- [ ] Promote one user to `super_admin` with `businessId='*'` directly in Mongo. `GET /api/users` with their token lists users across all businesses; `?businessId=biz_seed_001` filters correctly.
- [ ] `DELETE /api/users/<self-id>` → 403 `CANNOT_DEACTIVATE_SELF`.
- [ ] `DELETE /api/users/<someone-else>` as admin → 200; subsequent login for that user → 401 "Account is deactivated" + existing `login_failed` audit with `reason=deactivated`.
- [ ] `POST /api/auth/register` → 404 Not Found (route retired).
- [ ] `auditLogs` collection: verify TTL-relevant fields and that `authorization_failed` events contain `{ permission, route, method }` as plain strings.
- [ ] `pnpm --filter @kaipos/backend test -- --coverage` reports ≥ 90% line coverage on `middleware/authorize.ts` and `lib/permissions.ts`.

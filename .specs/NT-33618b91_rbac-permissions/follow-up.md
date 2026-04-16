# Follow-up Tasks

Source: `.specs/NT-33618b91_rbac-permissions/`

<!-- Items discovered during implementation that are out of scope but worth tracking.
     Each item should explain what and why in one line. -->

- [ ] `middleware/branch-access.ts` hardcodes `user.role === 'admin'` as the bypass — align with new RBAC so `super_admin` also bypasses and the check is permission-driven (e.g., `branches:manage`), rather than string-matching a role.
- [ ] `branch-access.ts` performs a `users.findOne({ _id })` on every protected request — consider caching branchIds in the JWT payload or a request-scoped cache once more endpoints adopt the middleware.
- [ ] Add `GET /api/auth/me` returning `{ user, permissions: Permission[] }` so the future admin frontend can render permission-aware UI without duplicating the role map client-side. Decide then whether to move `permissions.ts` into `packages/shared`.
- [ ] Once `/products` and `/orders` endpoints exist, wire the deferred acceptance criteria from the spec (`cashier` cannot delete products, `waiter` cannot delete products, `kitchen` restricted to order-status updates) and add a documented RBAC matrix test that enumerates every route × every role.
- [ ] `services/auth.ts` still contains `TokenPayload`-level inline role checks in other places (none today, but similar patterns may creep in) — introduce a lint rule or code review checklist item prohibiting `user.role === '...'` checks outside of `permissions.ts`.
- [ ] `auditLogs.action` enum in `db/setup.ts` duplicates the `AuditAction` union in `packages/shared` — drift risk. Extract a shared constant array and reference it from both places.

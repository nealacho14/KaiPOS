# Follow-up Tasks

Source: `.specs/NT-33618b91_rbac-permissions/`

<!-- Items discovered during implementation that are out of scope but worth tracking.
     Each item should explain what and why in one line. -->

- [x] `apps/backend/src/middleware/branch-access.ts:19` hardcodes `user.role === 'admin'` as the bypass — `super_admin` currently falls through to the `users.findOne` path and is denied because their stored `businessId` is `*` and they have no `branchIds`. Align with new RBAC so `super_admin` also bypasses (and ideally make the check permission-driven, e.g., `branches:manage`, instead of string-matching roles).
- [x] `apps/backend/src/middleware/branch-access.ts:25-26` performs a `users.findOne({ _id })` on every protected request — consider caching `branchIds` in the JWT payload or a request-scoped cache once more endpoints adopt the middleware.
- [x] Document (in `CLAUDE.md` or an ADR) the distinction between permission checks (must use `hasPermission` / `requirePermission`) and tenant-isolation role checks (the `actor.role === 'super_admin'` branches in `apps/backend/src/services/users.ts:28,35` are legitimate because `super_admin` has `businessId === '*'` and must scope by the requested `businessId`). Consider an ESLint rule that forbids `role === '...'` outside `permissions.ts` and an allowlist for tenant-scoping call sites.
- [x] `auditLogs.action` enum in `apps/backend/src/db/setup.ts:378-387` duplicates the `AuditAction` union in `packages/shared/src/types/index.ts:227-235` — drift risk. Extract a shared constant array (e.g., `AUDIT_ACTIONS`) in `packages/shared` and derive both the TS union (`typeof AUDIT_ACTIONS[number]`) and the Mongo enum from it.

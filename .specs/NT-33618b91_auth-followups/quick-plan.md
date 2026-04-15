# Quick Plan: Auth System Backend Follow-ups

| Field         | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd813f8ad2d281fd4a205e) |
| Branch        | `NT-33618b91/auth-followups/feature`                              |
| Target        | `main`                                                            |

## Summary

Three backend follow-up tasks from the auth system spec: (1) integrate AWS SES for password reset emails, replacing the current log-only placeholder; (2) add `branchIds` and real bcrypt password hashes to seed users so branch middleware works out of the box; (3) add a dedicated `auditLogs` MongoDB collection to track auth events (login, logout, failed attempts, password resets) for security monitoring.

## Tasks

### 1. AWS SES integration for password reset emails

- [x] Create `apps/backend/src/lib/ses.ts` — SES client module
  - Use `@aws-sdk/client-ses` (already available in Lambda runtime, add as dev dep for local)
  - `sendPasswordResetEmail(email, resetToken)` — sends plain-text email with reset link
  - In dev (no `SES_SENDER_EMAIL` env var), fall back to logging the token (current behavior)
  - Sender: `noreply@kaipos.com` (configurable via `SES_SENDER_EMAIL` env var)
- [x] Update `apps/backend/src/services/auth.ts` `forgotPassword()` — call `sendPasswordResetEmail()` instead of just logging the token
- [x] Update `apps/backend/src/lib/auth-config.ts` — add `PASSWORD_RESET_BASE_URL` constant for reset link construction
- [x] Update `infra/lib/api-stack.ts` — add `SES_SENDER_EMAIL` env var + grant `ses:SendEmail` permission to the Lambda
- [x] Add `SES_SENDER_EMAIL` and `PASSWORD_RESET_BASE_URL` to `.env.example`

### 2. Add `branchIds` to seed user data

- [x] Update `apps/backend/src/db/setup.ts` — add `branchIds: ['branch_seed_001']` to all 3 seed users
- [x] Replace placeholder password hashes with real bcrypt hashes (pre-computed for seed passwords: `admin123`, `manager123`, `cashier123`)

### 3. Audit logging for auth events

- [x] Add `AuditLog` type to `packages/shared/src/types/index.ts`:
  - `{ _id, businessId?, userId?, action, target, ip?, userAgent?, metadata?, createdAt }`
  - `AuditAction` union type: `'login' | 'login_failed' | 'logout' | 'register' | 'password_reset_request' | 'password_reset_complete' | 'token_refresh'`
- [x] Export `AuditLog` and `AuditAction` from `packages/shared/src/index.ts`
- [x] Add `getAuditLogsCollection()` to `apps/backend/src/db/collections.ts`
- [x] Add `auditLogs` collection schema + indexes to `apps/backend/src/db/setup.ts` (indexes: `businessId + createdAt`, `userId + createdAt`, TTL index for auto-cleanup after 90 days)
- [x] Create `apps/backend/src/services/audit.ts` — `logAuditEvent(event)` function that inserts into the audit collection. Fire-and-forget (don't block the auth flow on audit writes)
- [x] Integrate audit logging into `apps/backend/src/services/auth.ts` — call `logAuditEvent()` at each auth action: login success, login failure, logout, register, forgot-password, reset-password, token refresh

## Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] Manual verification: review that `forgotPassword()` calls SES in prod mode and falls back to logging in dev; seed users have `branchIds` and real hashes; audit events are logged on each auth action

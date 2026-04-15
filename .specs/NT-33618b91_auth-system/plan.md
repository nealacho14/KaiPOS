# Plan: Sistema de Autenticacion

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Notion Ticket  | [NT-33618b91](https://notion.so/33618b913fdd813f8ad2d281fd4a205e) |
| Spec           | `.specs/NT-33618b91_auth-system/spec.md`                          |
| Feature Branch | `NT-33618b91/auth-system/feature`                                 |
| Target         | `main`                                                            |

<!-- Multi-phase sequential plan. Phases are stacked — each targets the previous phase's branch.
     Phase 1 branch targets the feature branch; subsequent phases target the previous phase.
     Use `/kaipos.implement` to implement one phase at a time. -->

## Phase 1: Foundation

**Branch**: `NT-33618b91/auth-system/foundation`
**Targets**: `NT-33618b91/auth-system/feature`

### Tasks

- [x] Add `jose` and `bcryptjs` (+ `@types/bcryptjs`) as backend dependencies
- [x] Extend `User` type in `packages/shared/src/types/index.ts` with `branchIds: string[]`
- [x] Add auth-related types to `packages/shared/src/types/index.ts`:
  - `TokenPayload` — `{ userId: string; businessId: string; role: UserRole }`
  - `RefreshToken` — DB document: `{ _id: string; userId: string; token: string; expiresAt: Date; createdAt: Date }`
  - `LoginAttempt` — DB document: `{ _id: string; email: string; attempts: number; lockedUntil: Date | null; lastAttemptAt: Date }`
  - `PasswordResetToken` — DB document: `{ _id: string; userId: string; token: string; expiresAt: Date; createdAt: Date; usedAt: Date | null }`
  - `LoginRequest`, `LoginResponse`, `RegisterRequest`, `RegisterResponse`, `RefreshRequest`, `RefreshResponse`, `ForgotPasswordRequest`, `ResetPasswordRequest` — API request/response shapes
- [x] Export all new types from `packages/shared/src/index.ts`
- [x] Create `apps/backend/src/lib/auth-config.ts` with constants:
  - `ACCESS_TOKEN_TTL = '15m'`
  - `REFRESH_TOKEN_TTL_DAYS = 7`
  - `MAX_LOGIN_ATTEMPTS = 5`
  - `LOCKOUT_DURATION_MINUTES = 15`
  - `PASSWORD_RESET_TTL_HOURS = 1`
  - `BCRYPT_SALT_ROUNDS = 12`
- [x] Create `apps/backend/src/lib/password.ts` — `hashPassword(plain)` and `verifyPassword(plain, hash)` using bcryptjs
- [x] Create `apps/backend/src/lib/jwt.ts` — `signAccessToken(payload)`, `generateRefreshToken()`, `verifyAccessToken(token)` using jose. JWT_SECRET resolved from Secrets Manager (`JWT_SECRET_ARN`) in prod, env var locally; throws on missing secret in production.
- [x] Add `UnauthorizedError` (401, `UNAUTHORIZED`) and `ForbiddenError` (403, `FORBIDDEN`) to `apps/backend/src/lib/errors.ts`
- [x] Add collection getters in `apps/backend/src/db/collections.ts`:
  - `getRefreshTokensCollection()` — index on `userId`, TTL index on `expiresAt`
  - `getLoginAttemptsCollection()` — unique index on `email`
  - `getPasswordResetTokensCollection()` — index on `userId`, TTL index on `expiresAt`
- [x] Add collection schemas and indexes to `apps/backend/src/db/setup.ts` for the three new collections
- [x] Update `apps/backend/src/db/setup.ts` to add `branchIds` to the users collection JSON schema (as optional array of strings)
- [x] Add `JWT_SECRET` to `.env.example` with a dev-only placeholder value
- [x] Add `JWT_SECRET` env var to Lambda environment in `infra/lib/api-stack.ts` — source from a new Secrets Manager secret (`kaipos/prod/jwt-secret`)

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [ ] Manual verification: `import { TokenPayload, RefreshToken } from '@kaipos/shared/types'` resolves correctly; `hashPassword` and `signAccessToken` can be called without runtime errors in a scratch test

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 2: Core Auth Endpoints

**Branch**: `NT-33618b91/auth-system/core-auth`
**Targets**: `NT-33618b91/auth-system/foundation`

### Tasks

- [ ] Update `AppEnv` in `apps/backend/src/types.ts` to add `user?: TokenPayload` to `Variables`
- [ ] Create `apps/backend/src/middleware/auth.ts` — Hono middleware that:
  - Extracts Bearer token from `Authorization` header
  - Verifies with `verifyAccessToken()`
  - Sets `c.set('user', payload)` on success
  - Throws `UnauthorizedError` on missing/invalid/expired token
- [ ] Create `apps/backend/src/services/auth.ts` — auth service with business logic:
  - `login(email, password)` — validate credentials, check rate limiting (query `loginAttempts` collection), increment failed attempts or reset on success, check `isActive`, return access + refresh tokens + user info (including `branchIds`). On successful login, store refresh token in DB.
  - `register(adminUser, data)` — verify caller is admin, create user with hashed password in the admin's `businessId`, return created user (without passwordHash)
  - `refresh(refreshToken)` — validate refresh token from DB, check expiry, issue new access token + new refresh token (rotate), delete old refresh token
  - `logout(refreshToken)` — delete refresh token from DB
- [ ] Create `apps/backend/src/schemas/auth.ts` — Zod schemas for all auth request bodies:
  - `loginSchema` — `{ email: z.string().email(), password: z.string().min(1) }`
  - `registerSchema` — `{ email, password (min 8), name, role, branchIds }`
  - `refreshSchema` — `{ refreshToken: z.string() }`
  - `logoutSchema` — `{ refreshToken: z.string() }`
- [ ] Create `apps/backend/src/routes/auth.ts` — Hono router with endpoints:
  - `POST /api/auth/login` — public, validates with `loginSchema`, calls `auth.login()`
  - `POST /api/auth/register` — protected (auth middleware), validates with `registerSchema`, calls `auth.register()`
  - `POST /api/auth/refresh` — public, validates with `refreshSchema`, calls `auth.refresh()`
  - `POST /api/auth/logout` — public, validates with `logoutSchema`, calls `auth.logout()`
- [ ] Mount auth routes in `apps/backend/src/app.ts` via `app.route('/', authRoutes)`

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds
- [ ] Manual verification: test login/register/refresh/logout flow via curl against local dev server. Verify:
  - Login with valid credentials returns access + refresh tokens
  - Login with wrong password returns 401
  - 5 failed logins result in lockout (429 or 403) for 15 minutes
  - Register with admin token creates a new user
  - Register without token returns 401
  - Register with non-admin token returns 403
  - Refresh with valid refresh token returns new tokens
  - Logout invalidates the refresh token

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 3: Password Reset + Branch Access

**Branch**: `NT-33618b91/auth-system/password-reset-branch`
**Targets**: `NT-33618b91/auth-system/core-auth`

### Tasks

- [ ] Add password reset methods to `apps/backend/src/services/auth.ts`:
  - `forgotPassword(email)` — find user by email, generate a crypto-random token, store in `passwordResetTokens` collection with 1-hour TTL, log the token (placeholder for SES email). Return success even if email not found (prevent enumeration).
  - `resetPassword(token, newPassword)` — validate token from DB, check expiry and `usedAt`, hash new password, update user's `passwordHash`, mark token as used, delete all user's refresh tokens (force re-login)
- [ ] Add Zod schemas to `apps/backend/src/schemas/auth.ts`:
  - `forgotPasswordSchema` — `{ email: z.string().email() }`
  - `resetPasswordSchema` — `{ token: z.string(), password: z.string().min(8) }`
- [ ] Add password reset routes to `apps/backend/src/routes/auth.ts`:
  - `POST /api/auth/forgot-password` — public, validates with `forgotPasswordSchema`, calls `auth.forgotPassword()`
  - `POST /api/auth/reset-password` — public, validates with `resetPasswordSchema`, calls `auth.resetPassword()`
- [ ] Create `apps/backend/src/middleware/branch-access.ts` — Hono middleware factory:
  - Takes a param name (e.g., `'branchId'`) that specifies where in the request the branchId is
  - Reads `c.get('user')` to get the authenticated user's `TokenPayload`
  - Looks up the user in DB to get `branchIds` (or caches on first lookup per request)
  - If user's role is `admin`, allow access to all branches in their business
  - Otherwise, checks if `branchIds` includes the requested branchId
  - Throws `ForbiddenError` if access denied
- [ ] Export `requireBranchAccess` middleware from `apps/backend/src/middleware/branch-access.ts` for use on future branch-scoped routes

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds
- [ ] Manual verification: test password reset flow and branch middleware via curl:
  - `POST /api/auth/forgot-password` with valid email logs a reset token
  - `POST /api/auth/forgot-password` with unknown email still returns 200 (no enumeration)
  - `POST /api/auth/reset-password` with valid token changes the password
  - `POST /api/auth/reset-password` with expired/used token returns 400
  - After password reset, old refresh tokens are invalidated
  - Branch middleware blocks access to branches not in user's `branchIds`
  - Admin users can access any branch in their business

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

- [ ] Full auth lifecycle: register user → login → access protected route → refresh token → logout → verify refresh token invalidated
- [ ] Rate limiting: 5 failed logins → lockout → wait or verify lockout expires → successful login resets counter
- [ ] Password reset lifecycle: forgot-password → use logged token → reset-password → login with new password → old password rejected
- [ ] Token validation: expired access token returns 401; tampered token returns 401; missing `Authorization` header returns 401
- [ ] Branch access: user with `branchIds: ['b1']` can access branch `b1` but not `b2`; admin can access all branches in their business
- [ ] Edge cases: login with inactive user (`isActive: false`) returns 401; register duplicate email returns 409; refresh with already-deleted token returns 401
- [ ] Verify JWT_SECRET is required in production (app fails fast if missing)
- [ ] Verify `pnpm build` produces a working Lambda bundle with jose and bcryptjs included

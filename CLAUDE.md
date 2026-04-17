# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KaiPOS is a cloud-native Point of Sale platform. Monorepo managed with pnpm workspaces + Turborepo.

## Commands

```bash
# Install dependencies
pnpm install

# Development with Atlas/external MongoDB (backend :4000, frontend :3000)
pnpm dev

# Development with Docker + local MongoDB (backend :4001, frontend :3001)
pnpm docker:up
pnpm docker:down

# Build all packages
pnpm build

# Lint & typecheck
pnpm lint
pnpm typecheck

# Format
pnpm format
pnpm format:check

# Run a single app
pnpm --filter @kaipos/backend dev
pnpm --filter @kaipos/frontend-admin dev

# Lint a single package
pnpm --filter @kaipos/backend lint

# Database setup (schema) and seed (demo data)
pnpm --filter @kaipos/backend db:setup   # create collections, validators, indexes (safe for Atlas)
pnpm --filter @kaipos/backend db:seed    # insert demo data (refuses to run against Atlas / MONGO_SECRET_ARN)

# Infrastructure deployment (from repo root)
pnpm deploy:prod               # full deploy: two-phase (backend-side stacks first, then read WS endpoint, then frontend)
pnpm deploy:prod:api           # targeted: backend build + api stack (+ deps)
pnpm deploy:prod:websocket     # targeted: backend build + websocket stack (+ deps)
pnpm deploy:prod:frontend      # targeted: read WS endpoint + frontend build + frontend stack
```

Vitest is configured in backend, frontend, and shared packages (`pnpm test` runs all).

## Architecture

### Monorepo Structure

- **apps/backend** — Hono HTTP server (local dev) + AWS Lambda handlers (production). Entry: `src/index.ts`. Lambda functions built from `src/functions/**/*.ts` via tsup (ESM, config at `apps/backend/tsup.config.ts`). The config bundles workspace packages and `mongodb` into the Lambda zip, leaves `@aws-sdk/*` external (provided by the Node 20 Lambda runtime), emits `dist/package.json` with `type: "module"`, and injects a `createRequire` banner for `mongodb`'s dynamic requires.
- **apps/frontend-admin** — React 19 SPA built with Vite. In dev the Vite server proxies `/api` to the local backend; in prod CloudFront proxies `/api/*` to API Gateway, so the SPA always uses **relative** `fetch("/api/...")` — no `VITE_API_URL` needed in the browser.
- **packages/shared** — Domain types (`Product`, `Order`, `User`) and utilities (`formatCurrency`, `generateOrderNumber`, `calculateOrderTotal`). Importable as `@kaipos/shared`, `@kaipos/shared/types`, `@kaipos/shared/utils`.
- **packages/tsconfig** — Shared TS configs: `base.json`, `node.json`, `react.json`. All use ES2022, strict mode, bundler module resolution.
- **packages/eslint-config** — Shared ESLint flat configs: base, `./node` (console allowed), `./react` (console warned).
- **infra** — AWS CDK v2. Four stacks under prefix `kaipos-prod-`: `SecretsStack` (Secrets Manager secret for Mongo URI), `AssetsStack` (private S3 bucket), `ApiStack` (API Gateway HTTP API + Lambda, no VPC), `FrontendStack` (S3 + CloudFront with `/api/*` behavior that proxies to API Gateway). Stage config in `infra/lib/config.ts` — only `prod` is supported in IaC; local dev is `pnpm dev` / `pnpm docker:up`.

### Backend Pattern

The backend has two execution modes:

1. **Local**: Hono server (`src/index.ts`) with `@hono/node-server` + `tsx watch` for hot reload
2. **Production**: A single unified Lambda handler (`src/functions/api.ts`) using `@hono/aws-lambda` — the same Hono app serves both modes. API Gateway uses a catch-all route (`ANY /api/{proxy+}`), so new endpoints don't require CDK changes.

The Hono app is defined in `src/app.ts` (shared between local and Lambda). Middleware stack: CORS → origin verification → request logger → error handler. Validation middleware (`src/middleware/validation.ts`) is applied per-route via Zod schemas.

Structured logging uses **Pino** (`src/lib/logger.ts`). In dev, `pino-pretty` provides human-readable colorized output via a Pino transport (no piping needed). In production, logs are JSON. Use `createLogger(context)` for child loggers with request-scoped bindings (e.g., `requestId`). No `console.log` — all logging goes through the Pino logger.

Database access goes through `src/db/client.ts` (MongoDB singleton) and `src/db/collections.ts` (typed collection getters for `products`, `orders`, `users`). The client resolves the connection URI in this order at cold start:

1. If `MONGO_SECRET_ARN` is set (AWS prod), it fetches the URI from AWS Secrets Manager using `@aws-sdk/client-secrets-manager` and caches it in module scope.
2. Otherwise it falls back to `MONGO_URI` env var (local dev / Docker).

### RBAC

Authorization is enforced per-route after `requireAuth()` via the `requirePermission(permission)` middleware in `src/middleware/authorize.ts`.

- Roles (in code, English only): `super_admin`, `admin`, `manager`, `supervisor`, `cashier`, `waiter`, `kitchen`.
- The `role → Permission[]` map lives in `src/lib/permissions.ts`. Permissions are `resource:action` strings (e.g., `users:read`, `products:write`). Permissions are derived from the role at request time — they are not embedded in the JWT.
- `super_admin` bypasses both the permission check and `businessId` tenant isolation. Their stored `businessId` is the sentinel `SUPER_ADMIN_BUSINESS_ID = '*'` (also exported from `permissions.ts`).
- Denials are audited: middleware fires a `logAuditEvent({ action: 'authorization_failed', metadata: { permission, route, method } })` and returns 403 with the generic message `Insufficient permissions`.
- User CRUD lives in `src/routes/users.ts` and `src/services/users.ts`. Cross-tenant reads return 404 (not 403) so existence isn't leaked. Managers can only assign roles in `{supervisor, cashier, waiter, kitchen}`; violations also emit `authorization_failed`.
- Branch access is enforced by `requireBranchAccess(paramName)` in `src/middleware/branch-access.ts`. It bypasses when the role has `branches:manage` (admin + super_admin) and otherwise checks the `branchIds` carried on the JWT — no per-request DB lookup. `branchIds` is populated by `login`/`refresh` from the user record and refreshed on every refresh-token rotation.
- **Permission checks vs. tenant-isolation role checks.** Authorization decisions (who can do what) MUST go through `hasPermission(role, permission)` / `requirePermission(permission)` — never inline `role === '...'` in route/service code. The one legitimate exception is tenant-isolation scoping for `super_admin` (who has `businessId === '*'` and therefore needs special handling to scope queries to a specific `businessId`, e.g. in `src/services/users.ts`). If you add a new `role === '...'` check, it must be for tenant scoping, not authorization — otherwise use `hasPermission`.

### Database scripts

- `src/db/setup.ts` — creates all collections with `$jsonSchema` validators and indexes (idempotent via `collMod` + `createIndex`). Runs anywhere: local, Docker, and Atlas prod. Exposed as `pnpm --filter @kaipos/backend db:setup`.
- `src/db/seed.ts` — inserts demo data (1 business "La Cocina de Kai", 1 branch, 2 users, 5 categories, 10 products, 3 modifiers, 6 tables). **Guard: refuses to run if `MONGO_SECRET_ARN` is set or `MONGO_URI` contains `mongodb+srv://`** — Docker/local only. Passwords hashed at runtime via `src/lib/password.ts` (`hashPassword`). Seeded users: `admin@lacocinadekai.com` / `admin123` and `cajero@lacocinadekai.com` / `cajero123`. Idempotent: skips if business `la-cocina-de-kai` already exists. Exposed as `pnpm --filter @kaipos/backend db:seed`.

### Environment Variables

- `MONGO_URI` — MongoDB connection string. For `pnpm dev`, loaded from root `.env` via dotenv. For Docker, set in `docker-compose.yml` (the `environment:` block overrides `.env` so the container always uses `mongodb://mongo:27017/kaipos`). **Not used in AWS prod.**
- `MONGO_SECRET_ARN` — ARN of the Secrets Manager secret holding the Atlas URI. Injected by CDK into the Lambda only in AWS prod. Never set locally. Also used as a signal by `db:seed` to refuse execution.
- `JWT_SECRET` — HMAC secret for signing access tokens. Loaded from root `.env` in local dev and in Docker (via `env_file: .env` in `docker-compose.yml`). In AWS prod replaced by `JWT_SECRET_ARN` (Secrets Manager).
- `CLOUDFRONT_SECRET` — Shared secret for CloudFront origin verification. Injected by CDK into the Lambda in AWS prod. Not set locally (middleware skips the check).
- Root `.env` is loaded by the backend dev script using `DOTENV_CONFIG_PATH=../../.env`. In Docker, the same `.env` is loaded via Compose's `env_file:` directive on the backend service.

### Infrastructure & secrets

- **One AWS stage: `prod`** in `us-east-1`. `dev` is local only. CDK validates `-c stage=prod`; any other value throws.
- **No VPC.** Lambda runs outside any VPC and reaches MongoDB Atlas directly over the internet. Atlas IP allowlist is set to `0.0.0.0/0` (security is enforced by DB credentials stored in Secrets Manager). Keeps cost near zero (~$1/month) by avoiding a NAT Gateway.
- **Secrets.** `MONGO_URI` lives only in Secrets Manager (`kaipos/prod/mongo-uri`). CDK creates the secret empty; populate it out-of-band with `aws secretsmanager put-secret-value`. The connection string never touches git or CloudFormation templates.
- **CloudFront proxies `/api/*` to API Gateway.** The SPA uses same-origin relative fetches, so there's no CORS and the API Gateway URL is not exposed in the browser bundle. CloudFront attaches a shared-secret `x-origin-verify` custom header; the Lambda middleware (`src/middleware/origin-verify.ts`) validates it and returns 403 for requests that bypass CloudFront. The secret is configured in `infra/lib/config.ts` (`cloudfrontSecret`) and passed to both CloudFront (custom origin header) and Lambda (`CLOUDFRONT_SECRET` env var). In local dev the env var is unset, so the check is skipped.
- **Lambda logs** have `RetentionDays.ONE_MONTH`.
- **S3 buckets** (`kaipos-assets-prod`, `kaipos-frontend-prod`) are `BLOCK_ALL` public access, SSE-S3 encrypted, with `enforceSSL` and `RemovalPolicy.RETAIN` in prod.
- Full deployment runbook in `infra/DEPLOYMENT.md`.

### WebSocket (real-time)

- **Endpoint.** API Gateway WebSocket API on its own subdomain. Not proxied through CloudFront (WS bypass) — clients connect directly to `wss://<ws-api-id>.execute-api.us-east-1.amazonaws.com/prod`. Exposed as `WebSocketEndpoint` CfnOutput from `WebSocketStack`.
- **Auth.** JWT passed as `?token=<access_token>` query param on the `$connect` handshake; verified by `src/lib/ws-auth.ts`. WS does **not** enforce the `x-origin-verify` shared secret that the HTTP API uses: the WSS endpoint bypasses CloudFront (direct client → API Gateway) and browsers cannot set custom headers on WebSocket handshakes, so there is no delivery path for the header. Handshake security relies on the signed JWT + mandatory TLS. Unauthenticated connects are rejected at handshake — no DDB row is written.
- **Channels.** `user:<userId>` is always attached at connect; regular users also get `business:<businessId>` and one `branch:<id>` per `branchIds` on the token. Super_admin gets only `user:<userId>` and must opt in to `business:<id>` via `subscribe`. Dynamic `subscribe`/`unsubscribe` go through `$default` and are validated with `canSubscribeTo` from `@kaipos/shared`.
- **Connection store.** DynamoDB table `ws-connections` (PK `connectionId`, SK `channel`, GSI1 `channel-index`, TTL 2h). Populated by `$connect`, mutated by `$default`, cleaned up by `$disconnect` and inline by `publishToChannel` on `GoneException` (410).
- **Publish helper.** `apps/backend/src/lib/ws-publish.ts` exposes `publishToChannel(channel, message)` and `publishToUser(userId, message)`. The `api` Lambda is granted `execute-api:ManageConnections` on the WS API and read/delete on the connections table; use these helpers from services (e.g. `orders.updateOrderStatus` fans out `order.status-changed` to `channelFor.branch(branchId)`).
- **Frontend.** `apps/frontend-admin/src/lib/ws-client.ts` (`WSClient`) handles connect, exponential backoff reconnect (1s→30s cap), and re-subscribes tracked channels on reconnect. `src/hooks/useWebSocket.ts` wraps it for React; debug page at `#/debug/ws`.

### Key Conventions

- TypeScript strict mode everywhere, target ES2022
- MongoDB native driver (not Mongoose)
- Prettier: double quotes, semicolons, trailing commas, 100 char width
- Unused vars prefixed with `_` (ESLint configured to allow this)
- Node.js 20 minimum (see `.nvmrc`)

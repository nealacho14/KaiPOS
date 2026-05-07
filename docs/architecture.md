# Architecture

## Monorepo

- **apps/backend** — Hono HTTP server (local dev) + AWS Lambda handlers (production). Entry: `src/index.ts`. Lambda functions built from `src/functions/**/*.ts` via tsup (ESM, config at `apps/backend/tsup.config.ts`). The config bundles workspace packages and `mongodb` into the Lambda zip, leaves `@aws-sdk/*` external (provided by Node 20 runtime), emits `dist/package.json` with `type: "module"`, and injects a `createRequire` banner for `mongodb`'s dynamic requires.
- **apps/frontend-admin** — React 19 SPA built with Vite. In dev the Vite server proxies `/api` to the local backend; in prod CloudFront proxies `/api/*` to API Gateway, so the SPA always uses **relative** `fetch("/api/...")` — no `VITE_API_URL` needed in the browser.
- **packages/shared** — Domain types (`Product`, `Order`, `User`) and utilities (`formatCurrency`, `generateOrderNumber`, `calculateOrderTotal`). Importable as `@kaipos/shared`, `@kaipos/shared/types`, `@kaipos/shared/utils`, `@kaipos/shared/permissions`.
- **packages/ui** — Design system (MUI v7 + Emotion + tokens). All MUI and `lucide-react` re-exports live here. See `packages/ui/README.md` for tokens and variants.
- **packages/tsconfig** — Shared TS configs: `base.json`, `node.json`, `react.json`. ES2022, strict mode, bundler module resolution.
- **packages/eslint-config** — Shared ESLint flat configs: base, `./node` (console allowed), `./react` (console warned, `no-restricted-imports` blocking direct `@mui/material` and `lucide-react`).
- **infra** — AWS CDK v2. See `docs/INFRASTRUCTURE.md` and `infra/DEPLOYMENT.md`.

## Backend pattern

Two execution modes:

1. **Local**: Hono server (`src/index.ts`) + `@hono/node-server` + `tsx watch` for hot reload.
2. **Production**: a single unified Lambda handler (`src/functions/api.ts`) using `@hono/aws-lambda`. API Gateway uses a catch-all route (`ANY /api/{proxy+}`), so new endpoints don't require CDK changes.

The Hono app is defined in `src/app.ts` (shared between local and Lambda). Middleware stack: CORS → origin verification → request logger → error handler. Validation middleware (`src/middleware/validation.ts`) is applied per-route via Zod schemas.

Structured logging uses **Pino** (`src/lib/logger.ts`). In dev, `pino-pretty` provides human-readable colorized output via a Pino transport. In production, logs are JSON. Use `createLogger(context)` for child loggers with request-scoped bindings (e.g., `requestId`). No `console.log` — all logging goes through Pino.

Database access goes through `src/db/client.ts` (MongoDB singleton) and `src/db/collections.ts` (typed collection getters). The client resolves the connection URI in this order at cold start:

1. If `MONGO_SECRET_ARN` is set (AWS prod), it fetches the URI from AWS Secrets Manager and caches it in module scope.
2. Otherwise it falls back to `MONGO_URI` env var (local dev / Docker).

### OpenAPI documentation

The backend exposes its HTTP contract via an `openapi.json` generated from the same Zod schemas the validation middleware uses, so docs cannot drift from runtime behavior.

- **Generation**: `pnpm --filter @kaipos/backend openapi:generate` runs `src/openapi/generate.ts` and writes `apps/backend/openapi.json`. The registry lives in `src/openapi/registry.ts`. The file is committed to the repo and CI's `Verify OpenAPI in sync` step regenerates it and fails if `git diff` is non-empty.
- **Local browsing**: `/api/docs` serves Swagger UI (CDN-hosted assets) reading from `/api/openapi.json`. Both routes are registered by `src/openapi/docs.ts` only when `process.env.NODE_ENV !== 'production'`, so the Lambda build never exposes them in prod.

## Frontend admin shell

- React Router v7 with `BrowserRouter` wrapping the app (see `src/main.tsx`). Routes are declared in `src/App.tsx`; guards in `src/components/guards/` (`RequireAuth`, `RequirePermission`).
- `src/layouts/AppLayout.tsx` renders the `Header` + `Sidebar` shell and initializes the shared `WebSocketProvider`. The WS connects only when `status === 'authenticated'` and `VITE_WS_ENDPOINT` is set; otherwise the status chip shows `Inactivo`.
- Sidebar items are gated by `hasPermission(user.role, permission)` — routes that need further gating also wrap in `RequirePermission`.
- See `apps/frontend-admin/README.md` for route map and dev notes.

## Conventions

- TypeScript strict mode everywhere, target ES2022.
- MongoDB native driver (not Mongoose).
- Prettier: double quotes, semicolons, trailing commas, 100 char width.
- Unused vars prefixed with `_` (ESLint configured to allow this).
- Node.js 20 minimum (see `.nvmrc`).

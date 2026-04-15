# Plan: API Middleware y Logging Estructurado

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Notion Ticket  | [NT-33618b91](https://notion.so/33618b913fdd81159435fbf4afcfae0b) |
| Spec           | `.specs/NT-33618b91_api-middleware-logging/spec.md`               |
| Feature Branch | `NT-33618b91/api-middleware-logging/feature`                      |
| Target         | `main`                                                            |

<!-- Multi-phase sequential plan. Phases are stacked — each targets the previous phase's branch.
     Phase 1 branch targets the feature branch; subsequent phases target the previous phase.
     Use `/kaipos.implement` to implement one phase at a time. -->

## Phase 1: Foundation — Logger, Zod, Error Types

**Branch**: `NT-33618b91/api-middleware-logging/foundation-logger-zod`
**Targets**: `NT-33618b91/api-middleware-logging/feature`

### Tasks

- [ ] Install `pino` (runtime) and `zod` (runtime) in `apps/backend`
- [ ] Create `apps/backend/src/lib/logger.ts` — Pino logger factory
  - Export a `createLogger(context?: Record<string, unknown>)` function that returns a Pino instance
  - Base config: JSON output, timestamp via `pino`'s built-in ISO format, `service: "kaipos-api"` base binding
  - Log level: `info` in production, `debug` otherwise (driven by `NODE_ENV`)
  - Accept optional context bindings (e.g., `requestId`) via `child()` pattern
  - Export a default root logger instance for non-request contexts (startup, DB connection)
- [ ] Create `apps/backend/src/lib/errors.ts` — Application error classes and error response helpers
  - `AppError` base class extending `Error` with `statusCode`, `code` (string enum), and optional `details` array
  - `ValidationError` subclass (400) — carries Zod issue details mapped to `{ field, message, received }` objects
  - `NotFoundError` subclass (404) — for future use
  - `InternalError` subclass (500) — generic, never exposes internals
  - `formatErrorResponse(error: AppError): ApiErrorResponse` — creates the standard error body
- [ ] Extend API response types in `packages/shared/src/types/index.ts`
  - Add `ApiErrorDetail` interface: `{ field: string; message: string; received?: unknown }`
  - Add `ApiErrorResponse` interface: `{ success: false; error: string; code: string; details?: ApiErrorDetail[] }`
  - Keep existing `ApiResponse<T>` unchanged for backward compatibility

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds
- [ ] Manual verification: import logger and error classes in a scratch file, confirm Pino outputs JSON to stdout and error formatting produces the expected shape

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 2: Hono Middleware + Console.log Replacement

**Branch**: `NT-33618b91/api-middleware-logging/hono-middleware`
**Targets**: `NT-33618b91/api-middleware-logging/foundation-logger-zod`

### Tasks

- [ ] Create `apps/backend/src/middleware/request-logger.ts` — Hono middleware
  - Generate a `requestId` (use `crypto.randomUUID()`)
  - Create a child logger with `requestId` binding and store it in Hono context (`c.set('logger', ...)`)
  - On response, log: `requestId`, `method`, `path`, `statusCode`, `durationMs` (computed from `performance.now()`)
  - Log level: `info` for 2xx/3xx, `warn` for 4xx, `error` for 5xx
- [ ] Create `apps/backend/src/middleware/error-handler.ts` — Hono `app.onError` handler
  - If error is `AppError` (or subclass), use its `statusCode` and `formatErrorResponse()`
  - If error is a generic `Error`, log full stack trace at `error` level, return 500 with generic message `"Internal server error"` — never expose stack traces, DB messages, or credentials
  - Return JSON matching `ApiErrorResponse` shape
- [ ] Create `apps/backend/src/middleware/validation.ts` — Zod validation middleware factory
  - Export `validate(schemas: { body?: ZodSchema; params?: ZodSchema; query?: ZodSchema })` that returns a Hono middleware
  - On validation failure, throw `ValidationError` with Zod issues mapped to `ApiErrorDetail[]`
  - Validation runs before the route handler
- [ ] Wire up middleware in `apps/backend/src/index.ts`
  - Add request logger middleware before routes (`app.use('/*', requestLogger())`)
  - Add error handler (`app.onError(errorHandler)`)
  - Keep CORS middleware (order: CORS → request logger → routes)
- [ ] Define Hono context type for the logger variable (`c.get('logger')`) — use Hono's `Variables` generic on the app instance
- [ ] Replace `console.log` / `console.error` in `apps/backend/src/db/client.ts` with the root logger from `lib/logger.ts`
- [ ] Replace `console.log` / `console.error` in `apps/backend/src/db/setup.ts` with the root logger (this is a CLI script — Pino JSON output is acceptable since CloudWatch parses it; for local readability, `pino-pretty` can be piped in dev)
- [ ] Replace `console.log` in `apps/backend/src/index.ts` (startup message) with the root logger

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds
- [ ] Manual verification: `pnpm --filter @kaipos/backend dev`, then:
  - `GET /api/health` → 200 response + structured JSON log with requestId, method, path, statusCode, durationMs
  - `POST /api/health` (or any non-existent route) → structured log entry
  - Confirm no `console.log` or `console.error` calls remain in `src/` (search with `grep -r "console\." src/`)

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 3: CDK Catch-All + Unified Lambda Handler

**Branch**: `NT-33618b91/api-middleware-logging/cdk-catch-all-lambda`
**Targets**: `NT-33618b91/api-middleware-logging/hono-middleware`

### Tasks

- [ ] Install `@hono/aws-lambda` (runtime) in `apps/backend`
- [ ] Extract Hono app creation into `apps/backend/src/app.ts`
  - Move route definitions, middleware wiring, and `app.onError` from `index.ts` into this module
  - Export the configured `app` instance
  - This module is shared between local dev (`index.ts`) and Lambda (`functions/api.ts`)
- [ ] Update `apps/backend/src/index.ts` — import app from `./app.js`, keep only `serve()` call and startup log
- [ ] Create `apps/backend/src/functions/api.ts` — unified Lambda handler
  - Import app from `../app.js`
  - Import `handle` from `@hono/aws-lambda`
  - Export `const handler = handle(app)`
- [ ] Delete `apps/backend/src/functions/health.ts` — replaced by the unified handler
- [ ] Update `apps/backend/tsup.config.ts`
  - Change entry from `src/functions/**/*.ts` to `['src/functions/api.ts']` (single entry point)
- [ ] Update `infra/lib/api-stack.ts`
  - Rename `HealthFunction` → `ApiFunction` (and update construct ID)
  - Change `handler` from `'health.handler'` to `'api.handler'`
  - Replace the single `/api/health` route with a catch-all pattern:
    ```
    path: '/api/{proxy+}'
    methods: [ANY]
    ```
  - Also add a route for the exact `/api` path (API Gateway requires both `{proxy+}` and the bare path for full coverage)
  - Update `mongoSecret.grantRead()` and `assetsBucket.grantReadWrite()` to reference the renamed function
  - Update the `HealthIntegration` construct ID → `ApiIntegration`
- [ ] Verify build output: `pnpm build` should produce `dist/api.js` (not `dist/health.js`)

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds — `dist/api.js` exists, `dist/health.js` does not
- [ ] Manual verification: `pnpm --filter @kaipos/backend dev` — health check still works at `GET /api/health`
- [ ] Manual verification: `cd infra && npx cdk synth -c stage=prod` succeeds and the CloudFormation template shows `ANY /api/{proxy+}` route

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

- [ ] **Regression**: `GET /api/health` returns 200 with `{ success: true, data: { service, version, database, timestamp } }` — same shape as before
- [ ] **Validation (400)**: Add a Zod schema to a test route (or the health endpoint with query params), send invalid payload → 400 with `{ success: false, error, code: "VALIDATION_ERROR", details: [{ field, message }] }`
- [ ] **Error handling (500)**: Trigger an unhandled error (e.g., disconnect DB) → 500 with `{ success: false, error: "Internal server error", code: "INTERNAL_ERROR" }` — no stack trace in response body
- [ ] **Structured logging**: Check `stdout` for JSON logs with `requestId`, `method`, `path`, `statusCode`, `durationMs` on every request
- [ ] **No console.log**: `grep -r "console\.\(log\|error\|warn\)" apps/backend/src/` returns zero matches
- [ ] **CDK synth**: `cd infra && npx cdk synth -c stage=prod` succeeds; template has `ANY /api/{proxy+}` route pointing to single Lambda
- [ ] **Build output**: `ls apps/backend/dist/` shows `api.js` and `api.js.map`, no `health.js`
- [ ] **Typecheck + lint + format**: `pnpm typecheck && pnpm lint && pnpm format:check` all pass

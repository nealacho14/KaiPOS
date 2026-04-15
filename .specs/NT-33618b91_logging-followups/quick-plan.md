# Quick Plan: Logging follow-ups — pino-pretty, shared-secret header, health check extraction

| Field         | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd81159435fbf4afcfae0b) |
| Branch        | `NT-33618b91/logging-followups/feature`                           |
| Target        | `main`                                                            |

## Summary

Addresses all 4 follow-up items from the API middleware/logging implementation: (1) add `pino-pretty` for human-readable dev logs, (2) add a shared-secret header check so Lambda rejects requests that bypass CloudFront, (3) extract the health check logic into a reusable service module, and (4) pipe `db:setup` script output through `pino-pretty` for local readability.

## Tasks

### 1. pino-pretty for dev logs

- [x] Install `pino-pretty` as a devDependency in `apps/backend`
- [x] Update the `dev` script in `apps/backend/package.json` to pipe through `pino-pretty` (e.g., `... src/index.ts | pino-pretty`)
- [x] Update logger config: add `transport` option for dev mode using `pino-pretty` (preferred over piping, more reliable with tsx watch)

### 2. Shared-secret header check (CloudFront origin verification)

- [x] Create `apps/backend/src/middleware/origin-verify.ts` — middleware that:
  - Reads `CLOUDFRONT_SECRET` from `process.env`
  - If the env var is not set (local dev), skip the check (pass through)
  - If set, compare `x-origin-verify` request header against the env var
  - Mismatch or missing header → 403 `{ success: false, error: "Forbidden", code: "FORBIDDEN" }`
- [x] Wire the middleware in `apps/backend/src/app.ts` after CORS, before request logger
- [x] Update `infra/lib/frontend-stack.ts` — add a custom origin header `x-origin-verify` to the CloudFront `/api/*` behavior with a secret value
- [x] Update `infra/lib/api-stack.ts` — pass the same secret as `CLOUDFRONT_SECRET` env var to the Lambda
- [x] Store the shared secret in CDK context or generate it deterministically (use a CDK `cdk.Fn.select` from the Secrets Manager ARN or a simple static value in `config.ts` — keep it simple, not in Secrets Manager since it's not a credential)

### 3. Health check service extraction

- [x] Create `apps/backend/src/services/health.ts` — exports `checkHealth()` function that:
  - Calls `getClient()`, pings the DB, returns structured health data
  - Returns `{ service, version, database, databaseError?, timestamp }`
- [x] Update `apps/backend/src/app.ts` — replace inline health handler with a call to `checkHealth()`

### 4. Pretty logs for db:setup script

- [x] Update the `db:setup` script in `apps/backend/package.json` to pipe through `pino-pretty`

## Files Changed (estimated ~7)

| File                                           | Change                                                        |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `apps/backend/package.json`                    | Add `pino-pretty` devDep, update `dev` and `db:setup` scripts |
| `apps/backend/src/lib/logger.ts`               | Add pino-pretty transport for non-production                  |
| `apps/backend/src/middleware/origin-verify.ts` | **New** — shared-secret verification middleware               |
| `apps/backend/src/app.ts`                      | Wire origin-verify middleware, replace inline health handler  |
| `apps/backend/src/services/health.ts`          | **New** — extracted health check service                      |
| `infra/lib/frontend-stack.ts`                  | Add `x-origin-verify` custom origin header to CloudFront      |
| `infra/lib/api-stack.ts`                       | Add `CLOUDFRONT_SECRET` env var to Lambda                     |
| `infra/lib/config.ts`                          | Add `cloudfrontSecret` field                                  |

## Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `cd infra && npx cdk synth -c stage=prod` succeeds — template includes `x-origin-verify` custom header and `CLOUDFRONT_SECRET` env var
- [x] Manual: `pnpm --filter @kaipos/backend dev` shows colorized, human-readable log output
- [x] Manual: `GET /api/health` still returns 200 with health data (regression check)

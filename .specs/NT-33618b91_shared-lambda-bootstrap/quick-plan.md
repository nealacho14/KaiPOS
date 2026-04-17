# Quick Plan: Shared Lambda bootstrap + unified CloudFront origin verification

| Field         | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd81c38a03fbc79f41242b) |
| Branch        | `NT-33618b91/shared-lambda-bootstrap/feature`                     |
| Target        | `main`                                                            |

## Summary

Address two refactor follow-ups surfaced by the WebSocket realtime ticket:
(1) DRY the per-invocation logger bootstrap across the 3 WS Lambda handlers by
adding a tiny `lib/lambda-runtime.ts` that builds a request-scoped child logger
with `requestId`/`connectionId`/`routeKey` from the event — mirroring the
`requestLogger` middleware on the Hono side; (2) extract the CloudFront
shared-secret policy out of the Hono middleware into a pure helper
(`lib/cloudfront-origin.ts`) so the env read and header comparison are testable
in isolation. Behavior is preserved exactly. WS `ws-auth.ts` is intentionally
left alone — WSS uses JWT, not the shared-secret header, per CLAUDE.md.

## Tasks

### 1. New pure helper: `apps/backend/src/lib/cloudfront-origin.ts`

- Export `isCloudfrontOriginVerifyEnabled(): boolean` — true when `process.env.CLOUDFRONT_SECRET` is a non-empty string.
- Export `verifyCloudfrontOriginHeader(headerValue: string | undefined): boolean` — when disabled, returns `true` (local dev / no enforcement); when enabled, returns `headerValue === secret`.
- No I/O, no Hono, no AWS SDK. Pure env + string compare.
- Short JSDoc linking to the CLAUDE.md explanation of CloudFront origin verification.

### 2. Refactor `apps/backend/src/middleware/origin-verify.ts`

- Replace inline `process.env.CLOUDFRONT_SECRET` read + string compare with a single call to `verifyCloudfrontOriginHeader(c.req.header('x-origin-verify'))`.
- Same response shape on failure (`403` with `{ success: false, error: 'Forbidden', code: 'FORBIDDEN' }`).
- Same pass-through on success.

### 3. New unit tests: `apps/backend/src/lib/cloudfront-origin.test.ts`

Cover with Vitest (`@kaipos/backend` already has Vitest configured):

- `isCloudfrontOriginVerifyEnabled` — returns false when env unset, false when empty string, true when non-empty.
- `verifyCloudfrontOriginHeader` — returns true when disabled (env unset), true when header matches, false when header is undefined/mismatched while enabled.
- Use `vi.stubEnv`/`vi.unstubAllEnvs` to manipulate `CLOUDFRONT_SECRET` per test.

### 4. New helper: `apps/backend/src/lib/lambda-runtime.ts`

- Export `createWsRequestLogger(event, module)` where:
  - `event: APIGatewayProxyWebsocketEventV2`
  - `module: string` — replaces today's `createLogger({ module: 'ws-xxx' })`.
- Returns a `pino.Logger` child with `{ module, requestId, connectionId, routeKey }` bindings pulled from `event.requestContext`. Omits undefined fields.
- Thin wrapper over `createLogger` from `lib/logger.ts` — keep scope minimal (no Mongo bootstrap, no secret-loading). Those concerns are already lazy in their respective modules (`db/client.ts`, `jwt.ts`) and don't need a runtime hook for these handlers.

### 5. Migrate the 3 WS handlers

- `apps/backend/src/functions/ws-connect.ts`
- `apps/backend/src/functions/ws-disconnect.ts`
- `apps/backend/src/functions/ws-default.ts`

Each: replace the module-scope `createLogger({ module: '...' })` + inline `log.child({ connectionId, ... })` with a single `const log = createWsRequestLogger(event, '<module>')` at the top of the handler, then bind `userId`/`businessId`/`role` via `log.child(...)` when token/context becomes known (same as today).

Preserve all existing log points and levels exactly.

### 6. Update existing handler tests (if mocks need adjusting)

Existing tests mock `../lib/logger.js`. Since `lambda-runtime.ts` imports `createLogger` from `logger.js`, the existing mock should cascade through unchanged. Verify by running the suite; only add/edit mocks if tests break.

### 7. New unit tests: `apps/backend/src/lib/lambda-runtime.test.ts`

- `createWsRequestLogger` returns a logger with bindings from `event.requestContext`.
- Omits undefined `routeKey`/`connectionId`/`requestId` gracefully (defensive for malformed events).
- Use a lightweight mock of `createLogger` that records the bindings passed in.

### 8. No changes to `functions/api.ts`

`api.ts` is a 4-line `handle(app)` wrapper. The Hono app already has `requestLogger` middleware that does exactly the equivalent of `createWsRequestLogger`. No parity work needed on the HTTP side — the follow-up item is satisfied by bringing the WS handlers up to the HTTP side's standard, not the other way around.

### 9. No changes to `ws-auth.ts`

WSS bypass of CloudFront is intentional (per CLAUDE.md § WebSocket). `ws-auth.ts` reads `?token=` and verifies the JWT — it does not use `CLOUDFRONT_SECRET`. Leave it untouched. The split is documented in that file's existing top-of-file comment.

## Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test` (or `pnpm --filter @kaipos/backend test`) passes — new tests green, existing WS handler tests unchanged (393 passed, +12 from new helpers)
- [x] Manual verification: grep confirms no remaining `process.env.CLOUDFRONT_SECRET` reads outside `lib/cloudfront-origin.ts`; grep confirms no `createLogger({ module: 'ws-` patterns remain in `src/functions/ws-*.ts` (`ws-auth.ts` and `ws-publish.ts` still use it — they are lib modules without event context, left intentionally).

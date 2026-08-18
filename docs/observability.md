# Observability

How we know KaiPOS is healthy in production: structured Pino logs +
CloudWatch metric filters + 9 alarms publishing to an SNS topic with an
email subscription, an AWS Budget cost alert, plus API Gateway access
logs in a dedicated log group.

The whole layer is provisioned by `infra/lib/monitoring-stack.ts`
(`kaipos-prod-monitoring`) and a small slice of `infra/lib/api-stack.ts`
(the access log group + `CfnStage.accessLogSettings`). The recipient of
all alerts is `config.alertsEmail` (today
`kelvin.hernandezc30@gmail.com`).

> **Free-tier ceiling.** CloudWatch's free tier covers 10 alarms. The
> stack provisions exactly 9. If you add more, consolidate via
> `cloudwatch.MathExpression` (the WS Errors/Throttles/Invocations
> alarms already use this pattern). AWS Budgets don't count against
> this ceiling.

---

## Log groups at a glance

| Log group                                     | Source                      | Retention | Notes                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | --------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/aws/lambda/<ApiFunction>`                   | api Lambda (Pino JSON)      | 30 days   | Carries `request completed` lines with `requestId`, `path`, `statusCode`, `durationMs`. All metric filters target this log group.                                                                                                                                        |
| `/aws/lambda/<WsConnectFunction>`             | WS `$connect` Lambda        | 30 days   | JWT handshake, channel subscribes.                                                                                                                                                                                                                                       |
| `/aws/lambda/<WsDisconnectFunction>`          | WS `$disconnect` Lambda     | 30 days   | Cleanup of connections table rows.                                                                                                                                                                                                                                       |
| `/aws/lambda/<WsDefaultFunction>`             | WS `$default` Lambda        | 30 days   | Pings/acks via PostToConnection.                                                                                                                                                                                                                                         |
| `/aws/apigateway/kaipos-prod-api-access-logs` | HTTP API access logs (JSON) | 14 days   | One line per request from the API Gateway side — useful when the Lambda log is missing (e.g., a 4xx/5xx that never hit the Lambda). Shorter retention than the Lambda log groups since this duplicates per-request metadata that the richer Lambda log already captures. |

Pino emits JSON in production, so all `$.field = value` filter patterns
work directly on the application log groups.

---

## Logs Insights queries

Save these in CloudWatch → Logs Insights → "Saved queries" or paste
into the editor. Replace the placeholder log group ARN as needed.

### 1. Trace a single request across HTTP + WS by `requestId`

```
fields @timestamp, @log, level, msg, requestId, path, statusCode, durationMs
| filter requestId = "<paste-request-id>"
| sort @timestamp asc
| limit 200
```

Run this against both the API and WS log groups — selecting multiple
log groups in the Insights UI joins them in a single result set, so a
single `requestId` will surface every line emitted under that request,
including the `request completed` summary and any child-logger lines
that inherited the binding from `requestLogger`.

### 2. Top-10 endpoints by `durationMs` (last 24 h)

```
fields path, durationMs
| filter ispresent(durationMs) and msg = "request completed"
| stats max(durationMs) as p100, avg(durationMs) as avg, count(*) as n by path
| sort p100 desc
| limit 10
```

Note: under `LOG_LEVEL=info` (the prod default), 2xx/3xx `request completed`
lines are emitted at `debug` and dropped — except when `durationMs > 3000`,
where the line is force-promoted to `info` so it stays visible to this query
and to the `SlowRequests` metric filter. Errors (4xx/5xx) are always emitted
at `warn` / `error`. To see the full traffic stream temporarily, switch the
api Lambda's `LOG_LEVEL` env var to `debug`.

Useful before opening a perf ticket — hit the API log group with a 24 h
range. `path` comes from `requestLogger`, so values are normalized to
the Hono route (e.g., `/api/products/:id`) and aren't blown out by IDs.

### 3. 5xx by `path` (last 24 h)

```
fields @timestamp, requestId, path, statusCode, msg
| filter statusCode >= 500
| sort @timestamp desc
| limit 100
```

Pair with alarm `Api5xxHigh` — when the alarm fires, this is the first
query to run. `statusCode` is logged at `error` level by the request
logger (see `apps/backend/src/middleware/request-logger.ts`), so the
matching lines are already at `level = 50`.

### 4. WS disconnects by `connectionId` and `routeKey`

```
fields @timestamp, connectionId, routeKey, reason, msg
| filter @logStream like /WsDisconnect/
| stats count(*) as n by routeKey, reason
| sort n desc
```

Surfaces noisy disconnect reasons (e.g., `1006 abnormal closure`) and
highlights connections churning through `$default` without acks.
Combine with the connections-table TTL behavior described in
`docs/realtime.md`.

---

## Alarms and runbook

All alarms send to SNS topic `kaipos-prod-alerts` (subscription email
in `config.alertsEmail`). The first deploy will email a one-time
"confirm subscription" link — confirm it before testing anything.

Alarms use `treatMissingData: NOT_BREACHING` so silence doesn't page.
Stage prefix in alarm names is `kaipos-prod-`.

### `kaipos-prod-api-5xx-high` (`Api5xxHigh`)

- **Trigger**: `httpApi.metricServerError()` sum > 5 in 5 min.
- **What it usually means**: the api Lambda is throwing, the bundled
  handler is crashing on cold start, or Atlas is unreachable.
- **Diagnose**:
  1. Run query 3 (5xx by path) on the API log group.
  2. Pick a `requestId` from the top hit and run query 1.
  3. If the lines stop at "request completed" with `statusCode = 500`
     and a Pino `error`, the failure is in handler code. If you see
     "MongoDB connection error" first, jump to
     `MongoConnectionErrorsHigh`.
- **Next actions**: revert the most recent deploy (`pnpm deploy:prod` is
  reversible by re-deploying the previous tag) or hot-toggle
  `LOG_LEVEL=debug` on the api Lambda from the AWS console for more
  context.

### `kaipos-prod-api-latency-p95-high` (`ApiLatencyHighP95`)

- **Trigger**: `httpApi.metricLatency({ statistic: 'p95' })` > 3000 ms in
  5 min.
- **What it usually means**: Atlas slow query, cold-start regression, or
  a request hot path that started doing more work.
- **Diagnose**:
  1. Run query 2 (top-10 endpoints by `durationMs`).
  2. For the worst offenders, open Atlas Performance Advisor at
     <https://cloud.mongodb.com> → Project → Cluster → Performance
     Advisor. M0/M2 includes slow query log + index suggestions.
  3. Compare with API Gateway access logs
     (`/aws/apigateway/kaipos-prod-api-access-logs`) — `responseLatency`
     in the access log includes integration time, which separates "API
     GW overhead" from "Lambda time".
- **Next actions**: add the suggested index, scale the Atlas cluster,
  or undo the latest deploy.

### `kaipos-prod-api-fn-errors` (`ApiFunctionErrors`)

- **Trigger**: api Lambda `Errors` > 3 in 5 min.
- **What it usually means**: unhandled throw in the catch-all handler
  (returns a 500 from API GW perspective, but is also recorded as a
  Lambda error). Often correlates with `Api5xxHigh`.
- **Diagnose**: same flow as `Api5xxHigh`. Lambda Errors specifically
  excludes anything we caught and rendered through `error-handler.ts`,
  so a hit here usually means the handler itself crashed (init code,
  middleware, etc.).
- **Next actions**: same as `Api5xxHigh` — revert deploy or patch and
  redeploy.

### `kaipos-prod-ws-fn-errors` (`WsLambdaErrorsHigh`)

- **Trigger**: SUM of `Errors` across the three WS Lambdas (connect,
  disconnect, default) > 3 in 5 min — single MathExpression alarm.
- **What it usually means**: JWT regression, DynamoDB throttling, or
  PostToConnection hitting `GoneException` with no fallback (cleanup
  path is throwing).
- **Diagnose**: in CloudWatch → Metrics, drill into
  `AWS/Lambda → Errors` filtered by FunctionName to identify which of
  the three is failing. Then run a Logs Insights query against that
  function's log group:

  ```
  fields @timestamp, level, msg, err.message, connectionId, channel
  | filter level = 50
  | sort @timestamp desc
  | limit 50
  ```

- **Next actions**: confirm `JWT_SECRET_ARN` is still readable
  (Secrets Manager); if `$default` is failing, check for a regression in
  the publish helper (`apps/backend/src/lib/ws-publish.ts` and
  callers).

### `kaipos-prod-api-fn-throttles` / `kaipos-prod-ws-fn-throttles`

- **Trigger**: `Throttles` > 0 in 1 min on the api Lambda, or SUM of WS
  Lambda Throttles > 0 in 1 min.
- **What it usually means**: account-level concurrent execution ceiling
  (default 1000) is being hit, or a function-level reserved-concurrency
  cap was hit. The WS Lambdas run with deliberate reserved concurrency
  (`ws-connect` 5 / `ws-disconnect` 2 / `ws-default` 5) and the WS stage
  is throttled to 20 rps / burst 50 — occasional WS throttles during a
  runaway client are the guardrails working as designed, not an outage.
- **Diagnose**: AWS Console → Lambda → function → Monitor →
  "Concurrent executions". Cross-reference with API Gateway access logs
  for the same window — a real spike will show in `requestId` count.
  For WS, check whether `ws-fn-invocations` fired too — if so, find the
  abusive `connectionId` with the Logs Insights query above.
- **Next actions**: for the api Lambda, file an account quota increase.
  For WS, first rule out a client loop (see `ws-fn-invocations` below)
  before raising the reserved concurrency or stage throttle in
  `infra/lib/config.ts`.

### `kaipos-prod-ws-fn-invocations` (`WsLambdaInvocationsHigh`)

- **Trigger**: SUM of Invocations across the 3 WS Lambdas > 1000 in
  5 min.
- **What it usually means**: a client-side loop. The 2026-05-06 incident
  was a `useEffect(..., [ws])` around subscribe/unsubscribe that looped
  at render speed (~6,000 `ws-default` invocations/min from **one**
  tab). Legit traffic is < 100 invocations / 5 min, so this alarm firing
  is ~10× above normal and hours before any cost materializes.
- **Diagnose**: Logs Insights on `/aws/lambda/*WsDefault*`:

  ```
  fields @timestamp, connectionId, userId, msg, channel
  | filter msg like /subscribe|unsubscribed|rate limit/
  | stats count(*) as n by connectionId
  | sort n desc
  ```

  A single `connectionId` dominating the count = one looping tab.

- **Next actions**: the layered guardrails should already be containing
  it (server rate limit disconnects the client at 60 msgs/min; the
  stage throttle caps everything at 20 rps). Find the effect that
  regressed — search for `useEffect` deps containing a merged ws
  context object — and fix it with `useWebSocketActions()` +
  `useWebSocketState()` (see `docs/realtime.md`).

### AWS Budget `kaipos-prod-monthly`

- **Trigger**: email (not SNS) when ACTUAL month-to-date cost > 80% of
  $5, or FORECASTED month-end cost > 100% of $5.
- **What it usually means**: something left the free tier — check Cost
  Explorer grouped by service; Lambda invocations and CloudWatch are
  the usual suspects.
- **Next actions**: if the culprit is WS traffic, `ws-fn-invocations`
  probably fired first — follow that runbook. Adjust the budget amount
  in `infra/lib/monitoring-stack.ts` if the baseline legitimately grew.

### `kaipos-prod-mongo-connection-errors` (`MongoConnectionErrorsHigh`)

- **Trigger**: metric filter `MongoConnectionErrors` (pattern
  `{ $.level = 50 && $.msg = "MongoDB connection error" }`) sum > 5 in
  5 min.
- **What it usually means**: Atlas IP allowlist regressed, the cluster
  is paused, or the secret value rotated and the Lambda has stale
  credentials cached in module scope (cold-start state).
- **Diagnose**:
  1. <https://cloud.mongodb.com> → Project → Network Access — verify
     `0.0.0.0/0` (or whatever the current allowlist contains) is
     active.
  2. Check Atlas → Cluster → Status. If paused, resume.
  3. Logs Insights on the API log group:

     ```
     fields @timestamp, msg, err.name, err.message
     | filter msg = "MongoDB connection error"
     | sort @timestamp desc
     | limit 20
     ```

- **Next actions**: restore allowlist or rotate the secret and
  re-deploy the api Lambda (Lambda re-reads from Secrets Manager on
  cold start; force a cold start by updating an env var).

### `kaipos-prod-slow-requests` (`SlowRequestsHigh`)

- **Trigger**: metric filter `SlowRequests` (`{ $.durationMs > 3000 }`)
  sum > 10 in 5 min. This is a _volume_ alarm, complementary to the p95
  alarm — it catches "lots of slow requests" even if p95 stays under
  3 s.
- **Diagnose**: query 2 plus Atlas Performance Advisor. If a single
  endpoint dominates, that endpoint usually has a missing index or a
  fan-out bug.
- **Next actions**: same as `ApiLatencyHighP95`.

---

## Atlas native monitoring

We deliberately do not duplicate Atlas's built-in observability in
CloudWatch — it's better than anything we'd build and it's included in
every tier (M0 included).

- **Performance Advisor**: <https://cloud.mongodb.com> → Project →
  Cluster → Performance Advisor. Suggests missing indexes from real
  query traffic. Free on M0/M2.
- **Slow query log**: same console, "Profiler" tab. Surfaces queries >
  100 ms by default.
- **Connection metrics**: "Real Time" tab. Useful when investigating
  `MongoConnectionErrorsHigh` (open connection count + driver errors).

When a runbook entry says "consult Atlas", it's these tabs.

---

## Costs

The whole monitoring layer is designed to be **$0/month** on the AWS
free tier.

- **CloudWatch Alarms**: free up to 10 (we provision 8).
- **CloudWatch Logs ingestion**: 5 GB/month free; the api Lambda log
  group keeps 30 days while API Gateway access logs are bounded to 14
  days, sitting comfortably below the free tier for MVP traffic.
- **CloudWatch Metric Filters**: free.
- **SNS**: 1k email notifications/month free.

Verify 30 days post-deploy: AWS Console → Cost Explorer → filter by
service `Amazon CloudWatch` and `Amazon SNS`. If either line is non-zero
and the project is still pre-launch, document the cause here before
moving on (e.g., a debug deploy left `LOG_LEVEL=debug` on the api
Lambda — log volume is the most common culprit).

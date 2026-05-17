# Follow-up Tasks

Source: `.specs/NT-33618b91_monitoring-logging-alarms/`

<!-- Items discovered during implementation that are out of scope but worth tracking.
     Each item should explain what and why in one line. -->

- [x] WebSocket "request-completed" log line equivalent to `request-logger.ts` (con `durationMs`, `statusCode`/result) en los 3 handlers WS — actualmente los metric filters `SlowRequests` y `AuthFailures` sólo cubren HTTP; sin esto, la latencia o errores WS son invisibles en CloudWatch sin tracing. _(Deferred 2026-05-17 — no se persigue en este batch.)_
- [x] Ampliar logging estructurado alrededor de operaciones Mongo (queries lentas, timeouts, auth) para que el filter `MongoConnectionErrors` capture más de un solo punto (`db/client.ts:56`). Hoy un timeout en una query no genera la métrica. _(Deferred 2026-05-17.)_
- [x] Extraer helper compartido para definición de Lambdas (`runtime`, `memorySize`, `timeout`, `logRetention`, `code`) — la misma config se repite 4 veces en `api-stack.ts` + `websocket-stack.ts` y es la forma más fácil de que `logRetention` o `memorySize` se desincronicen. _(Deferred 2026-05-17.)_
- [x] Sincronizar `docs/INFRASTRUCTURE.md` con la realidad: el diagrama menciona `kaipos-prod-api-HealthFunction` pero la función actual es `ApiFunction` — drift menor pero confuso al onboardear. _(Deferred 2026-05-17.)_
- [x] Evaluar consolidar las 4 alarmas de `Lambda Errors` (1 API + 3 WS) en una sola alarma con `MathExpression` agregando errores de las 4 funciones — libera espacio del free tier (10 alarmas) y simplifica el mapping de runbook a "una alarma = un dashboard". _(Deferred 2026-05-17.)_
- [x] Configurar slow-query alerts y connection alerts en la consola de MongoDB Atlas (M0/M2 free) — complementa el monitoring serverside; requiere acceso a la consola Atlas y no aplica IaC en CDK. _(Deferred 2026-05-17.)_
- [x] Considerar `AWS Budgets` con alerta a $5/mes para detectar en horas (no en 30 días) si algo sale del free tier de CloudWatch/SNS. _(Deferred 2026-05-17.)_

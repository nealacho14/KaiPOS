# Plan: Paso 11 — Monitoring, Logging y Alertas

| Field          | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| Notion Ticket  | [NT-33618b91](https://notion.so/33618b913fdd81deab13d5ba23e6cd0c) |
| Spec           | `.specs/NT-33618b91_monitoring-logging-alarms/spec.md`           |
| Feature Branch | `NT-33618b91/monitoring-logging-alarms/feature`                  |
| Target         | `main`                                                           |

<!-- Multi-phase sequential plan. Phases are stacked — each targets the previous phase's branch.
     Phase 1 branch targets the feature branch; subsequent phases target the previous phase.
     Use `/kaipos.implement` to implement one phase at a time. -->

**Decisions captured during planning:**

- Único stage en CDK es `prod` (`infra/lib/config.ts`). El spec menciona `dev y prod` pero no existe stage `dev`; este plan trabaja sólo con `prod` — agregar `dev` queda fuera de alcance.
- Email destinatario de alarmas: `kelvin.hernandezc30@gmail.com` para `prod` durante MVP. Parametrizado en `infra/lib/config.ts` para poder cambiarlo más adelante sin tocar la stack.
- Patrón del metric filter `MongoConnectionErrors` se acota a la línea de log que ya emite `apps/backend/src/db/client.ts:56` (`MongoDB connection error`). Si aparecen errores Atlas adicionales (timeouts, auth) se amplía el patrón en una iteración futura — fuera de alcance.

## Phase 1: Backend logger redaction y `LOG_LEVEL` runtime

**Branch**: `NT-33618b91/monitoring-logging-alarms/logger-redact-and-level`
**Targets**: `NT-33618b91/monitoring-logging-alarms/feature`

### Tasks

- [x] Editar `apps/backend/src/lib/logger.ts`:
  - Añadir bloque `redact: { paths: [...], censor: '[REDACTED]' }` al constructor de Pino con paths: `password`, `passwordHash`, `token`, `refreshToken`, `accessToken`, `jwtSecret`, `authorization`, `headers.authorization`, `req.headers.authorization`, `req.headers.cookie`, y sus variantes con wildcard `*.*` para objetos anidados.
  - Reemplazar `level: isProduction ? 'info' : 'debug'` por `level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug')`.
- [x] Crear `apps/backend/src/lib/logger.test.ts` con vitest:
  - Test 1: `password: 'foo'` plano (top-level) en un log se imprime como `[REDACTED]`.
  - Test 2: `headers.authorization: 'Bearer xxx'` anidado se imprime como `[REDACTED]`.
  - Test 3: objeto en cualquier nivel con `passwordHash`, `token`, `accessToken`, `refreshToken`, `jwtSecret` también se redacta.
  - Test 4: `LOG_LEVEL=debug` en el env eleva el nivel sobre `info` por defecto.
  - Implementación: usar un `pino` con `destination` apuntando a un buffer en memoria (ej. `pino({ ...opts }, pino.destination({ dest, sync: true }))` o un `Writable` custom). Importar el módulo después de setear el env para que `LOG_LEVEL` tome efecto (`vi.resetModules()`).
- [x] Actualizar `docs/architecture.md` (sección "Backend pattern") para mencionar redaction + `LOG_LEVEL`.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm --filter @kaipos/backend test` corre `logger.test.ts` y todos los casos pasan
- [ ] Manual: `LOG_LEVEL=debug pnpm dev` muestra líneas `debug`; sin la env var, sólo `info` y arriba

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 2: CDK monitoring stack, access logs, alarmas y runbook

**Branch**: `NT-33618b91/monitoring-logging-alarms/cdk-alarms-and-docs`
**Targets**: `NT-33618b91/monitoring-logging-alarms/logger-redact-and-level`

### Tasks

#### Config

- [x] Añadir `alertsEmail: string` a `StageConfig` en `infra/lib/config.ts` con valor `'kelvin.hernandezc30@gmail.com'` para `prod`.

#### Exponer recursos para cross-stack

- [x] En `infra/lib/api-stack.ts` exponer `readonly apiFunction: lambda.Function` y `readonly httpApi: apigw.HttpApi` (ya existe). Convertir el `HttpApi` a uso explícito de `HttpStage` (o capturar `defaultStage` vía `httpApi.defaultStage`) para poder añadir access logs sin escape hatch — si requiere escape hatch, usar `(httpApi.defaultStage!.node.defaultChild as apigw.CfnStage).accessLogSettings`. Crear log group dedicado `kaipos-prod-api-access-logs` con retención `ONE_MONTH` y formato `AccessLogFormat.jsonWithStandardFields({...})` (campos del spec).
- [x] En `infra/lib/websocket-stack.ts` exponer `readonly wsConnectFn: lambda.Function`, `readonly wsDisconnectFn: lambda.Function`, `readonly wsDefaultFn: lambda.Function`.

#### Monitoring stack (nuevo)

- [x] Crear `infra/lib/monitoring-stack.ts` con `MonitoringStack extends cdk.Stack`. Props: `config`, `httpApi`, `apiFunction`, `wsConnectFn`, `wsDisconnectFn`, `wsDefaultFn`, `apiAccessLogGroup` (referencia al log group de access logs creado en `api-stack`).
- [x] SNS topic `kaipos-prod-alerts` (`@aws-cdk/aws-sns`) + `EmailSubscription(config.alertsEmail)`.
- [x] Metric filters (`logs.MetricFilter`) sobre los log groups Lambda (resueltos por `lambda.Function.logGroup`):
  - `MongoConnectionErrors`: filter `{ $.level = 50 && $.msg = "MongoDB connection error" }` sobre el log group de `apiFunction`. Métrica `kaipos/observability::MongoConnectionErrors` con `metricValue: '1'`, `defaultValue: 0`.
  - `AuthFailures`: filter `{ $.statusCode = 401 }` sobre el log group de `apiFunction` (proviene del `request-logger`). Métrica `kaipos/observability::AuthFailures`.
  - `SlowRequests`: filter `{ $.durationMs > 3000 }` sobre el log group de `apiFunction`. Métrica `kaipos/observability::SlowRequests`.
- [x] Alarmas (`cloudwatch.Alarm` + `cw_actions.SnsAction(alertsTopic)`):
  - `Api5xxHigh` — `httpApi.metricServerError()`, threshold `> 5`, period 5 min, 1 datapoint.
  - `ApiLatencyHighP95` — `httpApi.metricLatency({ statistic: 'p95' })`, threshold `> 3000ms`, period 5 min, 1 datapoint.
  - `ApiFunctionErrors` (Lambda errors), `ApiFunctionThrottles` (Lambda throttles) — separadas para la api Lambda. WS Lambdas (connect/disconnect/default) consolidadas en una sola alarma `WsLambdaErrorsHigh` y otra `WsLambdaThrottlesHigh` vía `MathExpression` SUM, para mantener total ≤ 10.
  - `MongoConnectionErrorsHigh` — métrica del filter, threshold `> 5`, period 5 min.
  - `SlowRequestsHigh` — métrica del filter, threshold `> 10`, period 5 min.
- [x] **Verificar conteo de alarmas ≤ 10** antes del deploy: synth template renderiza exactamente 8 alarmas en `kaipos-prod-monitoring`.
- [x] Cada alarma usa `treatMissingData: TreatMissingData.NOT_BREACHING` para no disparar por silencio.

#### Cableado en `infra/bin/infra.ts`

- [x] Instanciar `MonitoringStack` con dependencias de `api`, `ws`, y el access-log group expuesto por `ApiStack`.

#### Documentación

- [x] Crear `docs/observability.md` con:
  - Sección "Logs Insights queries" con 4 queries listas:
    1. Por `requestId` (HTTP + WS, dos `fields`/`filter`).
    2. Top-10 endpoints por `durationMs` (últimas 24h).
    3. 5xx por `path` (últimas 24h).
    4. WS disconnects por `connectionId` y `routeKey`.
  - Sección "Runbook por alarma" — 6 entradas (`Api5xxHigh`, `ApiLatencyHighP95`, `LambdaErrors*`, `LambdaThrottles*`, `MongoConnectionErrorsHigh`, `SlowRequestsHigh`) con: síntoma, queries de diagnóstico, próximas acciones, link a Atlas Performance Advisor.
  - Sección "Atlas native monitoring" con link a `https://cloud.mongodb.com` y nota sobre slow query log + connection metrics en M0/M2.
  - Sección "Costos" — referencia a free tier y verificación en Cost Explorer 30 días post-deploy.
- [x] Actualizar `docs/INFRASTRUCTURE.md` para mencionar `kaipos-prod-monitoring` stack y enlazar a `docs/observability.md`.
- [x] Actualizar `CLAUDE.md` (si cabe en ≤80 líneas) o `docs/architecture.md` con un puntero a `docs/observability.md` desde la lista de docs.

### Verification

- [x] `pnpm typecheck` passes (root + `pnpm --filter @kaipos/infra typecheck`)
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm --filter @kaipos/infra synth:prod` pasa sin warnings sobre el nuevo stack
- [x] Manual: contar alarmas en el `synth` template ≤ 10 (greppear `AWS::CloudWatch::Alarm`) — 8 alarmas
- [x] Manual: revisar que los paths de redact de Phase 1 no se hayan roto al re-correr `pnpm --filter @kaipos/backend test` — 370 tests passing

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

Después de mergear ambas fases a `main` y deployar a `prod` (`pnpm deploy:prod`):

- [ ] Confirmar suscripción de email desde `kelvin.hernandezc30@gmail.com` (AWS envía link de confirmación tras el primer deploy del SNS topic).
- [ ] Pegar un `requestId` real (extraído de cualquier request a la API) en CloudWatch Logs Insights y verificar que aparecen todas las líneas correlacionadas.
- [ ] Subir `LOG_LEVEL=debug` desde la consola de la Lambda API → ver que aparecen líneas `debug` en el log group sin redeploy → restaurar a `info` y confirmar que vuelven a filtrarse.
- [ ] Forzar 6 errores 5xx consecutivos contra un endpoint (ej. apuntar la app a un MONGO_URI inválido por unos minutos o hacer `throw` en un endpoint de prueba) → confirmar que llega email `Api5xxHigh` en ≤ 6 min.
- [ ] Forzar `SlowRequests` (endpoint con `await new Promise(r => setTimeout(r, 4000))` × 11) → confirmar email `SlowRequestsHigh`.
- [ ] Inducir `MongoConnectionErrors` rotando temporalmente la IP allowlist de Atlas y disparando 6 requests → confirmar email `MongoConnectionErrorsHigh` y restaurar el allowlist.
- [ ] Loguear (en un endpoint de prueba) un objeto con `password: 'foo'` y `headers.authorization: 'Bearer xxx'` → verificar en CloudWatch Logs que aparecen como `[REDACTED]`.
- [ ] 30 días post-deploy: revisar Cost Explorer filtrado por `CloudWatch` y `SNS` → debe ser **$0.00**. Si excede, registrar la causa raíz en `docs/observability.md` antes de cerrar el ticket.
- [ ] `docs/observability.md` se renderiza correctamente en GitHub (tablas, code blocks, links).

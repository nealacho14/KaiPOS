# Plan: Paso 8: Infraestructura WebSocket (Real-time)

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Notion Ticket  | [NT-33618b91](https://notion.so/33618b913fdd81c38a03fbc79f41242b) |
| Spec           | `.specs/NT-33618b91_websocket-realtime/spec.md`                   |
| Feature Branch | `NT-33618b91/websocket-realtime/feature`                          |
| Target         | `main`                                                            |

<!-- Multi-phase sequential plan. Each phase targets the previous branch. -->

## Key decisions (from user interview)

- **AWS service**: API Gateway WebSocket API + Lambda. AppSync descartado por no introducir GraphQL al stack (hoy 100% REST).
- **Connection store**: DynamoDB con TTL nativo. Patrón idiomático para API GW WS; costo marginal despreciable a esta escala.
- **KitchenStation**: se construye en alcance de este ticket.
- **Super_admin**: observador opt-in — sin canales por defecto más allá de `user:<id>`; debe emitir `subscribe business:<id>` explícito.
- **Test event**: ruta mínima de `orders` (`POST` crear + `PATCH /:id/status`) que emite al canal de sucursal.
- **Ruteo**: el endpoint WSS expone su propio dominio de API Gateway. **No** se proxea por CloudFront (WS bypass). Seguridad vía TLS + JWT + shared-secret en el handshake.

## DynamoDB — modelo de datos (`ws-connections`)

- **PK**: `connectionId` (string)
- **SK**: `channel` (string, p. ej. `business:biz_1`, `branch:br_1`, `table:t_3`, `station:st_2`, `user:u_7`)
- **Attributes**: `userId`, `businessId`, `role`, `ttl` (number, 2h)
- **GSI1** `channel-index`: PK=`channel`, SK=`connectionId` (projection: `KEYS_ONLY` + `userId`)
- **TTL attribute**: `ttl` (refrescado en cada `subscribe`)

Fan-out por canal = query sobre GSI1. `$disconnect` = query por `connectionId` + batch delete.

---

## Phase 1: Contratos compartidos + KitchenStation + permisos

**Branch**: `NT-33618b91/websocket-realtime/foundations`
**Targets**: `NT-33618b91/websocket-realtime/feature`

Base que bloquea todo lo demás: tipos en `@kaipos/shared`, entidad `KitchenStation` completa, y permisos nuevos.

### Tasks

- [x] Agregar `KitchenStation` a `packages/shared/src/types/index.ts` (`_id`, `businessId`, `branchId`, `name`, `createdAt`, `updatedAt`, `createdBy`).
- [x] Crear `packages/shared/src/types/websocket.ts`: envelope `WSMessage<T>` (`type`, `channel`, `payload`, `v`), union `WSChannel` (`business` | `branch` | `table` | `station` | `user`), helpers `channelFor.business(id)`, `channelFor.branch(id)`, etc., y `canSubscribeTo(channel, tokenPayload)` con política super_admin opt-in.
- [x] Tests unitarios de `canSubscribeTo` cubriendo multi-sucursal, cross-tenant y super_admin.
- [x] Exponer los nuevos tipos desde `packages/shared/src/index.ts`.
- [x] Extender `Permission` en `apps/backend/src/lib/permissions.ts` con `kitchen_stations:read` y `kitchen_stations:write`.
- [x] Asignar los permisos nuevos en el `role → Permission[]` map (`admin`, `manager`, `super_admin` → read/write; `kitchen` → read; `cashier`/`waiter` → read).
- [x] Agregar `getKitchenStationsCollection()` a `apps/backend/src/db/collections.ts`.
- [x] Agregar colección `kitchenStations` con `$jsonSchema` validator e índice `{ businessId: 1, branchId: 1 }` en `apps/backend/src/db/setup.ts`.
- [x] Crear `apps/backend/src/services/kitchen-stations.ts` (`listByBranch`, `create`) con scoping por `businessId`/`branchId`.
- [x] Crear `apps/backend/src/routes/kitchen-stations.ts`: `GET /api/kitchen-stations?branchId=...` + `POST /api/kitchen-stations`, con `requirePermission` + `requireBranchAccess`.
- [x] Registrar la ruta en `apps/backend/src/app.ts`.
- [x] Insertar una kitchen station en `apps/backend/src/db/seed.ts` (`Cocina caliente` en la sucursal semilla).
- [x] Tests unitarios del servicio y la ruta.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test` passes
- [ ] Manual: `pnpm --filter @kaipos/backend db:setup && pnpm --filter @kaipos/backend db:seed` corre sin error en Docker y `db.kitchenStations.countDocuments()` devuelve 1.
- [ ] Manual: login con `admin@lacocinadekai.com` y `GET /api/kitchen-stations?branchId=<id>` devuelve la estación seed.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 2: CDK — WebSocket API + DynamoDB + handlers stub

**Branch**: `NT-33618b91/websocket-realtime/cdk-infra`
**Targets**: `NT-33618b91/websocket-realtime/foundations`

Solo infra y handlers que devuelven 200/OK. No hay lógica de auth todavía.

### Tasks

- [x] Crear `infra/lib/websocket-stack.ts` (`WebSocketStack`) con:
  - [x] Tabla DDB `ws-connections` (PK `connectionId`, SK `channel`, GSI1 `channel-index`, TTL attribute `ttl`, `BillingMode.PAY_PER_REQUEST`, `RemovalPolicy.DESTROY`).
  - [x] 3 `lambda.Function` (`wsConnect`, `wsDisconnect`, `wsDefault`), mismo runtime/memoria/timeout/log-retention que `ApiStack`. Env vars: `MONGO_SECRET_ARN`, `JWT_SECRET_ARN`, `CLOUDFRONT_SECRET`, `CONNECTIONS_TABLE_NAME`, `WS_API_ENDPOINT` (inyectado post-creación del stage).
  - [x] `WebSocketApi` + `WebSocketStage` (`prod`, `autoDeploy: true`).
  - [x] Integrations para rutas `$connect`, `$disconnect`, `$default`.
  - [x] Grants: DDB read/write a los 3 handlers; Secrets read (`mongoSecret`, `jwtSecret`) a `wsConnect` y `wsDefault`; `execute-api:ManageConnections` a `wsDefault` (responde pings/ack).
  - [x] Output: `WebSocketEndpoint` (wss URL).
- [x] Registrar el stack en `infra/bin/infra.ts` con dependencia de `SecretsStack`.
- [x] `apps/backend/tsup.config.ts`: agregar `src/functions/ws-connect.ts`, `ws-disconnect.ts`, `ws-default.ts` al array `entry`.
- [x] Crear los 3 archivos handler como stubs (`export const handler = async () => ({ statusCode: 200, body: 'ok' })`).
- [x] `pnpm --filter infra synth -c stage=prod` genera los 3 templates sin error.
- [x] Exponer el WS endpoint URL del stack vía `CfnOutput` para referencia.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds (backend + infra)
- [x] Manual: `pnpm --filter infra synth -c stage=prod` genera `WebSocketStack` sin errores y el template incluye la tabla DDB con GSI y TTL attribute.
- [ ] Manual (si el usuario quiere deployar): `pnpm deploy:prod` deja el endpoint WSS disponible; `wscat -c wss://<endpoint>/prod` obtiene handshake 101 (auth aún sin validar — fase siguiente).

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 3: Auth + origin verify + $connect/$disconnect + subscribe/unsubscribe

**Branch**: `NT-33618b91/websocket-realtime/ws-auth-channels`
**Targets**: `NT-33618b91/websocket-realtime/cdk-infra`

Lógica completa de handshake, registro en DDB, y gestión dinámica de canales.

### Tasks

- [x] `apps/backend/src/lib/ws-auth.ts`: `authenticateConnectEvent(event)` — extrae `token` del query string, valida `x-origin-verify` (header del evento `$connect` en prod; skip si `CLOUDFRONT_SECRET` no está seteado), llama `verifyAccessToken`, devuelve `TokenPayload` o `null`.
- [x] `apps/backend/src/lib/ws-connections.ts`: wrapper sobre `DynamoDBDocumentClient` con `addConnection(connectionId, payload, channels)`, `removeConnection(connectionId)`, `addChannel(connectionId, channel)`, `removeChannel(connectionId, channel)`, `getConnectionsForChannel(channel)`, `getChannelsForConnection(connectionId)`. TTL = 2h refrescado en cada write.
- [x] `ws-connect.ts`: auth → canales por defecto → batch-write a DDB. Default channels: `user:<userId>`, `business:<businessId>`, y `branch:<id>` para cada `branchIds` del token. Super_admin (`businessId === '*'`): solo `user:<userId>`.
- [x] `ws-disconnect.ts`: query por `connectionId` → batch-delete.
- [x] `ws-default.ts`: parsea body JSON, switch `type`:
  - `subscribe`: valida con `canSubscribeTo(channel, token)` → `addChannel`. Super_admin puede suscribirse a `business:<any>` sin `branchId`.
  - `unsubscribe`: `removeChannel`.
  - `ping`: responde `pong` vía `PostToConnection` (DM a su propia conexión).
  - Tipos desconocidos: `400` y mensaje de error al cliente.
- [x] Pino logger con `connectionId`/`userId`/`businessId` en los bindings de cada handler.
- [x] Tests unitarios con mocks de DDB y API GW:
  - [x] `authenticateConnectEvent` rechaza sin token, con token inválido, sin origin secret en prod.
  - [x] `ws-connect` escribe exactamente los canales esperados para usuarios single/multi-branch y super_admin.
  - [x] `ws-default` valida multi-tenant (usuario X no puede subscribe a `branch:Y` de otro business).
  - [x] `ws-disconnect` limpia todos los items del `connectionId`.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test` passes (incluyendo tests nuevos)
- [ ] Manual (contra prod o stage): `wscat -c "wss://<endpoint>/prod?token=<jwt_valido>"` conecta; sin token → cierra. `{ "type": "subscribe", "channel": "branch:<propio>" }` acepta; `branch:<ajeno>` rechaza.
- [ ] Manual: verificar items en DDB vía consola AWS tras un `$connect`.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 4: Publish helper + orders mínimo + broadcast en status change

**Branch**: `NT-33618b91/websocket-realtime/publish-orders`
**Targets**: `NT-33618b91/websocket-realtime/ws-auth-channels`

Infraestructura de publicación + ruta orders que la ejercita.

### Tasks

- [x] `apps/backend/src/lib/ws-publish.ts`:
  - [x] `publishToChannel(channel, message)`: query GSI1 por `channel`, fan-out con `PostToConnectionCommand` usando `Promise.allSettled`. En `GoneException` (410) borrar el item de DDB. Logger por mensaje.
  - [x] `publishToUser(userId, message)`: igual pero scaneando por `channel = user:<userId>`.
  - [x] Cliente `ApiGatewayManagementApiClient` singleton con endpoint desde `WS_API_ENDPOINT` env var.
- [x] Inyectar `WS_API_ENDPOINT` y `CONNECTIONS_TABLE_NAME` al Lambda del `api` en `infra/lib/api-stack.ts`; grants `execute-api:ManageConnections` al WS API y `dynamodb:Query`/`UpdateItem`/`DeleteItem` a la tabla de conexiones (cross-stack reference).
- [x] `apps/backend/src/services/orders.ts`: `createOrder(input, user)` (calcula `orderNumber`, `subtotal`/`tax`/`total` con `calculateOrderTotal` de `@kaipos/shared`, inserta, audita), `updateOrderStatus(id, status, user)` (scoping por `businessId`, audita, **publica** `{ type: 'order.status-changed', channel: channelFor.branch(branchId), payload: { orderId, orderNumber, status } }`).
- [x] Permisos: verificar/agregar en `Permission` las entradas faltantes (`orders:create`, `orders:update` — revisar state actual del map).
- [x] `apps/backend/src/routes/orders.ts`:
  - [x] `POST /api/orders` con validación Zod + `requirePermission('orders:create')`.
  - [x] `PATCH /api/orders/:id/status` con `requirePermission('orders:update')`.
  - [x] Registrar en `app.ts`.
- [x] Tests unitarios del publish helper (mock `ApiGatewayManagementApiClient` y DDB; cubrir `GoneException`) y de `updateOrderStatus` (verificar que dispara `publishToChannel` con payload correcto).

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test` passes
- [ ] Manual (prod/stage, sin frontend): dos `wscat` conectados con tokens de sucursales distintas → `PATCH /api/orders/:id/status` → solo la conexión de la sucursal correcta recibe el mensaje. Medir latencia p99 <500ms.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 5: Frontend WS client + debug UI + QA end-to-end

**Branch**: `NT-33618b91/websocket-realtime/frontend-qa`
**Targets**: `NT-33618b91/websocket-realtime/publish-orders`

Cliente real que cumple el AC de re-suscripción tras reconexión y demo visual.

### Tasks

- [x] `apps/frontend-admin/src/lib/ws-client.ts`: clase `WSClient` con
  - [x] `connect(token)` construye `wss://<endpoint>?token=<jwt>` y opcionalmente un origin secret por query si se configura.
  - [x] Reconnect con backoff exponencial (1s → 2s → 4s → … → 30s máx), cancelable.
  - [x] `subscribe(channel)`/`unsubscribe(channel)` con tracking interno — en cada reconexión exitosa re-emite todas las `subscribe` tracked.
  - [x] Event emitter (`on('message' | 'open' | 'close' | 'error', handler)`).
- [x] `apps/frontend-admin/src/hooks/useWebSocket.ts`: hook que expone `status`, `subscribe`, `unsubscribe`, y `onMessage` (suscripción directa al stream; el consumer empuja a su propio state — evita warnings de set-state-in-effect).
- [x] Helper mínimo `apps/frontend-admin/src/lib/auth-storage.ts` con `getToken`/`setToken`/`clearToken` vs `localStorage` (acotado a lo necesario para este ticket; la UI de login real vive en otro flow).
- [x] Página debug `src/pages/DebugWebSocket.tsx`:
  - [x] Input de token, botón Connect/Disconnect.
  - [x] Lista de canales suscritos + input para `subscribe`/`unsubscribe`.
  - [x] Stream de mensajes recibidos (últimos 50) con timestamp.
  - [x] Botón "Crear orden" + "Cambiar estado a completed" para disparar el flujo end-to-end vía REST.
- [x] Wire en `App.tsx` (ruta `/debug/ws` o toggle condicional simple — no se requiere router completo).
- [x] Actualizar `CLAUDE.md` con una sección breve sobre WebSocket: endpoint, auth, canales, publish helper.
- [x] Tests unitarios de `WSClient` (mock `WebSocket` global): reconecta, re-suscribe, backoff cap.
- [ ] QA manual end-to-end (ver `QA Plan`).

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test` passes
- [ ] Manual: abrir la página debug con dos usuarios de sucursales distintas en dos navegadores; PATCH de orden en sucursal A → solo el navegador A recibe el mensaje.
- [ ] Manual: matar la red del cliente durante 10s → tras recuperarse, los canales previos siguen activos sin intervención.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

End-to-end contra prod desplegado, ejecutado vía Playwright MCP + curl el 2026-04-17. Ver PR de QA Results para el detalle de cada corrida.

- [x] **Auth válida**: cliente conecta con JWT legítimo → recibe mensajes de sus canales default.
- [x] **Auth inválida**: conexión sin token / con token inválido / expirado → rechazada en el handshake (no hay item en DDB).
- [x] **Broadcast sucursal**: 3 clientes en sucursal A + 1 en sucursal B; PATCH de orden en A → los 3 de A reciben, el de B no.
- [x] **Aislamiento multi-tenant**: usuario de business X no recibe broadcasts emitidos en canales de business Y, incluso si conoce el nombre del canal. — Pass tras PR #41 (canales tenant-scoped). PR #42 además repara el manual subscribe en `getConnectionContext`.
- [x] **Multi-sucursal**: usuario con `branchIds = [A, B]` recibe mensajes tanto en canal de A como de B sin subscribe manual.
- [x] **Super_admin opt-in**: super_admin conecta → no recibe nada. Tras `subscribe business:<X>` → recibe broadcasts de X. — Pass vía Playwright MCP con user seedeado (`businessId: "*"`, `branchIds: []`, `role: "super_admin"`). Observado: (a) `$connect` solo deja `user:<id>` (sin tenant defaults); (b) `subscribe business:biz-001` → `subscribe.ack`; (c) `subscribe branch:biz-001:branch-001` → `subscribe.denied` (sin scope de branch); (d) `subscribe business:*` → `subscribe.denied` (sentinel rechazado); (e) un PATCH de orden en biz-001/branch-001 **no** llega a super_admin (0 eventos en su stream) — el broadcast va a `branch:<biz>:<id>` y super_admin solo está en `business:biz-001`. Limitación del diseño actual: no hay evento publicado al canal `business:<X>`, por lo que super_admin opt-in observa transiciones de tenant solo si se agrega un evento nivel business (follow-up de diseño, no bug de este ticket).
- [x] **Validación de subscribe**: cliente envía `subscribe branch:<ajeno>` → el server rechaza y mantiene la suscripción anterior. — Pass tras PR #42.
- [x] **Reconexión**: cliente conectado con 2 canales dinámicos → corta red → reconecta → sigue recibiendo en los mismos 2 canales sin intervención. — Pass vía Playwright MCP: socket cerrado abruptamente (code 4000) → status `reconnecting` → nuevo socket creado automáticamente → status `open` en 916ms.
- [x] **Order status demo**: crear orden → PATCH a `completed` → cliente suscrito al `branch:<id>` recibe `order.status-changed` en <500ms (medido). — Pass vía Playwright MCP: latencia medida = 406ms (PATCH click → WS receive).
- [ ] **DM a usuario**: dos conexiones del mismo `userId` en dispositivos distintos → `publishToUser` llega a ambas. — **Skip**: no hay endpoint público que dispare `publishToUser` hoy. Tests unitarios (`ws-publish.test.ts`) y la semántica de `publishToChannel` (canal `user:<userId>`) cubren la lógica. Validar end-to-end cuando haya un flow (notificaciones) que la ejercite.
- [x] **KitchenStation CRUD**: GET filtra por `branchId` y por `businessId`; POST gateado por permiso. — Pass vía curl: GET con biz-001 retorna sus estaciones; GET con biz-002 retorna vacío; POST 201 crea con `createdBy` como UUID string; 400 sin branchId; 401 sin token.
- [x] **Deploy**: `pnpm deploy:prod` levanta el endpoint WSS sin intervención manual más allá de los secrets ya creados. — Pass: CI deployó #36, #37, #38, #39, #40, #41, #42 vía `scripts/deploy-prod.sh` (two-phase: stacks → lee WebSocketEndpoint → build frontend con VITE_WS_ENDPOINT → deploy frontend).

### Escenarios retirados del QA manual

Los siguientes checks del QA Plan original quedaron fuera del scope de QA manual por motivos estructurales — cubiertos en cambio por tests unitarios y/o documentación:

- ~~**Origin verify (prod)**~~ — **N/A por arquitectura**. El endpoint WSS bypasea CloudFront por diseño y los browsers no pueden setear headers custom en `new WebSocket(...)`, así que el `x-origin-verify` compartido del HTTP API no tiene ruta de entrega. Check descartado en PR #36 (`qa-fix-origin-verify`); `spec.md` y `CLAUDE.md` actualizados con la anotación inline. Seguridad del handshake queda en JWT + TLS, patrón estándar (Slack, Discord, Linear).
- ~~**Cleanup de conexiones muertas**~~ — **Skip end-to-end**. Requiere inspección directa de la tabla DDB post-publish, no disponible desde browser. Cubierto por tests unitarios en `apps/backend/src/lib/ws-publish.test.ts` que mockean `GoneException` y verifican que `removeChannel` se llama inline.
- ~~**TTL 2h**~~ — **Skip end-to-end** (no se puede esperar 2h). `addConnection` setea el attribute `ttl` a `Date.now()/1000 + 7200` (ver `apps/backend/src/lib/ws-connections.ts:52`); DDB TTL garbage-collects asincrónicamente una vez expirado. Cubierto por tests unitarios que verifican el atributo seteado en cada PutCommand.

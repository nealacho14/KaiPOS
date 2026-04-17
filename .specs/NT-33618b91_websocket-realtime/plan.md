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

- [ ] Crear `infra/lib/websocket-stack.ts` (`WebSocketStack`) con:
  - [ ] Tabla DDB `ws-connections` (PK `connectionId`, SK `channel`, GSI1 `channel-index`, TTL attribute `ttl`, `BillingMode.PAY_PER_REQUEST`, `RemovalPolicy.DESTROY`).
  - [ ] 3 `lambda.Function` (`wsConnect`, `wsDisconnect`, `wsDefault`), mismo runtime/memoria/timeout/log-retention que `ApiStack`. Env vars: `MONGO_SECRET_ARN`, `JWT_SECRET_ARN`, `CLOUDFRONT_SECRET`, `CONNECTIONS_TABLE_NAME`, `WS_API_ENDPOINT` (inyectado post-creación del stage).
  - [ ] `WebSocketApi` + `WebSocketStage` (`prod`, `autoDeploy: true`).
  - [ ] Integrations para rutas `$connect`, `$disconnect`, `$default`.
  - [ ] Grants: DDB read/write a los 3 handlers; Secrets read (`mongoSecret`, `jwtSecret`) a `wsConnect` y `wsDefault`; `execute-api:ManageConnections` a `wsDefault` (responde pings/ack).
  - [ ] Output: `WebSocketEndpoint` (wss URL).
- [ ] Registrar el stack en `infra/bin/infra.ts` con dependencia de `SecretsStack`.
- [ ] `apps/backend/tsup.config.ts`: agregar `src/functions/ws-connect.ts`, `ws-disconnect.ts`, `ws-default.ts` al array `entry`.
- [ ] Crear los 3 archivos handler como stubs (`export const handler = async () => ({ statusCode: 200, body: 'ok' })`).
- [ ] `pnpm --filter infra synth -c stage=prod` genera los 3 templates sin error.
- [ ] Exponer el WS endpoint URL del stack vía `CfnOutput` para referencia.

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds (backend + infra)
- [ ] Manual: `pnpm --filter infra synth -c stage=prod` genera `WebSocketStack` sin errores y el template incluye la tabla DDB con GSI y TTL attribute.
- [ ] Manual (si el usuario quiere deployar): `pnpm deploy:prod` deja el endpoint WSS disponible; `wscat -c wss://<endpoint>/prod` obtiene handshake 101 (auth aún sin validar — fase siguiente).

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 3: Auth + origin verify + $connect/$disconnect + subscribe/unsubscribe

**Branch**: `NT-33618b91/websocket-realtime/ws-auth-channels`
**Targets**: `NT-33618b91/websocket-realtime/cdk-infra`

Lógica completa de handshake, registro en DDB, y gestión dinámica de canales.

### Tasks

- [ ] `apps/backend/src/lib/ws-auth.ts`: `authenticateConnectEvent(event)` — extrae `token` del query string, valida `x-origin-verify` (header del evento `$connect` en prod; skip si `CLOUDFRONT_SECRET` no está seteado), llama `verifyAccessToken`, devuelve `TokenPayload` o `null`.
- [ ] `apps/backend/src/lib/ws-connections.ts`: wrapper sobre `DynamoDBDocumentClient` con `addConnection(connectionId, payload, channels)`, `removeConnection(connectionId)`, `addChannel(connectionId, channel)`, `removeChannel(connectionId, channel)`, `getConnectionsForChannel(channel)`, `getChannelsForConnection(connectionId)`. TTL = 2h refrescado en cada write.
- [ ] `ws-connect.ts`: auth → canales por defecto → batch-write a DDB. Default channels: `user:<userId>`, `business:<businessId>`, y `branch:<id>` para cada `branchIds` del token. Super_admin (`businessId === '*'`): solo `user:<userId>`.
- [ ] `ws-disconnect.ts`: query por `connectionId` → batch-delete.
- [ ] `ws-default.ts`: parsea body JSON, switch `type`:
  - `subscribe`: valida con `canSubscribeTo(channel, token)` → `addChannel`. Super_admin puede suscribirse a `business:<any>` sin `branchId`.
  - `unsubscribe`: `removeChannel`.
  - `ping`: responde `pong` vía `PostToConnection` (DM a su propia conexión).
  - Tipos desconocidos: `400` y mensaje de error al cliente.
- [ ] Pino logger con `connectionId`/`userId`/`businessId` en los bindings de cada handler.
- [ ] Tests unitarios con mocks de DDB y API GW:
  - [ ] `authenticateConnectEvent` rechaza sin token, con token inválido, sin origin secret en prod.
  - [ ] `ws-connect` escribe exactamente los canales esperados para usuarios single/multi-branch y super_admin.
  - [ ] `ws-default` valida multi-tenant (usuario X no puede subscribe a `branch:Y` de otro business).
  - [ ] `ws-disconnect` limpia todos los items del `connectionId`.

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes (incluyendo tests nuevos)
- [ ] Manual (contra prod o stage): `wscat -c "wss://<endpoint>/prod?token=<jwt_valido>"` conecta; sin token → cierra. `{ "type": "subscribe", "channel": "branch:<propio>" }` acepta; `branch:<ajeno>` rechaza.
- [ ] Manual: verificar items en DDB vía consola AWS tras un `$connect`.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 4: Publish helper + orders mínimo + broadcast en status change

**Branch**: `NT-33618b91/websocket-realtime/publish-orders`
**Targets**: `NT-33618b91/websocket-realtime/ws-auth-channels`

Infraestructura de publicación + ruta orders que la ejercita.

### Tasks

- [ ] `apps/backend/src/lib/ws-publish.ts`:
  - [ ] `publishToChannel(channel, message)`: query GSI1 por `channel`, fan-out con `PostToConnectionCommand` usando `Promise.allSettled`. En `GoneException` (410) borrar el item de DDB. Logger por mensaje.
  - [ ] `publishToUser(userId, message)`: igual pero scaneando por `channel = user:<userId>`.
  - [ ] Cliente `ApiGatewayManagementApiClient` singleton con endpoint desde `WS_API_ENDPOINT` env var.
- [ ] Inyectar `WS_API_ENDPOINT` y `CONNECTIONS_TABLE_NAME` al Lambda del `api` en `infra/lib/api-stack.ts`; grants `execute-api:ManageConnections` al WS API y `dynamodb:Query`/`UpdateItem`/`DeleteItem` a la tabla de conexiones (cross-stack reference).
- [ ] `apps/backend/src/services/orders.ts`: `createOrder(input, user)` (calcula `orderNumber`, `subtotal`/`tax`/`total` con `calculateOrderTotal` de `@kaipos/shared`, inserta, audita), `updateOrderStatus(id, status, user)` (scoping por `businessId`, audita, **publica** `{ type: 'order.status-changed', channel: channelFor.branch(branchId), payload: { orderId, orderNumber, status } }`).
- [ ] Permisos: verificar/agregar en `Permission` las entradas faltantes (`orders:create`, `orders:update` — revisar state actual del map).
- [ ] `apps/backend/src/routes/orders.ts`:
  - [ ] `POST /api/orders` con validación Zod + `requirePermission('orders:create')`.
  - [ ] `PATCH /api/orders/:id/status` con `requirePermission('orders:update')`.
  - [ ] Registrar en `app.ts`.
- [ ] Tests unitarios del publish helper (mock `ApiGatewayManagementApiClient` y DDB; cubrir `GoneException`) y de `updateOrderStatus` (verificar que dispara `publishToChannel` con payload correcto).

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes
- [ ] Manual (prod/stage, sin frontend): dos `wscat` conectados con tokens de sucursales distintas → `PATCH /api/orders/:id/status` → solo la conexión de la sucursal correcta recibe el mensaje. Medir latencia p99 <500ms.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 5: Frontend WS client + debug UI + QA end-to-end

**Branch**: `NT-33618b91/websocket-realtime/frontend-qa`
**Targets**: `NT-33618b91/websocket-realtime/publish-orders`

Cliente real que cumple el AC de re-suscripción tras reconexión y demo visual.

### Tasks

- [ ] `apps/frontend-admin/src/lib/ws-client.ts`: clase `WSClient` con
  - [ ] `connect(token)` construye `wss://<endpoint>?token=<jwt>` y opcionalmente un origin secret por query si se configura.
  - [ ] Reconnect con backoff exponencial (1s → 2s → 4s → … → 30s máx), cancelable.
  - [ ] `subscribe(channel)`/`unsubscribe(channel)` con tracking interno — en cada reconexión exitosa re-emite todas las `subscribe` tracked.
  - [ ] Event emitter (`on('message' | 'open' | 'close' | 'error', handler)`).
- [ ] `apps/frontend-admin/src/hooks/useWebSocket.ts`: hook que expone `status`, `subscribe`, `unsubscribe`, y `lastMessage`.
- [ ] Helper mínimo `apps/frontend-admin/src/lib/auth-storage.ts` con `getToken`/`setToken`/`clearToken` vs `localStorage` (acotado a lo necesario para este ticket; la UI de login real vive en otro flow).
- [ ] Página debug `src/pages/DebugWebSocket.tsx`:
  - [ ] Input de token, botón Connect/Disconnect.
  - [ ] Lista de canales suscritos + input para `subscribe`/`unsubscribe`.
  - [ ] Stream de mensajes recibidos (últimos 50) con timestamp.
  - [ ] Botón "Crear orden" + "Cambiar estado a completed" para disparar el flujo end-to-end vía REST.
- [ ] Wire en `App.tsx` (ruta `/debug/ws` o toggle condicional simple — no se requiere router completo).
- [ ] Actualizar `CLAUDE.md` con una sección breve sobre WebSocket: endpoint, auth, canales, publish helper.
- [ ] Tests unitarios de `WSClient` (mock `WebSocket` global): reconecta, re-suscribe, backoff cap.
- [ ] QA manual end-to-end (ver `QA Plan`).

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes
- [ ] Manual: abrir la página debug con dos usuarios de sucursales distintas en dos navegadores; PATCH de orden en sucursal A → solo el navegador A recibe el mensaje.
- [ ] Manual: matar la red del cliente durante 10s → tras recuperarse, los canales previos siguen activos sin intervención.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

End-to-end contra prod desplegado (todos los AC del spec). Documentar resultados en el PR de Phase 5.

- [ ] **Auth válida**: cliente conecta con JWT legítimo → recibe mensajes de sus canales default.
- [ ] **Auth inválida**: conexión sin token / con token inválido / expirado → rechazada en el handshake (no hay item en DDB).
- [ ] **Origin verify (prod)**: conexión sin el shared secret → rechazada con 403.
- [ ] **Broadcast sucursal**: 3 clientes en sucursal A + 1 en sucursal B; PATCH de orden en A → los 3 de A reciben, el de B no.
- [ ] **Aislamiento multi-tenant**: usuario de business X no recibe broadcasts emitidos en canales de business Y, incluso si conoce el nombre del canal.
- [ ] **Multi-sucursal**: usuario con `branchIds = [A, B]` recibe mensajes tanto en canal de A como de B sin subscribe manual.
- [ ] **Super_admin opt-in**: super_admin conecta → no recibe nada. Tras `subscribe business:<X>` → recibe broadcasts de X.
- [ ] **Validación de subscribe**: cliente envía `subscribe branch:<ajeno>` → el server rechaza y mantiene la suscripción anterior.
- [ ] **Reconexión**: cliente conectado con 2 canales dinámicos → corta red → reconecta → sigue recibiendo en los mismos 2 canales sin intervención.
- [ ] **Order status demo**: crear orden → PATCH a `completed` → cliente suscrito al `branch:<id>` recibe `order.status-changed` en <500ms (medido).
- [ ] **DM a usuario**: dos conexiones del mismo `userId` en dispositivos distintos → `publishToUser` llega a ambas.
- [ ] **KitchenStation CRUD**: GET filtra por `branchId` y por `businessId`; POST gateado por permiso.
- [ ] **Cleanup de conexiones muertas**: cortar un cliente abruptamente (sin $disconnect) → publish en su canal detecta `GoneException` y borra el item de DDB.
- [ ] **TTL**: registro de conexión sobreviviente se purga automáticamente tras 2h sin tráfico.
- [ ] **Deploy**: `pnpm deploy:prod` levanta el endpoint WSS sin intervención manual más allá de los secrets ya creados.

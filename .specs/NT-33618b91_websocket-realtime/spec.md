# Spec: Paso 8: Infraestructura WebSocket (Real-time)

| Field         | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd81c38a03fbc79f41242b) |
| Status        | To-do                                                             |
| Priority      | Alta                                                              |
| Branch        | `NT-33618b91/websocket-realtime/feature`                          |
| Created       | 2026-04-17                                                        |

## Context

KaiPOS necesita un canal de comunicación en tiempo real para que el KDS (cocina), la app de meseros, la app de clientes y el POS se sincronicen sin polling. Hoy el backend solo expone HTTP REST (Hono local + API Gateway HTTP API + Lambda). No hay ninguna pieza de infra real-time en el repositorio (ni WebSocket, ni Socket.IO, ni SSE, ni AppSync).

El sistema de autenticación ya emite JWT con los claims necesarios (`userId`, `businessId`, `role`, `branchIds`), lo que permite reutilizar la identidad actual en el handshake. La arquitectura AWS del proyecto es serverless sin VPC (ver `CLAUDE.md`), lo que descarta correr un servidor WebSocket sobre ECS/EC2 y empuja hacia **API Gateway WebSocket API + Lambda** o **AppSync**.

El modelo de datos tiene `Business`, `Branch`, `Table` y `Order`, pero **no tiene `KitchenStation`**. El ticket requiere canales "por estación de cocina", por lo que este spec incluye crear la entidad `KitchenStation` como parte del alcance (tipo, colección con validator/índices, CRUD mínimo) para no bloquear el ticket en un sub-ticket previo.

Este trabajo es infraestructura fundacional: habilita features posteriores (KDS, sincronización de órdenes, notificaciones de mesa). Debe quedar probado end-to-end con un flujo real de dominio — un cambio de estado de `Order` que se propague al canal de la sucursal — no solo con un ping sintético.

## Requirements

**Infra AWS**

- Servicio WebSocket desplegado vía CDK en el stack `prod`, serverless y sin VPC.
- Nuevo stack (o extensión de `ApiStack`) que exponga el endpoint WSS, rutas `$connect` / `$disconnect` / `$default` / rutas custom según diseño, e integraciones Lambda correspondientes.
- Tabla/colección de estado para mapear `connectionId → { userId, businessId, branchIds, role, channels }`.
- Log retention `ONE_MONTH` consistente con el resto del stack.
- Costo marginal cercano a cero en reposo (pay-per-message / pay-per-connection-minute).

**Autenticación y origen**

- En el handshake (`$connect`), validar el JWT existente usando `verifyAccessToken()` con los mismos claims actuales.
- Conexiones sin token, con token inválido o expirado deben ser rechazadas antes de registrar `connectionId`.
- ~~Verificación de origen análoga al header `x-origin-verify` del HTTP API (shared-secret) para rechazar conexiones que no pasen por CloudFront en prod. En dev se omite como ya ocurre con `origin-verify`.~~ **Post-implementación (QA fix):** descartado — el endpoint WSS bypasea CloudFront por diseño y los browsers no pueden setear headers custom en `new WebSocket(...)`; el check era estructuralmente imposible en esta topología y rechazaba el 100% de los handshakes en prod. La seguridad del handshake queda en JWT firmado + TLS obligatorio (patrón estándar: Slack, Discord, Linear, Figma). Ver branch `NT-33618b91/websocket-realtime/qa-fix-origin-verify`.

**Canales / rooms**

- Cuatro dimensiones de canal: `business:<businessId>`, `branch:<branchId>`, `table:<tableId>`, `station:<kitchenStationId>`.
- Suscripción automática en `$connect`: al `business:<businessId>` y a todos los `branch:<branchId>` presentes en `branchIds` del token (multi-sucursal).
- Suscripción a canales de mesa y de estación de cocina se hace explícitamente vía mensaje del cliente (`subscribe`), validando pertenencia al `businessId`/`branchId` del usuario.
- `super_admin` (`businessId === '*'`): **observador opt-in**. Por defecto no recibe broadcasts de ningún business. Se suscribe explícitamente a un `business:<id>` vía mensaje; el handler permite esta operación solo para super_admin.

**Operaciones de mensajería**

- Broadcast a un canal específico (entrega a todos los `connectionId` suscritos).
- Mensaje directo a usuario por `userId` (entrega a todas las conexiones activas de ese usuario, pudiendo tener más de una).
- Formato de mensaje versionable con `type`, `payload` y metadatos mínimos (a detallar en el plan).

**Entidad KitchenStation (en alcance de este ticket)**

- Tipo `KitchenStation` en `@kaipos/shared` con al menos: `_id`, `businessId`, `branchId`, `name`, `createdAt`, `updatedAt`.
- Colección en Mongo con `$jsonSchema` validator e índice `{ businessId: 1, branchId: 1 }` en `src/db/setup.ts`.
- CRUD mínimo: listar por `branchId` y crear; suficiente para que existan estaciones a las que suscribirse.
- Permisos RBAC coherentes con el patrón existente (usar `hasPermission` y `resource:action`).

**Cliente / reconexión**

- Cliente WebSocket mínimo en `apps/frontend-admin` que se conecte con el token y re-suscriba canales tras desconexión.
- Retry con backoff exponencial acotado en reconexión.
- Flujo de prueba visible (aunque sea en una página admin / debug) que demuestre recepción en real-time.

**Evento de prueba end-to-end**

- Un cambio de estado de `Order` en el backend publica un mensaje al canal `branch:<branchId>` de la orden. La UI admin (o un cliente de prueba) suscrita al canal recibe el evento en <500ms.
- Este es el criterio de aceptación del "evento de prueba funcional" del ticket original.

## Acceptance Criteria

- [ ] Cliente WS se conecta con token JWT válido
- [ ] Cliente sin token (o token inválido/expirado) es rechazado en el handshake
- [ ] Conexión sin el header/secret de origen es rechazada en prod
- [ ] Mensaje broadcast al canal de sucursal llega a todos los usuarios conectados de esa sucursal
- [ ] Usuario de sucursal A NO recibe mensajes del canal de sucursal B
- [ ] Usuario de business X NO recibe mensajes de business Y (aislamiento multi-tenant)
- [ ] Usuario con múltiples `branchIds` recibe mensajes de todas sus sucursales
- [ ] `super_admin` no recibe nada por defecto; tras enviar `subscribe business:<id>` recibe broadcasts de ese business
- [ ] Cliente intenta enviar `subscribe` a un `branchId` que no está en su token → rechazado
- [ ] Al reconectarse, el cliente se re-suscribe automáticamente a los mismos canales
- [ ] Cambio de estado de `Order` en el backend genera un mensaje recibido por un cliente suscrito al canal `branch:<branchId>` en <500ms
- [ ] Mensaje directo a `userId` llega a todas las conexiones activas de ese usuario
- [ ] Entidad `KitchenStation` existe: tipo, colección con validator/índice, y CRUD mínimo (list/create) expuesto y con RBAC
- [ ] Logs de WS con Pino siguen el patrón actual (JSON en prod, `requestId`/`connectionId` en los bindings)
- [ ] Deploy con `pnpm deploy:prod` levanta el endpoint WSS sin intervención manual (excepto secrets ya creados)

## Out of Scope

- KDS UI completo, app de meseros y app de cliente: este ticket sólo deja la infra + un consumo de prueba.
- Presencia de usuarios / "quién está conectado" — no se construye un feature de presencia explícita (aunque la tabla de conexiones lo habilite).
- Persistencia de mensajes perdidos / replay para clientes que estuvieron offline.
- Notificaciones push (mobile/web push) — canal distinto al WebSocket.
- Ampliar `OrderStatus` con estados de cocina (`in_kitchen`, `ready`, `served`) — si se necesita para el demo, se usa el estado actual (`pending → completed`) o se escala por separado (ver Open Questions).
- Rate limiting por conexión más allá de lo que API Gateway WebSocket ya provee por defecto.
- Migración del HTTP API a otro servicio.

## Open Questions

- **Servicio AWS**: ¿API Gateway WebSocket API + Lambda vs. AppSync (Subscriptions)? Decidir en `/kaipos.plan` con base en costo, complejidad de auth custom y ergonomía del cliente.
- **Almacén de conexiones**: ¿nueva colección Mongo `wsConnections` (coherente con el resto del stack) o DynamoDB (más idiomático para API GW WebSocket + TTL nativo)? Impacto en costo y operaciones.
- **OrderStatus para el demo**: el tipo actual es `'pending' | 'completed' | 'cancelled' | 'refunded'` — sin estados intermedios de cocina. ¿El evento de prueba usa `pending → completed` tal cual, o expandimos `OrderStatus` en este ticket? Recomendación: mantener los estados actuales y documentar que los estados de cocina son un ticket posterior.
- **Formato de mensaje**: envelope exacto (`{ type, channel, payload, v }` u otro), estrategia de versionado y contrato compartido en `@kaipos/shared`. Decidir en plan.
- **Reverse fan-out**: al publicar a un canal, ¿el backend itera `connectionIds` y llama `PostToConnection` en paralelo, o usa un mecanismo de fan-out (SNS/EventBridge)? Decidir en plan según volumen esperado.
- **CloudFront y WSS**: confirmar si `/api/*` de CloudFront va a proxear también el WSS o si el cliente se conecta al endpoint WSS directo (con CORS/origen manejado vía shared-secret y TLS).

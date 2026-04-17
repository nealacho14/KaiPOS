# Follow-up Tasks

Source: `.specs/NT-33618b91_websocket-realtime/`

<!-- Items surfaced during planning that are out of scope here. -->

- [ ] Expandir `OrderStatus` con estados de cocina (`in_kitchen`, `ready`, `served`) — el demo actual usa la transición `pending → completed`; un KDS real necesita estados intermedios.
- [ ] Ruta de login + UI en `frontend-admin` que pueble `auth-storage.ts` con el JWT. Este ticket agrega el helper mínimo; el flujo completo de auth UI vive fuera.
- [ ] Extraer el bootstrap compartido entre `functions/api.ts` y los 3 handlers de WS a `src/lib/lambda-runtime.ts` (logger con `requestId`, carga de secretos, inicialización de Mongo). Hoy se duplicará levemente; unificar tras este ticket.
- [ ] Unificar la verificación de origen entre HTTP y WS en un helper compartido — hoy `middleware/origin-verify.ts` lee `process.env` directo; tras este ticket habrá un `ws-auth.ts` con lógica similar.
- [ ] Presencia / "quién está conectado" por sucursal — la tabla DDB lo habilita pero no se construye un endpoint/UI para ello.
- [ ] Proxyar el WSS a través de CloudFront para mantener single-origin (hoy el cliente se conecta a `wss://<api-gw>.execute-api...` directamente). Requiere habilitar WebSocket en la distribución y custom domain.
- [ ] Replay / cola de mensajes perdidos para clientes que estuvieron offline — el broadcast actual es best-effort con entrega at-most-once.
- [ ] Web push notifications (distinto de WS) para cocina/meseros cuando la app no está en foco.
- [ ] Rate limiting por conexión más allá de los defaults de API Gateway WebSocket.
- [ ] Integración real con KDS, app de meseros y app de clientes (este ticket sólo deja la infra + una página debug).

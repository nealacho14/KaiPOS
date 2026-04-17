# Follow-up Tasks

Source: `.specs/NT-33618b91_websocket-realtime/`

<!-- Items surfaced during planning that are out of scope here. -->

- [x] Extraer el bootstrap compartido entre `functions/api.ts` y los 3 handlers de WS a `src/lib/lambda-runtime.ts` (logger con `requestId`, carga de secretos, inicialización de Mongo). Hoy se duplicará levemente; unificar tras este ticket.
- [x] Unificar la verificación de origen entre HTTP y WS en un helper compartido — hoy `middleware/origin-verify.ts` lee `process.env` directo; tras este ticket habrá un `ws-auth.ts` con lógica similar.

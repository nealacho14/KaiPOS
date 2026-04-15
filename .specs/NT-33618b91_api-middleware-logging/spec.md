# Spec: API Middleware y Logging Estructurado

| Field         | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd81159435fbf4afcfae0b) |
| Status        | In Progress                                                       |
| Priority      | Alta                                                              |
| Branch        | `NT-33618b91/api-middleware-logging/feature`                      |
| Created       | 2026-04-14                                                        |

## Context

KaiPOS ticket KAI-5 ("API Gateway y Funciones Serverless Base") fue parcialmente implementado en un sprint anterior. Lo que ya existe: health check endpoint (`GET /api/health`) funcionando en Lambda y Hono con verificación de conectividad a MongoDB, CORS configurado en Hono (`app.use('/*', cors())`), proxy en Vite para desarrollo local, y CloudFront proxying `/api/*` en producción. La estructura base de funciones serverless está preparada en `apps/backend/src/functions/` con tsup como bundler.

Sin embargo, la capa de middleware que hace a la API robusta y operable en producción no fue implementada. Actualmente: no hay validación de requests (ninguna librería de schemas instalada), no hay manejo de errores global (errores no controlados pueden filtrar stack traces), y el logging es solo `console.log` sin estructura ni contexto de request. Además, el API Gateway en CDK solo tiene una ruta hardcoded (`GET /api/health`), requiriendo modificar la infraestructura por cada endpoint nuevo.

Este trabajo completa los requerimientos pendientes de KAI-5 y sienta las bases para que todos los endpoints futuros (CRUD de productos, ordenes, etc.) hereden validación, error handling y logging de forma consistente.

## Requirements

- Instalar Zod como librería de validación de schemas en el backend
- Crear un middleware reutilizable para Hono que valide body, params y query contra schemas Zod
- Crear un wrapper equivalente para Lambda handlers que aplique validación de schemas antes de ejecutar el handler
- Los errores de validación deben retornar HTTP 400 con detalle descriptivo de los campos que fallaron (campo, mensaje esperado, valor recibido)
- Crear un error handler global en Hono (`app.onError`) que capture excepciones no controladas y retorne HTTP 500 con mensaje genérico sin exponer detalles internos (stack traces, mensajes de DB, credenciales)
- Crear un wrapper para Lambda handlers que capture excepciones y retorne respuestas 500 consistentes
- Definir un formato de respuesta de error consistente para toda la API (tanto 400 como 500)
- Instalar Pino como logger estructurado (optimizado para Lambda con bajo overhead)
- Crear un logger factory que inyecte contexto por request: requestId, timestamp, servicio
- Crear middleware en Hono que registre automáticamente por cada request: request ID, timestamp de inicio/fin, duración en ms, status code, method y path — todo en formato JSON estructurado
- Integrar el logger en los Lambda handlers existentes (health) reemplazando `console.log`/`console.error`
- Reemplazar `console.log` en `db/client.ts` por el logger estructurado
- Configurar el API Gateway en CDK con un patrón catch-all (`ANY /api/{proxy+}`) que enrute a una Lambda única, para que nuevos endpoints no requieran cambios en CDK

## Acceptance Criteria

- [ ] Payload inválido a cualquier endpoint retorna HTTP 400 con detalle descriptivo de los campos que fallaron
- [ ] Errores no controlados (throw, promesas rechazadas) retornan HTTP 500 con mensaje genérico, sin stack traces ni detalles internos en el body de la respuesta
- [ ] Cada request genera logs en formato JSON que incluyen: requestId, timestamp, duración (ms) y status code
- [ ] El health check endpoint (`GET /api/health`) sigue retornando 200 con estado de la DB (regresión)
- [ ] El API Gateway en CDK usa un patrón proxy catch-all para que nuevos endpoints en Hono/Lambda no requieran cambios de infraestructura
- [ ] No hay `console.log` ni `console.error` directo en el código del backend — todo pasa por el logger estructurado

## Out of Scope

- Endpoints CRUD para productos, ordenes, usuarios u otras entidades — solo la infraestructura de middleware
- Autenticación o autorización de requests
- Rate limiting o throttling
- Tracing distribuido (X-Ray, OpenTelemetry) — solo logging estructurado por ahora
- Alertas o dashboards de monitoreo en CloudWatch
- Cambios al frontend

## Open Questions

- Ninguna en este momento — el alcance está bien definido por los requerimientos pendientes del ticket KAI-5.

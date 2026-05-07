# Spec: Paso 12 — Tests End-to-End y Validación de la Fase 1

| Field         | Value                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd81dcbfb6f67fe32c942d)      |
| Status        | In Progress                                                            |
| Priority      | Alta                                                                   |
| Branch        | `NT-33618b91/phase-1-e2e-validation/feature`                           |
| Created       | 2026-05-06                                                             |

## Context

Cierre de la Fase 1 (Fundación e Infraestructura). A lo largo del Sprint 1–3 se construyeron las piezas centrales del backend y del admin: autenticación con JWT (login/refresh/logout), RBAC con `Permission` + `hasPermission`, multi-tenancy por `businessId` (con el sentinel `*` para super_admin), CRUD de productos, WebSocket sobre API Gateway con canales `user/business/branch`, y monitoring básico. Cada pieza tiene su propia cobertura de tests unitarios con Vitest (≈30 archivos `*.test.ts` en backend y shared), pero **no existe una suite que valide el flujo extremo a extremo ni que demuestre que las piezas funcionan integradas**.

Este ticket es el sello de fase: añadir suites E2E que ejerzan las rutas reales contra Mongo de verdad (no mocks), un test de integración para WebSocket, documentación OpenAPI accesible para que el equipo y los consumidores puedan inspeccionar el contrato de la API, y un script de setup que permita a un dev nuevo pasar de `git clone` a entorno funcional con un comando.

Hallazgos del repo que condicionan el alcance:

- Vitest ya está configurado por workspace; el patrón de tests está establecido (colocados, naming `*.test.ts`).
- El backend Hono valida cada ruta con Zod por middleware; eso lo hace compatible con generación de OpenAPI desde los esquemas existentes (no hay que reescribir validación).
- No existe configuración de Playwright en el repo; el `.playwright-mcp/` que aparece son artefactos de inspección manual, no infraestructura del proyecto.
- CI (`.github/workflows/ci.yml`) corre `format:check → lint → typecheck → build → test` en cada PR. Hay que decidir si las E2E entran en el job `Test` o en uno separado con servicios Docker.
- `pnpm docker:up` ya levanta Mongo + MinIO + backend + frontend-admin; `db:setup` y `db:seed` existen pero hay que invocarlos manualmente. El "setup script" puede ser un wrapper delgado.

## Requirements

- **Suite E2E de auth** que ejercite el ciclo completo: registro (donde aplique), login con credenciales válidas/invalidas, refresh de access token, logout, y validación de que tokens revocados/expirados son rechazados.
- **Suite E2E de RBAC** que verifique, para cada rol definido en `ROLE_PERMISSIONS`, que las rutas protegidas devuelven 200/403 según el `Permission` requerido. Incluye validación del caso super_admin con `businessId === '*'`.
- **Suite E2E del CRUD de productos** que cubra crear, listar, leer-por-id, editar y eliminar, ejecutado por un usuario con permisos suficientes. La suite debe correr contra una base de datos real (Mongo local o contenedor), no mocks.
- **Suite E2E de aislamiento multi-tenant**: un usuario del negocio A no puede ver, modificar ni eliminar recursos del negocio B en ninguna de las rutas tenant-scoped (productos, categorías, branches, kitchen-stations, orders, users de otro business).
- **Suite de integración de WebSocket**: handshake con JWT válido vs inválido, suscripción a canal permitido, rechazo de suscripción a canal no permitido por `canSubscribeTo`, y recepción de un mensaje publicado vía `publishToChannel`.
- **Documentación OpenAPI** generada desde los esquemas Zod existentes y accesible desde el backend cuando corre localmente (route servida o archivo exportable bajo control de versiones — la decisión final es de la fase de planning, este spec sólo exige que sea accesible).
- **Script de setup local** que, partiendo de un clone limpio, deje al dev con servicios arriba, base configurada y datos de demo cargados, **con un solo comando**.
- **Integración con CI**: las nuevas suites E2E deben ejecutarse en el pipeline antes de cada merge a `main`.

## Acceptance Criteria

- [ ] Las suites E2E cubren auth, RBAC, CRUD de productos, multi-tenant y WebSocket, y pasan en CI sobre cada PR.
- [ ] El tiempo total de la suite E2E (incluyendo setup de fixtures y teardown) es **< 3 minutos** en GitHub Actions.
- [ ] Existe documentación OpenAPI/Swagger accesible (vía endpoint en el backend local o archivo `openapi.json`/`openapi.yaml` en el repo) y se mantiene consistente con los esquemas Zod en uso.
- [ ] Un dev nuevo, partiendo de un clone limpio, levanta el entorno completo (servicios + DB lista + datos de demo) ejecutando **un único comando** documentado en el README.
- [ ] El job de CI ejecuta las E2E como prerrequisito de merge; un fallo bloquea el merge.
- [ ] Las suites E2E corren contra una base de datos real (no mocks) y dejan el estado limpio entre tests (cada test es independiente y reproducible al ejecutarse en cualquier orden).

## Out of Scope

- **Tests de carga / performance.** Eliminados explícitamente del ticket Notion. No se va a medir p95/p99, ni a fijar SLA de latencia, ni a correr `autocannon`/`k6` en CI.
- **Tests E2E browser-driven a través de Playwright** sobre el frontend admin, salvo que la decisión de planning lo justifique. El default es API-level (HTTP contra Hono), porque la cobertura del SPA ya se trata por unit tests con Vitest.
- **Refactor de tests unitarios existentes.** Los `*.test.ts` actuales se quedan como están; las E2E se añaden, no reemplazan.
- **Migrar CI a un nuevo provider o reescribir el pipeline existente.** Sólo se añaden los pasos necesarios para correr las E2E sobre la infraestructura actual.
- **Nuevos endpoints o cambios funcionales** en auth/RBAC/productos/WS. Si una E2E descubre un bug, se levanta como ticket aparte.
- **Tests del flujo de password reset por email** (SES) — fuera del alcance acordado para Fase 1.
- **Cobertura E2E de orders, categories, businesses, branches, kitchen-stations, users** más allá de lo estrictamente necesario para validar RBAC y multi-tenant. Productos es el único CRUD con cobertura E2E completa en este ticket.

## Open Questions

- **Definición de "E2E"**: ¿API-level (HTTP request → Hono → Mongo real) o browser-level (Playwright contra el SPA)? El default propuesto es API-level por simplicidad y velocidad; confirmar en planning.
- **Forma de la documentación OpenAPI**: ¿endpoint `/docs` servido por el backend (Swagger UI), archivo `openapi.json` versionado en repo, o ambos? Afecta dependencias y si requiere cambios al middleware de validación.
- **Estrategia de fixtures / aislamiento entre tests**: ¿base de datos efímera por test suite, transacciones rolled-back, o limpieza por colección? El driver es MongoDB nativo (sin sesiones implícitas), lo cual condiciona la opción.
- **Dónde corre la E2E en CI**: ¿en el job `quality` actual con servicios Docker añadidos, o en un job separado en paralelo? Afecta tiempo total del pipeline y complejidad de configuración.
- **Cómo se garantiza el budget de < 3 minutos**: ¿paralelización de suites por dominio, fixtures compartidas, o solo midiendo y ajustando? Validar al final de la implementación con dato real, no solo estimación.
- **Wrapper del script de setup**: ¿un archivo `scripts/setup.sh` invocado por `pnpm setup`, o un script de pnpm puro encadenando `docker:up && db:setup && db:seed`? Trade-off entre portabilidad y simplicidad.

# Spec: Paso 7: Sistema de Roles y Permisos (RBAC)

| Field         | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd812ea17bea220512046f) |
| Status        | In Progress                                                       |
| Priority      | Alta                                                              |
| Branch        | `NT-33618b91/rbac-permissions/feature`                            |
| Created       | 2026-04-16                                                        |

## Context

La plataforma ya tiene autenticación completa (login/register/refresh/logout/forgot-password/reset-password), JWT con payload `{ userId, businessId, role }`, middleware `requireAuth()`, aislamiento multi-tenant en Mongo (`businessId` obligatorio en todas las colecciones), y un servicio de auditoría con TTL de 90 días. Falta la capa de autorización: los endpoints autenticados no distinguen aún qué roles pueden hacer qué acciones.

Este ticket introduce RBAC (control de acceso basado en roles) con permisos granulares `recurso:accion`, resueltos por request desde un mapa en código (`role → Permission[]`). El primer set de endpoints que consumirán la nueva capa son los CRUD de usuarios del negocio (`/api/users`), que sirven además como caso de prueba de aislamiento multi-tenant y de la experiencia `super_admin`.

Las decisiones técnicas clave ya están acordadas en el ticket de Notion:

- Roles en inglés en código; etiquetas en español solo en UI.
- Permisos derivados del rol, no embebidos en el JWT (cambios de política no requieren rotar tokens).
- `super_admin` cross-tenant se modela con `businessId = "*"` y bypass explícito.
- El rol `cliente` queda fuera de scope (pertenece a una app pública futura).
- Las denegaciones se auditan con una nueva acción `authorization_failed`.

## Requirements

**Roles (código, en inglés):** `super_admin`, `admin`, `manager`, `supervisor`, `cashier`, `waiter`, `kitchen`.

**Permisos iniciales (formato `recurso:accion`):**

- `products:read`, `products:write`, `products:delete`
- `orders:create`, `orders:read`, `orders:update`, `orders:cancel`
- `users:read`, `users:write`, `users:delete`
- `reports:view`
- `business:manage`, `branches:manage`
- `platform:manage` (exclusivo de `super_admin`)

**Mapa rol → permisos (borrador del ticket; a confirmar en la fase de plan):**

- `super_admin`: todos los permisos + `platform:manage`; bypass de aislamiento por `businessId`.
- `admin`: todos los permisos de su negocio excepto `platform:manage`.
- `manager`: `products:read/write`, `orders:read/update/cancel`, `users:read`, `reports:view`.
- `supervisor`: `products:read`, `orders:read/update/cancel`, `reports:view`.
- `cashier`: `products:read`, `orders:create/read/update`.
- `waiter`: `products:read`, `orders:create/read`.
- `kitchen`: `orders:read/update` (restringido a cambios de estado — se formaliza cuando existan los endpoints de órdenes).

**Componentes técnicos a entregar:**

- Definición de permisos y mapa rol→permisos en `apps/backend/src/lib/permissions.ts` (tipos + helper `hasPermission(role, permission)`).
- Middleware `requirePermission(permission)` en `apps/backend/src/middleware/authorize.ts`, siguiendo el patrón de `middleware/branch-access.ts`, con bypass explícito para `super_admin`.
- Ampliación del tipo `UserRole` en `packages/shared/src/types/index.ts` con los 7 roles.
- Ampliación del `$jsonSchema` del colección `users` en `apps/backend/src/db/setup.ts` para aceptar los nuevos valores de rol.
- Nueva acción `authorization_failed` en `AuditAction` (shared types) y emisión desde el middleware al devolver 403, con `metadata: { permission, route, method }`.
- Endpoints CRUD `/api/users` en `apps/backend/src/routes/users.ts` (`GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`) con aislamiento automático por `businessId` (excepto `super_admin`), protegidos por `users:read / users:write / users:delete` según corresponda; responden `404` ante recursos de otro negocio para no filtrar existencia.
- Wiring de la nueva ruta en `apps/backend/src/app.ts`.
- Compatibilidad del seed tras ampliar el enum: `admin@lacocinadekai.com` y `cajero@lacocinadekai.com` deben seguir funcionando.
- Tests unitarios del middleware (todos los roles × todos los permisos, edge cases) y de los endpoints CRUD.
- Actualizar `CLAUDE.md` removiendo la línea "No test files exist in the backend yet" (ya desactualizada).

## Acceptance Criteria

**En scope de este ticket (validables ahora):**

- [ ] Una request sin token a un endpoint protegido por `requirePermission` recibe `401`.
- [ ] Una request con token válido pero sin el permiso requerido recibe `403` y genera un evento `authorization_failed` con `metadata.permission`, `metadata.route`, `metadata.method`.
- [ ] Un `admin` puede listar, crear, modificar y desactivar usuarios de su negocio vía `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id`.
- [ ] Un `admin` no puede ver ni modificar usuarios de otro negocio — el endpoint responde `404` (no `403`) para no filtrar existencia.
- [ ] Un `cashier` autenticado recibe `403` al pegarle a `GET /api/users` y se registra `authorization_failed`.
- [ ] Un `super_admin` con `businessId = "*"` puede listar usuarios de cualquier negocio; `GET /api/users?businessId=<id>` filtra por ese negocio cuando se provee.
- [ ] El seed (`pnpm --filter @kaipos/backend db:seed`) sigue corriendo tras ampliar el enum en el `$jsonSchema`.
- [ ] Cobertura de tests del middleware `requirePermission` ≥ 90% líneas.
- [ ] `CLAUDE.md` ya no contiene la línea obsoleta sobre tests inexistentes.

**Diferidos a tickets posteriores** (dependen de endpoints aún no creados):

- [ ] Un `cashier` no puede pegarle a los endpoints de administración de productos → se valida en el ticket que cree `POST/PATCH/DELETE /products`.
- [ ] Un `waiter` puede crear órdenes pero no eliminar productos → se valida en el ticket que cree `POST /orders` y `DELETE /products/:id`.

## Out of Scope

- Endpoints CRUD de productos y órdenes (viven en tickets distintos del Sprint).
- UI de login/gestión de usuarios en `apps/frontend-admin` (frontend aún no tiene pantalla de auth).
- Rol `cliente` / clientes finales (pertenece a una futura app pública).
- Embebido de permisos en el JWT, permisos por usuario, o permisos almacenados en DB (decisión explícita: mapa en código).
- UI de administración de `super_admin` (cross-tenant). El bypass es funcional en API; la superficie admin se trata en otro ticket.
- Rate limiting específico para `/api/users` (se confía en el rate limiter global existente).

## Open Questions

- **Mapa rol→permisos**: el borrador del ticket es el punto de partida; se confirma o ajusta en la fase `/kaipos.plan` (por ejemplo, si `manager` debe tener `users:write` para crear cajeros, o si debe limitarse a `users:read` como en el borrador).
- **`POST /api/users` vs `POST /auth/register`**: `register` ya existe y es self-serve. El nuevo `POST /api/users` es la vía autenticada para que un `admin` cree empleados. ¿Conservamos ambos endpoints en paralelo o `register` queda deprecado/limitado? Resolver en el plan.
- **`DELETE /api/users/:id` — hard delete vs soft delete**: la semántica razonable es soft-delete vía `isActive = false` (consistente con `login` que ya valida `isActive`). Confirmar en plan.
- **Estructura del filtro `super_admin`**: confirmar en plan si el parámetro para listar en otro tenant es `?businessId=...` en query o un header dedicado (p. ej. `X-Acting-Business-Id`).
- **Formato del campo `permission` en logs de denegación**: string plano (`"users:read"`) vs estructurado (`{ resource, action }`). Borrador: string plano para simplificar consultas.

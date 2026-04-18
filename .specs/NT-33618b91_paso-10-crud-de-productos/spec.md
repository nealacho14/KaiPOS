# Spec: Paso 10: CRUD de Productos (Primer Feature E2E)

| Field         | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd81ec8013f6156d9b275f) |
| Status        | In Progress                                                       |
| Priority      | Alta                                                              |
| Branch        | `NT-33618b91/paso-10-crud-de-productos/feature`                   |
| Created       | 2026-04-17                                                        |

## Context

Primer feature end-to-end de la plataforma KaiPOS sobre la fundación ya instalada (Hono + Zod + Mongo + RBAC + shell admin). El objetivo es validar que el stack completo funciona — frontend → API → DB → UI — implementando la gestión de productos, que es el caso de uso más simple y representativo del dominio POS.

La fundación ya provee todo lo necesario: el tipo `Product` existe en `@kaipos/shared/types`, la colección `products` ya tiene su validador `$jsonSchema` e índices (`{businessId, sku}` único; `{businessId, category, isActive}`) en `apps/backend/src/db/setup.ts`, y los permisos `products:read`, `products:write`, `products:delete` ya están mapeados a los roles correctos en `@kaipos/shared/permissions`. No hay decisiones nuevas de RBAC ni de modelado de datos — sólo conectar las piezas siguiendo los patrones de `users`, `orders` y `kitchen-stations`.

## Requirements

### API (`apps/backend`)

- Endpoints `GET / POST / PATCH / DELETE /api/products` siguiendo el mismo patrón que `routes/users.ts` (Hono + `requireAuth()` + `requirePermission(...)` + `validate({...})` + capa de servicio).
- `GET /api/products`: lista con búsqueda `q` (case-insensitive sobre `name` o `sku`) y filtro opcional `category`. Por defecto excluye inactivos; `includeInactive=true` los incluye. Sin paginación (todos los matches en una respuesta).
- `POST /api/products`: crear. Devuelve 201.
- `PATCH /api/products/:id`: editar (no `PUT`, alineado con `PATCH /api/users/:id`).
- `DELETE /api/products/:id`: soft delete (setear `isActive: false`, paralelo a `deactivateUser`).
- Aislamiento multi-tenant por `businessId`. Cross-tenant reads devuelven **404** (no 403) — patrón de `services/users.ts`.
- `super_admin` puede operar cross-tenant aceptando un `businessId` query/body, igual que en users.
- SKU duplicado dentro del mismo `businessId` devuelve **409** (honrando el índice único existente).
- Logs estructurados con Pino (`createLogger({ module: 'products-service' })`). Sin `console.log`.
- Archivos a crear:
  - `apps/backend/src/schemas/products.ts` — Zod (create / update / list-query / id-param).
  - `apps/backend/src/services/products.ts` — lógica de negocio + scope por `businessId`.
  - `apps/backend/src/routes/products.ts` — Hono router.
  - Registrar el router en `apps/backend/src/app.ts`.

### Datos (`packages/shared` + `apps/backend/src/db`)

- Agregar campo nuevo **`imageUrl?: string`** al tipo `Product` en `packages/shared/src/types/index.ts` y al validador `$jsonSchema` de `products` en `apps/backend/src/db/setup.ts`. Opcional para no romper datos existentes ni el seed.
- Conservar `stock` y `category` (string con el nombre, no FK a `categories._id`).
- No actualizar `seed.ts`: los productos demo siguen sin `imageUrl`.

### RBAC

- Read → `requirePermission('products:read')`.
- Create / edit → `requirePermission('products:write')`.
- Delete (soft) → `requirePermission('products:delete')`.
- Siempre `hasPermission()` / `requirePermission()`. Nunca `role === '...'` para autorización (única excepción: scoping por `SUPER_ADMIN_BUSINESS_ID`, como en `services/users.ts`).
- Las denegaciones ya generan audit log `authorization_failed` automáticamente vía el middleware existente — no replicar.

### Frontend (`apps/frontend-admin`)

- Página `/products` (`src/pages/ProductsListPage.tsx`):
  - Tabla con columnas nombre, SKU, categoría, precio, estado.
  - Búsqueda por nombre/SKU con input debounced → query `q`.
  - Filtro por categoría.
  - Estados loading / error / empty / success siguiendo el patrón de `UsersListPage.tsx` (`Skeleton` + `Alert` + `EmptyState`).
- Formulario crear/editar como **modal/dialog** sobre la lista (no ruta separada), con validación cliente.
- Gatear la ruta en `App.tsx`: `<RequirePermission permission="products:read">`.
- Item de `Sidebar` gateado con `hasPermission(user.role, 'products:read')`.
- Botones crear/editar visibles sólo si `hasPermission(user.role, 'products:write')`; eliminar sólo si `hasPermission(user.role, 'products:delete')`.
- Sólo `@kaipos/ui` (componentes e íconos). Verificable con `rg "from '@mui/material" apps/frontend-admin/src` → 0 matches.
- Usar `apiJson` de `src/lib/api.ts`. Mensajes de error en español, mapeados como `UsersListPage.tsx::mapError`.

### Tests

- Vitest para service y rutas (patrón de `routes/users.test.ts` + `services/users.test.ts`).
- Cubrir: aislamiento multi-tenant, denial 403 + audit log por permiso insuficiente, soft delete, búsqueda por nombre/SKU, filtro por categoría, SKU duplicado (409), `super_admin` operando cross-tenant vía `businessId`.

## Acceptance Criteria

- [ ] Admin crea un producto y aparece en la lista inmediatamente.
- [ ] Admin edita el precio y el cambio se persiste.
- [ ] Admin elimina un producto (soft delete → `isActive: false`); por defecto desaparece del listado y reaparece con `includeInactive=true`.
- [ ] Cajero ve productos pero **no** ve botones de crear/editar/eliminar; los endpoints de mutación le devuelven 403 con audit log `authorization_failed`.
- [ ] Manager puede crear/editar pero **no** eliminar (sólo admin tiene `products:delete`).
- [ ] Productos del negocio A no aparecen para el negocio B (404 al leer por id cross-tenant).
- [ ] Búsqueda funciona por nombre y SKU (case-insensitive).
- [ ] Filtro por categoría funciona.
- [ ] Tipo `Product` y validador `$jsonSchema` incluyen `imageUrl?: string`.
- [ ] SKU duplicado dentro del mismo `businessId` devuelve 409 (honra el índice único existente).
- [ ] Sin imports de `@mui/material/*` ni `lucide-react` en `apps/frontend-admin/src`.
- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm --filter @kaipos/backend test` pasan.

## Out of Scope

- Paginación del endpoint `GET /api/products` (todos los matches en una respuesta).
- Migración de `category` de string a FK a `categories._id` (queda como string en Paso 10).
- Subida real de imágenes a S3 / `AssetsStack`. `imageUrl` es sólo un string en el modelo; el UI puede aceptarlo como input pero no se gestiona el upload en este paso.
- Página/ruta separada para crear/editar (se hace todo en modal sobre `/products`).
- WebSocket fan-out de eventos `product.*` (este feature es CRUD plano; los productos no necesitan tiempo real para Paso 10).
- Actualizar `seed.ts` para poblar `imageUrl` en los productos demo.
- Cambios en RBAC (los permisos ya existen y están mapeados correctamente).

## Open Questions

- Ninguna pendiente. Las decisiones abiertas (modal vs. ruta, paginación, seed) se resolvieron en la entrevista previa al spec.

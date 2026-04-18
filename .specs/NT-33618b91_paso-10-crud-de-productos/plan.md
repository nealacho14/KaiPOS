# Plan: Paso 10 — CRUD de Productos (Primer Feature E2E)

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Notion Ticket  | [NT-33618b91](https://notion.so/33618b913fdd81ec8013f6156d9b275f) |
| Spec           | `.specs/NT-33618b91_paso-10-crud-de-productos/spec.md`            |
| Feature Branch | `NT-33618b91/paso-10-crud-de-productos/feature`                   |
| Target         | `main`                                                            |

<!-- Multi-phase sequential plan. Phase 1 targets the feature branch;
     Phase 2 targets Phase 1. Use `/kaipos.implement` one phase at a time. -->

## Phase 1: Backend CRUD + datos

**Branch**: `NT-33618b91/paso-10-crud-de-productos/backend-crud`
**Targets**: `NT-33618b91/paso-10-crud-de-productos/feature`

### Tasks

#### 1. Tipo compartido + validador DB

- [x] `packages/shared/src/types/index.ts` — agregar `imageUrl?: string` a `interface Product` (después de `stock`, antes de `isActive`).
- [x] `apps/backend/src/db/setup.ts` — en el bloque `products`, agregar `imageUrl: { bsonType: 'string' }` a `properties` (NO lo agregues a `required`). El array `required` se mantiene igual, sólo cambia `properties`.
- [x] No tocar `apps/backend/src/db/seed.ts` (los productos demo siguen sin `imageUrl`, y el validador lo acepta por ser opcional).

#### 2. Schemas Zod — `apps/backend/src/schemas/products.ts` (nuevo)

- [x] `createProductSchema`: `name: z.string().min(1)`, `description: z.string()` (permite vacío para igualar el validador), `price: z.number().nonnegative()`, `category: z.string().min(1)`, `sku: z.string().min(1)`, `stock: z.number().int().nonnegative()`, `imageUrl: z.string().url().optional()`, `businessId: z.string().min(1).optional()` (sólo super_admin lo usa, igual que en `users`).
- [x] `updateProductSchema`: versión `.partial()` de los campos de dominio **sin** `businessId` + `isActive: z.boolean().optional()`, con `.refine(...)` de "at least one field is required" (idéntico al patrón de `updateUserSchema`).
- [x] `listProductsQuerySchema`: `q: z.string().min(1).optional()`, `category: z.string().min(1).optional()`, `includeInactive: z.enum(['true', 'false']).optional()` (query strings llegan como string), `businessId: z.string().min(1).optional()`.
- [x] `productIdParamSchema`: `z.object({ id: z.string().uuid() })`.
- [x] Exportar tipos `CreateProductInput`, `UpdateProductInput`, `ListProductsQuery` con `z.infer<typeof ...>`.

#### 3. Service — `apps/backend/src/services/products.ts` (nuevo)

- [x] `const log = createLogger({ module: 'products-service' })`. Sin `console.log`.
- [x] `buildScopeFilter(actor, query?)` — si `actor.role === 'super_admin'`, devolver `query?.businessId ? { businessId: query.businessId } : {}`; si no, `{ businessId: actor.businessId }`. Copiar el patrón exacto de `services/users.ts`.
- [x] `resolveTargetBusinessId(actor, requested)` — idéntico al de `users.ts`: super_admin requiere `requested` (400 `MISSING_TARGET_BUSINESS_ID`), rechaza sentinel `'*'` (400 `INVALID_TARGET_BUSINESS_ID`), no-super_admin devuelve `actor.businessId`.
- [x] `listProducts(actor, query)`:
  - Filtro base: `buildScopeFilter(actor, query)` + `isActive: true` por defecto, removido si `query.includeInactive === 'true'`.
  - Si `query.category`: agregar `category: query.category` (match exacto, sin regex — los valores demo son strings tipo `'Entradas'`).
  - Si `query.q`: regex case-insensitive contra `name` O `sku`: `$or: [{ name: { $regex: q, $options: 'i' } }, { sku: { $regex: q, $options: 'i' } }]`. **Escapar** `q` con un helper `escapeRegex` (inline o en `src/lib/regex.ts`) para que caracteres como `.` o `*` no rompan la consulta.
  - Devolver `.find(filter).toArray()`. Sin paginación.
- [x] `getProductById(actor, id)` — `findOne({ _id: id, ...buildScopeFilter(actor) })`; si null → `NotFoundError('Product')`.
- [x] `createProduct(actor, data, context)`:
  - `targetBusinessId = resolveTargetBusinessId(actor, data.businessId)`.
  - Check de SKU duplicado: `findOne({ businessId: targetBusinessId, sku: data.sku })` → si existe, `throw new AppError('A product with this SKU already exists', 409, 'DUPLICATE_SKU')`. Este check preserva el mensaje aún si el driver rechaza por el índice único en un race condition.
  - Armar `Product` con `_id: crypto.randomUUID()`, `isActive: true`, `createdAt/updatedAt: new Date()`, `createdBy: actor.userId`, y `imageUrl` sólo si vino definido (spread condicional como en `createOrder`).
  - `insertOne(newProduct)` — **envolver en try/catch** para mapear MongoServerError code 11000 (duplicate key) a `AppError 409 DUPLICATE_SKU` por si dos requests concurrentes pasan el pre-check.
  - `log.info(...)` + devolver el producto.
- [x] `updateProduct(actor, id, patch, context)`:
  - `findOne` con scope; si null → `NotFoundError('Product')`.
  - Armar `$set` sólo con los campos presentes en `patch` (whitelist explícita: `name`, `description`, `price`, `category`, `sku`, `stock`, `imageUrl`, `isActive`) + `updatedAt: new Date()`. **Nunca** mezclar `patch` con spread para evitar que campos prohibidos (`_id`, `businessId`, `createdAt`, `createdBy`) lleguen al `$set`.
  - Si `patch.sku` y `patch.sku !== existing.sku`: pre-check contra otro producto con ese SKU en el mismo business → 409 `DUPLICATE_SKU`. Mismo try/catch sobre `updateOne` para mapear E11000 a 409.
  - `updateOne({ _id }, { $set })` y devolver `findOne({ _id })` refrescado.
- [x] `softDeleteProduct(actor, id, context)` — paralelo a `deactivateUser`:
  - `findOne` con scope; si null → `NotFoundError('Product')`.
  - Si `existing.isActive === true`: `updateOne({ _id }, { $set: { isActive: false, updatedAt: new Date() } })`. Idempotente (no-op si ya está inactivo).
  - Devolver producto refrescado.
- [x] Las denegaciones de `requirePermission` ya generan audit log `authorization_failed` automáticamente — **no** replicar.

#### 4. Router — `apps/backend/src/routes/products.ts` (nuevo)

- [x] Copiar la forma exacta de `routes/users.ts`:
  - `GET /api/products` — `requireAuth()` + `requirePermission('products:read')` + `validate({ query: listProductsQuerySchema })` → `listProducts`.
  - `GET /api/products/:id` — `requireAuth()` + `requirePermission('products:read')` + `validate({ params: productIdParamSchema })` → `getProductById`.
  - `POST /api/products` — `requireAuth()` + `requirePermission('products:write')` + `validate({ body: createProductSchema })` → `createProduct`; responde `201`.
  - `PATCH /api/products/:id` — `requireAuth()` + `requirePermission('products:write')` + `validate({ params, body: updateProductSchema })` → `updateProduct`.
  - `DELETE /api/products/:id` — `requireAuth()` + `requirePermission('products:delete')` + `validate({ params })` → `softDeleteProduct`; responde `200` con el producto desactivado.
- [x] Pasar `{ route: c.req.path, method: c.req.method }` como `context` a create/update/softDelete (mantener firma uniforme con `users.ts` aunque hoy no se use — el audit middleware ya log-ea la denegación).
- [x] `export default products`.

#### 5. Registrar router

- [x] `apps/backend/src/app.ts` — importar `productsRoutes` y agregar `app.route('/', productsRoutes)` junto a los demás.

#### 6. Tests

- [x] `apps/backend/src/services/products.test.ts` — patrón de `services/users.test.ts`. Mockear `getProductsCollection`, `createLogger`, `./audit.js`. Cubrir:
  - `listProducts`: scope por `actor.businessId`; super_admin sin filter; super_admin con `businessId`; `includeInactive=false` (default) excluye inactivos; `q` genera `$or` name/sku case-insensitive; `category` filtra por match exacto; caracter regex (`.`, `*`) en `q` no rompe la búsqueda (verifica que se escapa).
  - `getProductById`: scope match; cross-tenant → `NotFoundError`; super_admin sin restricción.
  - `createProduct`: crea en `actor.businessId`; `DUPLICATE_SKU` 409 en pre-check; E11000 del driver mapea a 409; super_admin necesita `businessId`; sentinel `'*'` rechazado; no-super_admin ignora `body.businessId`; `imageUrl` opcional persiste cuando se envía, ausente cuando no.
  - `updateProduct`: sólo aplica campos whitelisted (`_id`/`businessId`/`createdAt`/`createdBy` nunca en `$set`); cross-tenant → `NotFoundError`; cambio de SKU a uno ya tomado → 409; sin cambio de SKU, el pre-check no se dispara.
  - `softDeleteProduct`: cross-tenant → `NotFoundError`; idempotente si ya inactivo (no llama `updateOne`); transición `true→false` sí llama `updateOne`.
- [x] `apps/backend/src/routes/products.test.ts` — patrón de `routes/users.test.ts`. Mockear `../lib/jwt.js`, `../services/products.js`, `../services/audit.js`, `../lib/logger.js`. Cubrir:
  - `GET /api/products` sin token → 401; admin → 200; cashier → 200 (tiene `products:read`); kitchen → 403 + audit `authorization_failed { permission: 'products:read' }`; super_admin con `?businessId=` propaga el query.
  - `GET /api/products/:id` con uuid inválido → 400; cross-tenant (service tira `NotFoundError`) → 404.
  - `POST /api/products` admin → 201; manager → 201 (tiene `products:write`); cashier → 403 + audit `products:write`; body inválido → 400; service 409 `DUPLICATE_SKU` se propaga como 409.
  - `PATCH /api/products/:id` admin → 200; body vacío → 400 (refine); manager → 200; cashier → 403.
  - `DELETE /api/products/:id` admin → 200 con `isActive: false`; manager → 403 + audit `products:delete` (manager NO tiene `products:delete`); cashier → 403.

#### 7. Docs

- [x] `apps/backend/README.md` — agregar la sección `/api/products` a la tabla/lista de endpoints (si existe); si no existe, no inventar estructura. _(no existe `apps/backend/README.md`, no se creó uno nuevo)_

### Verification

- [x] `pnpm --filter @kaipos/backend typecheck` passes
- [x] `pnpm --filter @kaipos/shared typecheck` passes
- [x] `pnpm lint` passes (backend + shared)
- [x] `pnpm format:check` passes
- [x] `pnpm --filter @kaipos/backend test` passes (services + routes)
- [x] `pnpm --filter @kaipos/backend build` succeeds
- [ ] Manual: `pnpm docker:up` + Bruno/curl:
  - `POST /api/products` (admin) → 201, doc visible con `listCollections`.
  - `POST /api/products` mismo SKU → 409 `DUPLICATE_SKU`.
  - `GET /api/products?q=.` (regex escape) no tira 500.
  - `DELETE /api/products/:id` → `isActive: false`; reaparece con `?includeInactive=true`.
  - Cajero (`cajero@lacocinadekai.com`) → `GET` 200, `POST`/`PATCH`/`DELETE` → 403.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 2: Frontend — listado + modal crear/editar

**Branch**: `NT-33618b91/paso-10-crud-de-productos/frontend-ui`
**Targets**: `NT-33618b91/paso-10-crud-de-productos/backend-crud`

### Tasks

#### 1. Ruta y navegación

- [ ] `apps/frontend-admin/src/App.tsx` — agregar `<Route element={<RequirePermission permission="products:read" />}>` con `<Route path="/products" element={<ProductsListPage />} />`, siguiendo el patrón de `/users`.
- [ ] `apps/frontend-admin/src/components/Sidebar.tsx` — agregar item `{ label: 'Productos', to: '/products', icon: <ícono de `@kaipos/ui`>, permission: 'products:read' }`. Si `@kaipos/ui` no exporta un ícono adecuado (e.g. `Package`), **re-exportarlo** desde `packages/ui/src/components/index.ts` (bloque de `lucide-react`). NO importar `lucide-react` directamente en la app.

#### 2. Página `ProductsListPage.tsx`

- [ ] `apps/frontend-admin/src/pages/ProductsListPage.tsx` — nueva página, patrón de `UsersListPage.tsx`:
  - Estado `FetchState = loading | error | success` + `reloadKey` para retry.
  - `useEffect` que llama `apiJson<Product[]>('/api/products?...')` construyendo la querystring desde los filtros (`q`, `category`, `includeInactive`).
  - `mapError(err)` devuelve mensajes en español (403 / 401 / TypeError / default) — copiar de `UsersListPage.tsx::mapError` y ajustar al dominio (“No pudimos cargar los productos…”).
  - Toolbar encima de la tabla: `TextField` para búsqueda debounced (300 ms, hook local `useDebouncedValue` o `setTimeout` dentro de `useEffect`) + `Select` de categoría (opciones derivadas de la data cargada la primera vez, `['', ...unique(products.map(p => p.category))]`) + `Switch` "Incluir inactivos".
  - Tabla con columnas: Nombre, SKU, Categoría, Precio (`formatCurrency` de `@kaipos/shared/utils`), Estado (`Chip` activo/inactivo), Acciones (editar/eliminar, condicionales por permiso).
  - Estados: `LoadingTable` (skeleton), `Alert` + botón "Reintentar", `EmptyState` cuando `data.length === 0`.
  - Botón "Nuevo producto" en el header sólo si `hasPermission(user.role, 'products:write')`; abre el modal en modo create.
  - Acciones por fila: "Editar" (products:write) abre modal en modo edit con el producto precargado; "Eliminar" (products:delete) dispara `DELETE /api/products/:id` y refresca la lista. Confirmación con `window.confirm` (suficiente para Paso 10 — modal de confirmación es follow-up si se pide).

#### 3. Modal crear/editar

- [ ] `apps/frontend-admin/src/pages/ProductsListPage.tsx` — componente local `ProductFormDialog` (co-ubicado para no sobre-abstraer hasta que haya un segundo caller):
  - Props: `{ open, mode: 'create' | 'edit', initial?: Product, onClose, onSaved }`.
  - Campos: `name`, `sku`, `category` (`TextField` libre por ahora — categorías siguen como string, no FK), `price` (`TextField type="number"`), `stock` (`type="number"`), `description` (`multiline`), `imageUrl` (`TextField type="url"`, opcional).
  - Validación cliente antes de enviar: requeridos, `price >= 0`, `stock >= 0 int`, `imageUrl` si viene, es URL válida. Errores inline por campo.
  - Submit: `POST /api/products` o `PATCH /api/products/:id` vía `apiJson`. En error:
    - `ApiError` 409 `DUPLICATE_SKU` → error inline en el campo SKU ("Ya existe un producto con ese SKU").
    - 400 con `details[]` → mapear a errores por campo si el `field` coincide.
    - Otros → `Alert` de error en el diálogo.
  - Al éxito: cerrar modal + refrescar lista (incrementa `reloadKey`).

#### 4. Convenciones y gates

- [ ] Sólo componentes e íconos de `@kaipos/ui`. Ejecutar `rg "from '@mui/material" apps/frontend-admin/src` y `rg "from 'lucide-react'" apps/frontend-admin/src` → 0 matches.
- [ ] Mensajes de error en español (coherentes con `UsersListPage`).
- [ ] Los botones de crear/editar/eliminar se ocultan vía `hasPermission(user.role, '...')` — además el backend ya rechaza con 403, el gate visual es sólo UX.

#### 5. Docs

- [ ] `apps/frontend-admin/README.md` — agregar `/products` al mapa de rutas y mencionar la permission gate.

### Verification

- [ ] `pnpm --filter @kaipos/frontend-admin typecheck` passes
- [ ] `pnpm --filter @kaipos/frontend-admin lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm --filter @kaipos/frontend-admin build` succeeds
- [ ] `rg "from '@mui/material" apps/frontend-admin/src` → 0 matches
- [ ] `rg "from 'lucide-react'" apps/frontend-admin/src` → 0 matches
- [ ] Manual (con `pnpm dev` o `pnpm docker:up` + backend ya en Phase 1):
  - Login como admin → `/products` carga lista demo seeded.
  - Crear producto → aparece en la tabla inmediatamente.
  - Editar precio → persiste tras reload.
  - Eliminar → desaparece; toggle "Incluir inactivos" lo muestra con chip Inactivo.
  - Búsqueda por nombre y SKU case-insensitive.
  - Filtro por categoría.
  - Login como cajero → ve la lista pero NO ve "Nuevo producto" ni acciones por fila.
  - Login como manager → ve crear/editar, NO ve eliminar.
  - SKU duplicado en modal → error inline en el campo SKU.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

- [ ] Full E2E contra `pnpm docker:up` (backend + frontend + Mongo local) con los tres roles: admin, manager, cajero.
- [ ] Verificar audit logs (`db.auditLogs.find({ action: 'authorization_failed' })`) tras intentos denegados desde cajero (`POST/PATCH/DELETE`) y manager (`DELETE`).
- [ ] Cross-tenant: crear un segundo business + admin vía script o mutación manual; confirmar que `GET /api/products/:id` cross-tenant devuelve 404, no 403 ni el doc.
- [ ] `db.products.findOne(...)` confirma que `imageUrl` se persiste cuando se envía y está ausente cuando no.
- [ ] `db.products.getIndexes()` confirma que los índices preexistentes `{businessId, sku}` único y `{businessId, category, isActive}` siguen presentes (no deberíamos tocarlos — validación defensiva).
- [ ] Re-correr `pnpm --filter @kaipos/backend db:setup` y confirmar que el nuevo validador se aplica con `collMod` sin errores en una DB que ya tiene productos.
- [ ] `rg "from '@mui/material" apps/frontend-admin/src` → 0; `rg "from 'lucide-react'" apps/frontend-admin/src` → 0.
- [ ] `rg "console\.log" apps/backend/src` sin nuevas ocurrencias añadidas por este plan.

# Plan: Paso 1 — Catálogo de Productos Avanzado

| Field          | Value                                                                |
| -------------- | -------------------------------------------------------------------- |
| Notion Ticket  | [NT-34318b91](https://notion.so/34318b913fdd817192c1f2caef069608)    |
| Spec           | `.specs/NT-34318b91_catalogo-productos-avanzado/spec.md`             |
| Feature Branch | `NT-34318b91/catalogo-productos-avanzado/feature`                    |
| Target         | `main`                                                               |

<!-- Multi-phase sequential plan. Phases are stacked — each targets the previous phase's branch.
     Phase 1 branch targets the feature branch; subsequent phases target the previous phase.
     Use `/kaipos.implement` to implement one phase at a time. -->

<!-- Architectural decisions (locked in during planning):
  - `branch.timezone` does NOT exist today. Phase 1 adds it as required with default
    `America/Santo_Domingo` (matches DR market in seed). All time-based filtering depends on it.
  - `sortOrder` becomes a required field on Product with default `0`. Existing docs are
    backfilled by an idempotent script in `apps/backend/scripts/` invoked from Phase 1.
  - `variants`, `availabilityWindow`, `barcode` stay optional — no backfill needed.
  - `maxSelectable` is validated both at product save (must be ≤ options.length) AND at
    order create time when ticket-side validation lands (here we only enforce save-time).
  - `productPreferences` is its own collection; `Product` is NOT polluted with a `featured`
    field because "featured" is per-branch and per-product, and a product lives in one branch
    only — but a future `super_admin` view may aggregate across branches.
  - `PATCH /api/products/reorder` uses `bulkWrite({ ordered: false })`. Mongo standalone in
    Docker does not support multi-doc transactions; the cluster prod does. Documented as a
    known limitation; partial failures leave inconsistent `sortOrder` (caller must retry).
  - `effectivePrice` is computed client-side. Backend returns `price`, `variants[].priceDelta`,
    and `modifierGroups[].options[].priceDelta` verbatim. Avoids round-trips for "what-if" UX.
  - Permission for feature/reorder is `products:write` (existing). No new `Permission` token.
-->

## Phase 1: Schema, types y DB foundation

**Branch**: `NT-34318b91/catalogo-productos-avanzado/schema-db-foundation`
**Targets**: `NT-34318b91/catalogo-productos-avanzado/feature`

### Tasks

#### Shared types (`packages/shared/src/types/index.ts`)

- [x] Agregar `timezone: string` (required) a `Branch` (default conceptual `America/Santo_Domingo`; el backend lo aplica).
- [x] Extender `ModifierGroup` con `maxSelectable: number` (entero ≥ 1).
- [x] Extender `ModifierOption` con `available?: { daysOfWeek?: number[]; from?: string; to?: string }` (formato `HH:mm`).
- [x] Agregar `interface ProductVariant { id: string; name: string; sku: string; priceDelta: number; imageUrl?: string }`.
- [x] Agregar `interface AvailabilityWindow { daysOfWeek: number[]; from: string; to: string }`.
- [x] Extender `Product` con: `variants?: ProductVariant[]`, `availabilityWindow?: AvailabilityWindow`, `sortOrder: number` (required), `barcode?: string`.
- [x] Agregar `interface ProductPreference { _id: string; businessId: string; branchId: string; productId: string; featured: boolean; sortOrderOverride?: number; updatedAt: Date; updatedBy: string }`.
- [x] Extender `AUDIT_ACTIONS` con: `product_featured`, `product_unfeatured`, `products_reordered`.

#### Zod schemas (`packages/shared/src/schemas/products.ts`)

- [x] Agregar `productVariantSchema` con SKU min(1) y `priceDelta: z.number()`.
- [x] Agregar `availabilityWindowSchema` con `daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1)`, `from`/`to` con regex `/^([01]\d|2[0-3]):[0-5]\d$/`.
- [x] Extender `modifierOptionSchema` con `available?: { daysOfWeek?, from?, to? }` (mismo formato).
- [x] Extender `modifierGroupSchema` con `maxSelectable: z.number().int().min(1)` + `.refine((g) => g.maxSelectable <= g.options.length, ...)`.
- [x] Extender `createProductSchema` / `updateProductSchema` con `variants?`, `availabilityWindow?`, `sortOrder: z.number().int().min(0).default(0)`, `barcode?: z.string().min(1).optional()`.
- [x] Refinement en `createProductSchema`: SKUs únicos dentro de `variants` (validación adicional en el service).
- [x] Extender `listProductsQuerySchema` con `activeNow?: boolean` (coerción string→bool igual que `includeInactive`), `featuredIn?: string` (branchId).
- [x] Agregar `reorderProductsSchema` con `{ branchId: string; items: Array<{ id: z.string().uuid(), sortOrder: z.number().int().min(0) }>.min(1).max(500) }`.
- [x] Agregar `featureProductSchema` con `{ branchId: string; featured: boolean }`.
- [x] Re-export desde `apps/backend/src/schemas/products.ts` (ya es passthrough — sin cambios estructurales).

#### Permissions (`packages/shared/src/permissions.ts`)

- [x] **No** agregar tokens nuevos. Mantener `products:write` para feature/reorder y `products:read` para `featuredIn`/`activeNow`.

#### DB validators e índices (`apps/backend/src/db/setup.ts`)

- [x] **`branches` validator**: agregar `timezone` a `required` y a `properties` (`bsonType: 'string'`).
- [x] **`products` validator**:
  - `modifierGroups[].items.required` agregar `maxSelectable`; `properties` agregar `maxSelectable: { bsonType: 'number' }` (number por la convención de driver int→double documentada en el archivo).
  - `modifierGroups[].items.properties.options.items.properties.available: { bsonType: 'object', properties: { daysOfWeek: { bsonType: 'array', items: { bsonType: 'number' } }, from: { bsonType: 'string' }, to: { bsonType: 'string' } } }`.
  - `variants: { bsonType: 'array', items: { bsonType: 'object', required: ['id','name','sku','priceDelta'], properties: { id, name, sku, priceDelta, imageUrl } } }`.
  - `availabilityWindow: { bsonType: 'object', required: ['daysOfWeek','from','to'], properties: { daysOfWeek: array of number, from: string, to: string } }`.
  - `barcode: { bsonType: 'string' }`.
  - `sortOrder: { bsonType: 'number' }` y agregarlo a `required` (después del backfill — ver script abajo).
- [x] **`products` índices nuevos**:
  - `{ branchId: 1, category: 1, sortOrder: 1 }` (no único).
  - `{ branchId: 1, barcode: 1 }` con `unique: true` y `partialFilterExpression: { barcode: { $type: 'string' } }`.
- [x] **Nueva colección `productPreferences`**:
  - Validator con `required: ['businessId','branchId','productId','featured','updatedAt','updatedBy']` y `properties` consistente.
  - Índice único `{ businessId: 1, branchId: 1, productId: 1 }`.
  - Índice `{ businessId: 1, branchId: 1, featured: 1 }` para `featuredIn` queries.

#### Collections helper (`apps/backend/src/db/collections.ts`)

- [x] Agregar `getProductPreferencesCollection(): Promise<Collection<ProductPreference>>`.

#### Backfill script (`apps/backend/scripts/backfill-product-sort-order.ts`)

- [x] Crear script idempotente:
  - `updateMany({ sortOrder: { $exists: false } }, { $set: { sortOrder: 0 } })`.
  - Logs por sucursal/cantidad. No falla si 0 docs.
  - **Importante**: correrlo **antes** del `db:setup` final, porque agregar `sortOrder` a `required` con `validationLevel: 'moderate'` no rompe inserts existentes, pero sí futuros updates a docs sin el campo.
- [x] Agregar `db:backfill:sortorder` a `apps/backend/package.json` scripts.
- [x] Agregar `timezone` default `'America/Santo_Domingo'` a las branches existentes en el mismo script (o un sub-comando) para que el cambio de validator no rompa updates.

#### Seed (`apps/backend/src/db/seed.ts` y `seed-cypress.ts`)

- [x] Branches sembradas: agregar `timezone: 'America/Santo_Domingo'`.
- [x] Productos sembrados: agregar `sortOrder: 0` y `modifierGroups[].maxSelectable` donde aplique (1 si hay opciones, sino omitir el grupo).

#### OpenAPI

- [x] Correr `pnpm --filter @kaipos/backend openapi:generate` y commitear `apps/backend/openapi.json`.

#### Tests

- [x] `packages/shared/src/schemas/products.test.ts` (crear si no existe): cubrir parses positivos/negativos de los schemas nuevos (variants con SKU duplicado, availabilityWindow inválido, `maxSelectable > options.length`).
- [x] `apps/backend/src/db/setup.test.ts` no es necesario reescribir; smoke test corriendo `pnpm --filter @kaipos/backend db:setup` localmente cuenta como verificación.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test` passes (incluye el nuevo `products.test.ts` de shared)
- [x] `pnpm --filter @kaipos/backend db:setup` corre idempotente sin errores (Docker Mongo).
- [x] Backfill script: `pnpm --filter @kaipos/backend db:backfill:sortorder` ejecuta sin errores y los productos seedeados conservan `sortOrder: 0`.
- [x] `apps/backend/openapi.json` regenerado y comiteado; `git diff` muestra los campos nuevos en los schemas.
- [x] Manual: confirmar en `mongosh` que el índice `{branchId:1,barcode:1}` existe con `partialFilterExpression`.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 2: Backend services, routes y perf test

**Branch**: `NT-34318b91/catalogo-productos-avanzado/backend-services-routes`
**Targets**: `NT-34318b91/catalogo-productos-avanzado/schema-db-foundation`

### Tasks

#### Service helpers (`apps/backend/src/lib/availability.ts` — nuevo)

- [x] `isWithinAvailabilityWindow(window: AvailabilityWindow, timezone: string, now: Date = new Date()): boolean` — usa `Intl.DateTimeFormat` con `timeZone` para extraer `weekday` (0-6) y `HH:mm`, compara contra `daysOfWeek` + rango `from`/`to`. Maneja ventanas que cruzan medianoche (e.g. 22:00–02:00) interpretándolas como dos sub-rangos.
- [x] `isModifierOptionAvailable(option: ModifierOption, timezone: string, now?: Date): boolean` — misma lógica, pero `daysOfWeek`/`from`/`to` son opcionales (ausencia = siempre disponible).
- [x] Unit tests `availability.test.ts` con casos: ventana 11–15 a las 12 (true), a las 16 (false), ventana 22–02 a las 23 (true) y 03 (false), distintos timezones (UTC vs América/Santo_Domingo).

#### Service: productos (`apps/backend/src/services/products.ts`)

- [x] Cargar `branch.timezone` con un helper `getBranchTimezone(branchId)` cacheado por request (LRU pequeño in-memory, TTL 60 s) para evitar un round-trip por producto cuando se filtra `activeNow=true`. Si no se encuentra, fallback `'America/Santo_Domingo'`.
- [x] `buildListFilter`: agregar `q` también busca en `barcode` con el mismo `^prefix` regex (el `$or` ahora tiene 3 ramas: `name`, `sku`, `barcode`).
- [x] `listProducts`:
  - Si `query.featuredIn`: JOIN manual con `productPreferences` — primero `find({ businessId, branchId: featuredIn, featured: true })`, luego `find({ _id: { $in: productIds } })`. Documentar por qué no es `$lookup` (deja la opción para el futuro si el set crece).
  - Si `query.activeNow`: aplicar filtro post-fetch (sobre la página) usando `availabilityWindow` + `branch.timezone`. Documentar la limitación: el conteo total de paginación es **pre-filter**; UX-wise mostramos "X resultados (filtrados por horario)".
  - Default sort cuando NO hay `q`: orden post-fetch por `[category.sortOrder ASC, product.sortOrder ASC, name ASC]` enriqueciendo la página con un `find` batch sobre `categories`. Cuando hay `q`, mantener `createdAt: -1`. (Se eligió enriquecer post-fetch en vez de `$lookup` para no romper el shape de paginación existente; revisar si el costo del lookup post-fetch crece con la página.)
- [x] `createProduct` / `updateProduct`:
  - Validar SKUs únicos dentro de `variants` (Set por `variant.sku`); error 400 `VARIANT_SKU_DUPLICATE`.
  - Validar que cada `modifierGroup.maxSelectable <= options.length` (defense in depth, además del refine del schema); error 400 `MAX_SELECTABLE_EXCEEDS_OPTIONS`.
  - Default `sortOrder = 0` en create si el cliente no lo envía.
  - **No** persistir `featured` en `Product`; mantener separación con `productPreferences`.
- [x] `reorderProducts(actor, { branchId, items })`:
  - `assertBranchAccess(actor, branchId)`.
  - `bulkWrite(items.map(it => ({ updateOne: { filter: { _id: it.id, branchId, businessId }, update: { $set: { sortOrder: it.sortOrder, updatedAt: new Date() } } } })), { ordered: false })`.
  - Validar que `result.matchedCount === items.length`; si no, devolver 400 con la lista de IDs que no matchearon.
  - `logAuditEvent('products_reordered', target: branchId, metadata: { itemCount, ids })`.
  - `fanOutProductEvent` opcional: emitir un único `product.reordered` al canal de la sucursal (extender el union type en el WS payload — coordinar con `packages/shared/src/types/websocket.ts`).

#### Service: productPreferences (`apps/backend/src/services/product-preferences.ts` — nuevo)

- [x] `setFeatured(actor, productId, { branchId, featured })`:
  - Validar que el producto existe y pertenece al business del actor / branch accesible.
  - `updateOne({ businessId, branchId, productId }, { $set: { featured, updatedAt, updatedBy: actor.userId } }, { upsert: true })`.
  - `logAuditEvent(featured ? 'product_featured' : 'product_unfeatured', target: productId, metadata: { branchId })`.
  - Emitir `product.updated` (reusa el canal existente) para que la UI refresque.
- [x] Tests unitarios con mocks de la collection.

#### Routes (`apps/backend/src/routes/products.ts`)

- [x] `PATCH /api/products/reorder` (antes del `:id` para que no choque con el route param):
  - `requireAuth()`, `requirePermission('products:write')`, `validate({ body: reorderProductsSchema })`, `requireBranchAccess('branchId')` (custom: leer del body en lugar de query).
  - Handler llama a `productsService.reorderProducts`.
- [x] `PATCH /api/products/:id/feature`:
  - `requireAuth()`, `requirePermission('products:write')`, `validate({ params: productIdParamSchema, body: featureProductSchema })`, `requireBranchAccess('branchId')` (body).
  - Handler llama a `productPreferencesService.setFeatured`.
- [x] Revisar `requireBranchAccess` — agregado parámetro `source` con valores `auto|param|query|body`. Las rutas nuevas pasan `'body'` y el GET pasa `'query'` para preservar el comportamiento existente.

#### OpenAPI registry (`apps/backend/src/openapi/registry.ts`)

- [x] Registrar las dos rutas nuevas + extender el schema de `listProductsQuerySchema` (los flags `activeNow`/`featuredIn` y la rama `barcode` del search).
- [x] Re-run `pnpm --filter @kaipos/backend openapi:generate` y commitear.

#### Tests

- [x] `apps/backend/src/services/products.test.ts`:
  - `listProducts` con `featuredIn` retorna sólo los destacados; los no destacados de otra sucursal con el mismo producto no aparecen.
  - `listProducts` con `activeNow=true` filtra por hora (mock `Date.now`).
  - Sort default sin `q` orden por `category.sortOrder, product.sortOrder, name`.
  - Búsqueda por `barcode` (prefix) devuelve match.
  - Variantes con SKU duplicado → 400.
  - `maxSelectable > options.length` → 400.
  - `reorderProducts` aplica todos los updates en bulk; si un `id` no matchea, devuelve 400 con el array de no encontrados.
  - RBAC: usuario sin acceso a la sucursal del producto no puede `feature`/`reorder` (403).
- [x] `apps/backend/src/services/product-preferences.test.ts`: feature/unfeature + idempotencia + audit log.
- [x] `apps/backend/src/routes/products.test.ts`: integración HTTP para los endpoints nuevos.
- [x] **Perf test** (`apps/backend/src/services/products.perf.test.ts` — nuevo, gated por `RUN_PERF=1` env):
  - Setup: seed 1 000 productos en la branch de test (helper en `apps/backend/src/test/seed-products.ts`).
  - Loop: 20 iteraciones de `GET /api/products?branchId=X&q=foo`, medir tiempos con `performance.now()`.
  - Aserción: mediana < 300 ms.
  - El test es `describe.skipIf(!RUN_PERF)` y conecta directo a Docker Mongo (`MONGO_URI`). En CI queda opt-in.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test` passes (incluye nuevos tests; perf test corre con `RUN_PERF=1`).
- [x] `apps/backend/openapi.json` actualizado.
- [ ] Manual con `curl`/Bruno:
  - `PATCH /api/products/reorder` con 5 items reordena y persiste; un re-fetch ve `sortOrder` actualizado.
  - `PATCH /api/products/:id/feature` con `{ branchId, featured: true }` crea fila en `productPreferences`; `GET /api/products?featuredIn=branchId` la incluye.
  - `GET /api/products?branchId=X&q=750ml` retorna match por `barcode` cuando el producto tiene `barcode: '750ml-tinto'`.
  - `GET /api/products?activeNow=true&branchId=X` con ventana 11–15 filtra correctamente según hora local de la sucursal.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 3: Admin UI extensions

**Branch**: `NT-34318b91/catalogo-productos-avanzado/admin-ui-extensions`
**Targets**: `NT-34318b91/catalogo-productos-avanzado/backend-services-routes`

### Tasks

#### API client (`apps/frontend-admin/src/lib/products-api.ts`)

- [x] Extender `ListProductsParams` con `activeNow?`, `featuredIn?`; serializarlos en `buildListQuery`.
- [x] Extender `CreateProductPayload`/`UpdateProductPayload` con los campos nuevos (TypeScript ya los recogerá desde `Product`).
- [x] Agregar `reorderProducts(branchId: string, items: Array<{ id: string; sortOrder: number }>): Promise<void>`.
- [x] Agregar `setProductFeatured(id: string, { branchId, featured }: { branchId: string; featured: boolean }): Promise<void>`.
- [x] Extender `ProductsApiErrorCode` con `VARIANT_SKU_DUPLICATE`, `MAX_SELECTABLE_EXCEEDS_OPTIONS`.

#### `ProductFormPage.tsx` (`apps/frontend-admin/src/pages/`)

- [x] **Variantes**: sección reusando el patrón existente de `@dnd-kit` para modificadores. Cada fila: `name`, `sku`, `priceDelta` (`<NumberField/>` o `TextField type="number"`), `imageUrl` con re-uso de `generateUploadUrl`. Validación inline para SKU duplicado dentro del form.
- [x] **`maxSelectable`** en cada `ModifierGroup`: campo numérico (defaults a `options.length`), con tooltip "máx. opciones que un cliente puede elegir".
- [x] **`ModifierOption.available`**: collapsible "Disponibilidad por horario" con `daysOfWeek` (checkboxes lun–dom) + `from`/`to` (`TextField type="time"`).
- [x] **`availabilityWindow`**: misma UI a nivel de producto (sección "Disponibilidad por horario").
- [x] **`barcode`**: `TextField` simple en la sección de identificación junto al SKU.
- [x] **Botón "Destacar en esta sucursal"**: toggle al lado del header del producto; llama a `setProductFeatured` con `branchId` activo. Estado optimista + revertir on error.
- [x] Helpers visuales: usar `@kaipos/ui` y design tokens; **no** importar `@mui/material` directo; spacing vía MUI scale; tipografía vía `Typography variant`/`theme.typography.X`.

#### `ProductsListPage.tsx` (`apps/frontend-admin/src/pages/`)

- [x] Modo "Reordenar" — toggle button en el header. Cuando está activo:
  - Reemplaza filas con un `DndContext` (`@dnd-kit/sortable`).
  - Deshabilita filtros (categoría/búsqueda/include inactivos) excepto el filtro de categoría (necesario para reordenar dentro de una sola).
  - Botón "Guardar orden" → `reorderProducts(branchId, items)` con estado optimista; rollback on error con `Snackbar`.
  - Botón "Cancelar" descarta cambios locales.
- [x] Filtro **"Sólo destacados"** (`Switch`) — cuando ON, pasar `featuredIn=branchId` al API.
- [x] Filtro **"Sólo disponibles ahora"** (`Switch`) — pasar `activeNow=true`. Mostrar nota inline si combina con otros filtros.
- [x] Columna "Destacado": indicador `Star` (filled/outlined) que toggle vía `setProductFeatured`. Requiere `canWrite`.
- [x] Columna "Orden" sólo visible en modo reorder.
- [x] Manejar el evento WS `product.reordered` (si lo emitimos en Phase 2) — refetch.

#### Tests

- [x] `ProductFormPage.test.tsx` (extender el existente o crear): test del flujo variantes (agregar/eliminar/duplicate SKU error), `maxSelectable` validación, `availabilityWindow` form.
- [x] `ProductsListPage.test.tsx` (crear si no existe — mantener cobertura ≥ 90% del paquete UI): test del toggle reorder, drag-and-drop save (mock `reorderProducts`), feature toggle.
- [x] Mock del API client con `vi.mock`; no hits reales.

#### Docs

- [x] Actualizar `apps/frontend-admin/README.md` mencionando el modo reorder y el filtro `activeNow`/`featuredIn`.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes (sin violaciones del design-system boundary)
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test` passes con cobertura ≥ 90% en `@kaipos/ui` y `frontend-admin` (no bajar de los thresholds existentes).
- [ ] Manual (con `pnpm dev`, login admin):
  - Crear producto con 2 variantes (S/M) con `priceDelta` distintos; guardar y reabrir; el orden y los SKUs se conservan.
  - Configurar `availabilityWindow` 11–15 en un producto; en `ProductsListPage` con "Sólo disponibles ahora", el producto desaparece fuera de ese horario (cambiar hora del sistema o mockear).
  - Asignar `barcode` a un producto, buscar por prefijo en la lista — aparece.
  - Marcar producto como destacado; con filtro "Sólo destacados" aparece, sin filtro permanece.
  - Modo reordenar: drag tres productos dentro de una categoría, guardar, refrescar — orden persiste.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

- [ ] **Migración**: backfill script corre dos veces sin efectos colaterales; productos sin `sortOrder` quedan con `0`; branches sin `timezone` quedan con `America/Santo_Domingo`.
- [ ] **Regression Paso 10**:
  - CRUD básico de productos (sin variantes/availability/barcode/sortOrder en el form) sigue funcionando.
  - Subida de imágenes a S3/CloudFront sigue funcionando.
  - Búsqueda por nombre/SKU sigue funcionando.
  - Modificadores embebidos legacy (sin `maxSelectable`) — validar comportamiento: el validator es `moderate`, así que docs viejos pasan; pero un update debe agregar `maxSelectable`. Documentar en el README si hace falta.
- [ ] **RBAC**:
  - `cashier` con `products:read` puede listar pero recibe 403 al intentar `PATCH /reorder`, `PATCH /:id/feature`.
  - `admin` de un business no puede `feature` un producto de otro business (404, no 403 — política existente).
  - `super_admin` puede operar en cualquier business (con `businessId` query).
- [ ] **Edge cases**:
  - `availabilityWindow` que cruza medianoche (22–02): producto aparece a las 23:30 y a las 01:30, no aparece a las 03:00.
  - `maxSelectable === options.length` (válido); `maxSelectable === 0` (rechazado por `.min(1)`).
  - `reorder` con 500 items (limite del schema).
  - `barcode` duplicado entre dos productos de la misma sucursal → 409 (el índice parcial unique lo evita en DB; el service mapea el error igual que SKU).
  - Producto sin `branchId` en variantes — N/A (variantes son embebidas, heredan `branchId` del producto).
- [ ] **Perf**: re-correr el perf test localmente — mediana < 300 ms reproducible.
- [ ] **OpenAPI**: comparar `openapi.json` con la rama base; los diffs son sólo los esperados.
- [ ] **WS**: con dos pestañas abiertas, un cambio en una refresca la otra (`product.updated`, `product.reordered` si se implementó).
- [ ] **Observability**: audit logs en `auditLogs` collection para `product_featured`, `product_unfeatured`, `products_reordered`. Cada uno con `target`, `userId`, `metadata.branchId`.
- [ ] **Design system**: `pnpm lint` confirma ninguna importación directa de `@mui/material`/`lucide-react` en `apps/**/src`, ningún literal numérico para `fontSize`/`fontWeight`/`borderRadius`.

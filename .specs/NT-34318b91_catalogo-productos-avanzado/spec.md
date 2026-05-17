# Spec: Paso 1 — Catálogo de Productos Avanzado

| Field         | Value                                                                |
| ------------- | -------------------------------------------------------------------- |
| Notion Ticket | [NT-34318b91](https://notion.so/34318b913fdd817192c1f2caef069608)    |
| Status        | In Progress                                                          |
| Priority      | Alta                                                                 |
| Branch        | `NT-34318b91/catalogo-productos-avanzado/feature`                    |
| Created       | 2026-05-15                                                           |

## Context

El CRUD base de productos (Paso 10 — PR previo) ya está en producción y cubre:

- `Product` con `name`, `price`, `sku`, `category`, `branchId`, `imageUrl`, `availability` por canal (`pos`/`online`/`kiosk`), `stock`, `allergens`, `dietaryTags`, `serviceSchedules`, `kitchenStationIds`.
- **Modificadores embebidos** (`modifierGroups[]` con `name`, `required`, `options[{ id, label, priceDelta }]`), validados por JSON Schema en `apps/backend/src/db/setup.ts` y editables con `@dnd-kit` en `apps/frontend-admin/src/pages/ProductFormPage.tsx`.
- **Subida de imágenes a S3 + CloudFront** end-to-end (`POST /api/products/upload-url` → pre-signed PUT; MinIO en local; CDN vía `ASSETS_CDN_DOMAIN`).
- **Búsqueda** con prefijo case-insensitive (collation `locale: 'es', strength: 2`) sobre `name` y `sku`, índice compuesto `{ branchId, name }` y `{ branchId, sku }` único.
- **Categorías** con `sortOrder` propio (colección `categories`).

Este paso es el **delta** sobre Paso 10 para llegar a un catálogo "avanzado": variantes con precios distintos, modificadores con límite de selección y disponibilidad por opción, ventanas horarias de disponibilidad, productos destacados por sucursal, orden personalizable de productos dentro de cada categoría, y búsqueda por código de barras.

**Stack:** MongoDB native driver con JSON Schema validators (no es PostgreSQL). Cualquier cambio al schema requiere actualizar el validator en `apps/backend/src/db/setup.ts` y correr `pnpm --filter @kaipos/backend db:setup` (idempotente). Schemas Zod compartidos viven en `packages/shared/src/schemas/products.ts` y se re-exportan desde `apps/backend/src/schemas/products.ts`.

## Requirements

### 1. Modificadores — extender modelo existente

- Agregar `maxSelectable: number` (entero ≥ 1) al `ModifierGroup`. El backend valida que las selecciones que llegan en un ticket del POS no superen `maxSelectable` por grupo.
- Permitir disponibilidad por opción: `ModifierOption.available?: { daysOfWeek?: number[]; from?: string; to?: string }` con `from`/`to` en formato `HH:mm` y timezone de la sucursal (`branch.timezone`).
- Mantener modificadores embebidos en el documento `Product` — **no** crear colección separada.

### 2. Variantes de producto (nuevo)

- Nuevo array embebido opcional `variants?: Variant[]` con shape `{ id: string; name: string; sku: string; priceDelta: number; imageUrl?: string }`.
- SKU único por variante dentro del mismo producto (validar en el service, no a nivel de índice de Mongo).
- El precio efectivo es `product.price + variant.priceDelta + sum(modifier.priceDelta)`.
- Si un producto tiene `variants.length > 0`, la UI del POS fuerza selección antes de añadir al ticket (la lógica de POS es out-of-scope; aquí se expone el dato).

### 3. Disponibilidad por horario (nuevo)

- Nuevo campo opcional `availabilityWindow?: { daysOfWeek: number[]; from: string; to: string }` con `from`/`to` en formato `HH:mm`, `daysOfWeek` con valores `0` (domingo) … `6` (sábado).
- `GET /api/products?activeNow=true` filtra los productos cuyo `availabilityWindow` esté **activo** según la hora actual en el timezone de la sucursal (`branch.timezone` ya existe).
- El campo `availability` por canal (`pos`/`online`/`kiosk`) se mantiene **independiente** y se combina con AND lógico (un producto sólo aparece si está habilitado en el canal **y** dentro de su ventana horaria).

### 4. Productos destacados por sucursal (nuevo)

- Nueva colección `productPreferences` con shape `{ _id, businessId, branchId, productId, featured: boolean, sortOrderOverride?: number, updatedAt, updatedBy }` y unique index `{ businessId, branchId, productId }`.
- Schema con JSON Schema validator en `apps/backend/src/db/setup.ts`.
- Nuevo endpoint `PATCH /api/products/:id/feature` con body `{ branchId, featured }`, protegido por `requirePermission('products:write')` y `requireBranchAccess('branchId')`.
- `GET /api/products?featuredIn=:branchId` retorna sólo los destacados de esa sucursal.

> **Nota RBAC:** la ticket dice `products:update`, pero el codebase usa `products:write`. Mantenemos `products:write` para no romper la convención existente.

### 5. Orden personalizable dentro de categoría (nuevo)

- Agregar `sortOrder: number` (default `0`) al schema de `Product`.
- Nuevo índice compuesto `{ branchId, category, sortOrder }`.
- Nuevo endpoint `PATCH /api/products/reorder` que acepta `{ branchId, items: [{ id, sortOrder }, ...] }`, valida acceso por sucursal, y aplica los cambios en bulk con `bulkWrite`.
- UI de drag-and-drop en `ProductsListPage.tsx` para reordenar productos dentro de una categoría (reusar `@dnd-kit`, ya instalado para `ProductFormPage`).
- `GET /api/products` sin `sort` explícito ahora ordena por `category.sortOrder ASC, product.sortOrder ASC, name ASC` (en lugar del actual `createdAt DESC`). Cuando hay `q` (búsqueda), se mantiene el orden por relevancia actual.

### 6. Búsqueda extendida (delta)

- Agregar `barcode?: string` al schema de `Product`.
- Nuevo índice parcial `{ branchId: 1, barcode: 1 }` único cuando `barcode` exista (`partialFilterExpression: { barcode: { $exists: true } }`).
- La búsqueda actual (`name`, `sku`) extiende el `$or` para incluir `barcode` con el mismo prefix match (anchored regex) y collation `{ locale: 'es', strength: 2 }`.

### 7. Performance

- Test de performance: con dataset de 1 000 productos seedeados, la mediana de la búsqueda (`GET /api/products?branchId=X&q=foo`) debe ser **< 300 ms** medida en CI sobre 20 iteraciones.

### 8. Migración y compatibilidad

- Productos existentes sin `sortOrder` / `variants` / `availabilityWindow` / `barcode` deben seguir funcionando.
- Default `sortOrder = 0` (aplicar en el validator y en el service al crear); los demás campos quedan `undefined`.
- Considerar un script idempotente en `apps/backend/scripts/` para backfill de `sortOrder = 0` si la actualización del validator lo exige; documentar en el plan si hace falta.

### 9. RBAC y observabilidad

- Todos los endpoints nuevos usan `requirePermission('products:read' | 'products:write')`. Nunca `role === '...'` inline.
- Mantener `requireBranchAccess('branchId')` en endpoints que aceptan `branchId` en body o query.
- Emitir eventos WebSocket (`product.updated`, etc.) en los flujos modificados de la misma forma que el service actual (`fanOutProductEvent`).
- Audit logs (`logAuditEvent`) para cada mutación nueva: `product_featured`, `products_reordered`, etc. (nombres a confirmar en el plan).

### 10. OpenAPI y design system

- Después de tocar `packages/shared/src/schemas/products.ts`, regenerar y commitear `apps/backend/openapi.json` con `pnpm --filter @kaipos/backend openapi:generate`. CI `quality` falla si no.
- UI nueva en `apps/frontend-admin/src/`: respetar el design-system boundary — sólo `@kaipos/ui` (no `@mui/material` ni `lucide-react` directo), no literales numéricos para `fontSize`/`fontWeight`/`borderRadius`, spacing vía MUI scale, colores vía `palette.*`/`colors.*`.

## Acceptance Criteria

- [ ] Un producto con 3 grupos de modificadores, cada uno con `maxSelectable` y opciones con horarios, se guarda y se valida; el backend rechaza un ticket que envía más opciones de las permitidas en un grupo (400 con `VALIDATION_ERROR`).
- [ ] Un producto con variantes (S/M/L con `priceDelta` distinto) responde el precio efectivo `price + priceDelta` por variante; el service rechaza variantes con SKU duplicado dentro del mismo producto.
- [ ] El flujo de subida de imágenes (`POST /api/products/upload-url`) sigue funcionando para productos y se puede reusar para `variant.imageUrl`.
- [ ] Un producto con `availabilityWindow` de 11:00–15:00 (timezone de la sucursal) **no** aparece en `GET /api/products?activeNow=true&branchId=X` a las 16:00 locales, pero sí aparece a las 12:00.
- [ ] El filtro `activeNow` y el filtro de canal (`availability.pos`) se combinan con AND.
- [ ] Un admin marca un producto como destacado en la sucursal X (`PATCH /api/products/:id/feature` con `{ branchId: X, featured: true }`); aparece en `GET /api/products?featuredIn=X` y no en `featuredIn=Y`.
- [ ] El unique index `{ businessId, branchId, productId }` en `productPreferences` impide duplicados.
- [ ] Drag-and-drop en `ProductsListPage` reordena productos dentro de una categoría y `PATCH /api/products/reorder` persiste `sortOrder` con `bulkWrite` en una sola operación.
- [ ] `GET /api/products` sin `sort` ordena por `category.sortOrder ASC, product.sortOrder ASC, name ASC`.
- [ ] Búsqueda por `barcode` (prefix, case-insensitive) devuelve resultados respetando RBAC `products:read` y el filtro por `branchId`; el índice parcial se usa (verificar con `explain`).
- [ ] Test de performance: búsqueda sobre 1 000 productos seedeados < 300 ms (mediana, 20 iteraciones) en CI.
- [ ] Productos existentes sin `sortOrder` / `variants` / `availabilityWindow` / `barcode` siguen funcionando (regression test).
- [ ] `apps/backend/openapi.json` regenerado y comiteado.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` verde; sin violaciones del design-system boundary.
- [ ] `pnpm --filter @kaipos/backend db:setup` corre idempotente y crea/actualiza los validators e índices nuevos.

## Out of Scope

- Lógica del POS para forzar selección de variante y aplicar `maxSelectable` en el carrito del cliente (sólo se expone el dato en el API; la UI del POS es un paso aparte).
- Migración de modificadores de embebidos a colección separada (la ticket explícita que se mantienen embebidos).
- Cambios en la colección `categories` (su `sortOrder` ya existe; sólo se consume al ordenar productos).
- Backfill masivo de `barcode` a productos existentes (sólo se agrega como campo opcional).
- Reordenamiento entre categorías (sólo dentro de una categoría).
- Imports masivos de catálogo (CSV/Excel).
- Variantes con su propia gestión de stock separada del producto padre.
- Reportes/analytics de productos destacados.

## Open Questions

- ¿La validación de `maxSelectable` se aplica también al guardar el producto (p. ej., si `maxSelectable > options.length`, rechazar) o sólo cuando llega un ticket del POS? Asumir **ambas** salvo redirección.
- ¿`PATCH /api/products/reorder` debe ser atómico (transacción) o `bulkWrite` no-ordenado es suficiente? Mongo standalone no soporta transacciones; el cluster prod sí. Asumir `bulkWrite` no-ordenado y documentar la limitación.
- ¿El nombre del permiso para `feature/reorder` es `products:write` (existente) o requiere uno nuevo `products:manage`? Asumir `products:write` para evitar añadir tokens nuevos a `Permission`.
- ¿Cómo se expone `effectivePrice` (con variante + modificadores aplicados) en la respuesta del API? ¿Lo calcula el backend en `GET /api/products/:id` o el frontend? Asumir cálculo en el frontend (el backend retorna `price`, `variants[].priceDelta`, `modifierGroups[].options[].priceDelta`).
- ¿El perf test corre en CI con qué Mongo? El test runner local usa Docker Mongo; en CI hace falta confirmar que el `Vitest` integration setup tiene acceso a una Mongo real (no en memoria).

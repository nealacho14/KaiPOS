# Follow-up Tasks

Source: `.specs/NT-34318b91_catalogo-productos-avanzado/`

<!-- Items discovered during implementation planning that are out of scope but worth tracking.
     Each item should explain what and why in one line. -->

- [x] Extract `computeEffectivePrice(product, variantId?, modifierSelections)` into `packages/shared/src/utils/pricing.ts` — POS, kiosk y online checkout van a duplicar este cálculo; centralizarlo evita drift. _(Picked up 2026-05-17 — batch follow-up PR.)_
- [x] Re-evaluate `listProducts?activeNow=true` pagination — el filtro corre post-fetch así que el `total` del paginador es pre-filter; considerar guardar un campo `availabilityMask` indexable o expandir el filtro al query Mongo (con `$expr` y `$dateFromString`) si el set crece. _(Picked up 2026-05-17.)_
- [x] Migrate `productPreferences` JOIN to `$lookup` aggregation — la implementación inicial hace dos `find`s (`featured: true` → `_id $in`); aceptable hasta ~10k destacados por sucursal. _(Picked up 2026-05-17.)_
- [x] Backfill `maxSelectable = options.length` para `modifierGroups` legacy — los docs viejos pasan el validator `moderate` pero un update parcial puede empezar a fallar; un script idempotente cierra el gap. _(Picked up 2026-05-17.)_
- [x] Extend `requireBranchAccess` middleware para soportar lectura desde el body (no sólo query/params) — los endpoints nuevos `reorder` y `feature` necesitan el `branchId` del body; si el middleware actual no lo soporta de forma genérica, hay duplicación de lógica. _(Picked up 2026-05-17.)_
- [x] Index hint o pipeline review para el sort por `category.sortOrder + product.sortOrder + name` — el `$lookup` a `categories` puede no usar índice en la categoría; medir con `explain()` cuando el dataset crezca. _(Picked up 2026-05-17.)_
- [x] Considerar emitir un evento WS `product.featured` distinto a `product.updated` para que la UI optimice qué pestaña refrescar (el toggle del star no necesita refetch completo del producto). _(Picked up 2026-05-17.)_
- [x] Variantes con stock propio — fuera de scope acá, pero la spec lo marca explícitamente; agregar a roadmap si surge necesidad de inventario por talla/color. _(Deferred 2026-05-17 — fuera de scope del batch; pertenece a ticket de inventario.)_
- [x] **[QA finding]** Búsqueda case-insensitive — _resuelto en Phase 4 (`$options: 'i'` añadido a los tres regex de `buildListFilter`)._
- [x] **[QA finding]** Mensaje de error para barcode duplicado — _resuelto en Phase 4 (`duplicateKeyToAppError` inspecciona `keyPattern`/`errmsg` y emite `BARCODE_ALREADY_EXISTS`; UI muestra error inline en el campo `barcode`)._

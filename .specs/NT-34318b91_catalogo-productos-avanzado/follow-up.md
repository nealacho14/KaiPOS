# Follow-up Tasks

Source: `.specs/NT-34318b91_catalogo-productos-avanzado/`

<!-- Items discovered during implementation planning that are out of scope but worth tracking.
     Each item should explain what and why in one line. -->

- [ ] Extract `computeEffectivePrice(product, variantId?, modifierSelections)` into `packages/shared/src/utils/pricing.ts` — POS, kiosk y online checkout van a duplicar este cálculo; centralizarlo evita drift.
- [ ] Re-evaluate `listProducts?activeNow=true` pagination — el filtro corre post-fetch así que el `total` del paginador es pre-filter; considerar guardar un campo `availabilityMask` indexable o expandir el filtro al query Mongo (con `$expr` y `$dateFromString`) si el set crece.
- [ ] Migrate `productPreferences` JOIN to `$lookup` aggregation — la implementación inicial hace dos `find`s (`featured: true` → `_id $in`); aceptable hasta ~10k destacados por sucursal.
- [ ] Backfill `maxSelectable = options.length` para `modifierGroups` legacy — los docs viejos pasan el validator `moderate` pero un update parcial puede empezar a fallar; un script idempotente cierra el gap.
- [ ] Extend `requireBranchAccess` middleware para soportar lectura desde el body (no sólo query/params) — los endpoints nuevos `reorder` y `feature` necesitan el `branchId` del body; si el middleware actual no lo soporta de forma genérica, hay duplicación de lógica.
- [ ] Index hint o pipeline review para el sort por `category.sortOrder + product.sortOrder + name` — el `$lookup` a `categories` puede no usar índice en la categoría; medir con `explain()` cuando el dataset crezca.
- [ ] Considerar emitir un evento WS `product.featured` distinto a `product.updated` para que la UI optimice qué pestaña refrescar (el toggle del star no necesita refetch completo del producto).
- [ ] Variantes con stock propio — fuera de scope acá, pero la spec lo marca explícitamente; agregar a roadmap si surge necesidad de inventario por talla/color.

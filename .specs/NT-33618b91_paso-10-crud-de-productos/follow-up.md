# Follow-up Tasks

Source: `.specs/NT-33618b91_paso-10-crud-de-productos/`

<!-- Items discovered during implementation that are out of scope but worth tracking.
     Each item should explain what and why in one line. -->

- [ ] **Extraer `buildScopeFilter` + `resolveTargetBusinessId` a un helper compartido** — `services/users.ts` y `services/products.ts` van a duplicar exactamente la misma lógica de scoping multi-tenant (super_admin bypass + `MISSING_TARGET_BUSINESS_ID` + rechazo de sentinel `'*'`). Con una tercera colección el patrón se afianza como copia-pega; candidato a `src/lib/tenant-scope.ts`.
- [ ] **Extraer `LoadingTable` / skeleton de tabla** — `UsersListPage.tsx` y `ProductsListPage.tsx` tendrán componentes `<LoadingTable />` casi idénticos (6 filas, columnas variables, `Skeleton variant="text"` y `variant="rounded"`). Tras el segundo caller, deepenear en un componente `<TableSkeleton columns={...} rows={6} />` en `src/components/`.
- [ ] **Extraer `mapError` de `ApiError` a un helper reutilizable** — cada página replica el switch por `err.status` (401/403/TypeError/default) con mensajes en español. Un `mapApiErrorToSpanish(err, resourceLabel)` en `src/lib/api-errors.ts` evita divergencia de copy.
- [ ] **Mover `escapeRegex` a `packages/shared/src/utils` si aparece un segundo caller** — `listProducts` va a necesitar escapar `q` para el `$regex`. Si otro servicio (orders, users) adopta el mismo patrón de búsqueda, promover el helper del inline a `@kaipos/shared/utils`.
- [ ] **Derivar `category` del filtro desde la colección `categories`** — hoy el `Select` de categoría del frontend se arma con `unique(products.map(p => p.category))`, lo que falla cuando la lista está vacía y mezcla categorías "activas" con "sólo referenciadas por productos inactivos". Cuando el CRUD de categorías exista, el dropdown debería consultar `GET /api/categories`.
- [ ] **Migrar `Product.category` de string a FK a `categories._id`** — decisión explícita de Paso 10 de mantener string para no arrastrar migración; rastrear aquí para que no se olvide cuando el dominio de categorías madure (búsquedas por categoría fallarán silenciosamente si el string del producto se renombra en `categories`).
- [ ] **Reemplazar `window.confirm` para borrar producto por un `<Dialog>` de confirmación** — Paso 10 usa `window.confirm` para simplicidad; en móvil el diálogo nativo es inconsistente y no se puede estilar. Un `ConfirmDialog` reusable en `@kaipos/ui` serviría a productos + usuarios + futuro.
- [ ] **Subida real de `imageUrl` a `AssetsStack` (S3)** — el plan sólo acepta `imageUrl` como string arbitrario; el spec lo marca out-of-scope. Cuando se implemente, el campo ya está en el tipo y validador.

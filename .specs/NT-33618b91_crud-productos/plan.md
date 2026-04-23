# Plan: Paso 10 — CRUD de Productos (Primer Feature E2E)

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Notion Ticket  | [NT-33618b91](https://notion.so/33618b913fdd81ec8013f6156d9b275f) |
| Spec           | `.specs/NT-33618b91_crud-productos/spec.md`                       |
| Feature Branch | `NT-33618b91/crud-productos/feature`                              |
| Target         | `main`                                                            |

<!-- Multi-phase sequential plan. Phases are stacked — each targets the previous phase's branch.
     Phase 1 branch targets the feature branch; subsequent phases target the previous phase.
     Use `/kaipos.implement` to implement one phase at a time. -->

## Decisions locked during planning

- **AssetsStack servicing strategy**: Option (a) — add a dedicated public CloudFront distribution in front of `kaipos-assets-prod` with `/products/*` cached behavior. Menu images are public by nature (the online menu will serve them without auth). Pre-signed read URLs (option b) rejected to avoid per-render signing cost on the POS/kiosk.
- **409 error shape for duplicate SKU**: `{ code: 'SKU_ALREADY_EXISTS', field: 'sku' }` in the `ApiError` body so the frontend can map it inline on the SKU field. This establishes the convention for future field-level 409s.
- **`DELETE /api/products/:id` returns `204 No Content`** (REST convention). Existing `users` deactivation is a `PATCH` so not directly comparable; products get a proper `DELETE` verb with soft-delete semantics under the hood.
- **Zod schemas are NOT exported from `@kaipos/shared`** in Paso 10. Backend owns authoritative validation in `apps/backend/src/schemas/products.ts`; the frontend does minimal client-side validation (required-field checks) and trusts the server. Sharing schemas tracked as a follow-up.
- **Kitchen stations empty state in form**: render the "Ruta en cocina" card with an `EmptyState` hint (`"No hay estaciones de cocina configuradas para esta sucursal"`) and a link to `/kitchen-stations?branchId=<active>`. No inline creation.

## Phase 1: Data foundation — shared types, DB validator, indexes, seed

**Branch**: `NT-33618b91/crud-productos/data-foundation`
**Targets**: `NT-33618b91/crud-productos/feature`

### Tasks

- [x] Extend `packages/shared/src/types/index.ts`:
  - Add `Allergen`, `DietaryTag`, `StockUnit`, `ServiceSchedule` string-literal union types (exact enums from spec).
  - Add `ProductAvailability` (`{ pos: boolean; online: boolean; kiosk: boolean }`), `ModifierOption` (`{ id, label, priceDelta }`), `ModifierGroup` (`{ id, name, required, options }`).
  - Extend `Product` with: `branchId`, `imageUrl?`, `cost?`, `taxRate?`, `trackStock`, `lowStockThreshold?`, `stockUnit`, `availability`, `serviceSchedules`, `allergens`, `dietaryTags`, `modifierGroups`, `kitchenStationIds`.
- [x] Re-export the new types from `packages/shared/src/index.ts` (no subpath split; they live on the root types index).
- [x] Update `apps/backend/src/db/setup.ts` `products` entry:
  - Add `branchId` to `required` and `properties`.
  - Add the new optional + required fields to `properties` with correct `bsonType` (arrays use `bsonType: 'array'` with `items` shape for the embedded `modifierGroups`, `kitchenStationIds`, enums).
  - **Drop** indexes `{ businessId: 1, sku: 1 }` (unique) and `{ businessId: 1, category: 1, isActive: 1 }`.
  - **Create** `{ branchId: 1, sku: 1 }` unique, `{ branchId: 1, category: 1, isActive: 1 }`, `{ businessId: 1, branchId: 1 }`.
  - Confirm `collMod` + `createIndex` path is idempotent for the added/removed indexes (log warnings are acceptable; runs should succeed on a second invocation).
- [x] Update `apps/backend/src/db/seed.ts` products block:
  - Add `branchId: 'branch_seed_001'` and defaults for every new required field (`trackStock: true, stockUnit: 'unit', availability: { pos: true, online: false, kiosk: false }, serviceSchedules: [], allergens: [], dietaryTags: [], modifierGroups: [], kitchenStationIds: []`) to each of the 10 seeded products.
  - Keep the Atlas guard (`MONGO_SECRET_ARN` / `mongodb+srv://`) and the "skip if business exists" idempotency.
- [x] Run `pnpm --filter @kaipos/backend db:setup` locally to verify the validator applies cleanly, then re-seed and spot-check one document in Mongo to confirm shape.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] Manual verification: `pnpm --filter @kaipos/backend db:setup` runs twice without error; `pnpm --filter @kaipos/backend db:seed` completes and a sample seeded product in Mongo Compass shows the new fields.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 2: Backend API — routes, services, schemas, pre-signed upload, tests

**Branch**: `NT-33618b91/crud-productos/backend-api`
**Targets**: `NT-33618b91/crud-productos/data-foundation`

### Tasks

- [x] Add deps to `apps/backend/package.json`: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (matching ^3.693.0 range used by siblings). Update `tsup.config.ts` externals if needed (should stay external — Lambda runtime bundles no S3 client, but our config already externalizes `@aws-sdk/*`; verify and note).
- [x] Create `apps/backend/src/schemas/products.ts`:
  - `createProductSchema` — required `branchId`, `name`, `description`, `price`, `category`, `sku`, `stock`, with all new fields (enum-validated via `z.enum`), defaults applied per spec.
  - `updateProductSchema` — `createProductSchema.partial().omit({ branchId: true })` (branchId not editable).
  - `listProductsQuerySchema` — `branchId` required, optional `q`, `category`, `includeInactive` (coerced boolean), `businessId` (super_admin cross-tenant).
  - `uploadUrlSchema` — `{ branchId, contentType: z.enum(['image/jpeg','image/png','image/webp']), fileSize: z.number().int().positive().max(2 * 1024 * 1024) }`.
  - `productIdParamSchema` — `{ id: z.string().uuid() }` (align with `users.ts` convention).
- [x] Create `apps/backend/src/services/products.ts`:
  - `listProducts(actor, query)` — resolves businessId (super_admin via `query.businessId`), `assertBranchAccess`, builds `{ businessId, branchId, ... }` filter, applies `q` as `$or` regex over `name`/`sku` (case-insensitive, Mongo `$regex` + `$options: 'i'`), `category` filter, `isActive: true` unless `includeInactive`. Returns array.
  - `getProductById(actor, id)` — finds by `_id`, then validates branch + tenant from the loaded doc; cross-tenant or cross-branch → `NotFoundError` (no audit, don't leak existence).
  - `createProduct(actor, input)` — `assertBranchAccess(actor, input.branchId)` inline, validate `kitchenStationIds` against `kitchen-stations` collection (each must match `branchId + businessId`; if not, throw `ValidationError` with `field: 'kitchenStationIds'`), check SKU uniqueness via `{ branchId, sku }` query (Mongo unique index is the authoritative gate, but pre-check for clean 409 with `{ code: 'SKU_ALREADY_EXISTS', field: 'sku' }`), insert, `logAuditEvent({ action: 'product_created', ... })`.
  - `updateProduct(actor, id, input)` — load doc (404 on miss), validate branch + tenant; if cross-branch/cross-tenant mutation → `logAuditEvent({ action: 'authorization_failed', metadata: { branchId, route, method } })` + 403. Validate `kitchenStationIds` if present. Re-check SKU uniqueness if SKU is changing. Apply `$set`, return updated doc.
  - `deleteProduct(actor, id)` — same validation pattern; `$set: { isActive: false, updatedAt: now() }`. Return void (route handler sends 204).
  - `generateUploadUrl(actor, input)` — `assertBranchAccess`, validate `ASSETS_BUCKET_NAME` env (503 with code `ASSETS_NOT_CONFIGURED` if missing — supports local dev), build key `products/<branchId>/<crypto.randomUUID()>.<ext from contentType>`, call `getSignedUrl(new PutObjectCommand({ Bucket, Key, ContentType, ContentLength }), { expiresIn: 60 })`. Compute `publicUrl` as `https://<ASSETS_CDN_DOMAIN>/<key>`. Return `{ uploadUrl, publicUrl, expiresIn: 60 }`. Fallback `publicUrl = uploadUrl`'s origin if `ASSETS_CDN_DOMAIN` not set (document behavior).
  - All DB writes bump `updatedAt` to `new Date()`.
- [x] Create `apps/backend/src/routes/products.ts`:
  - `POST /api/products/upload-url` → `requireAuth`, `requirePermission('products:write')`, `validate({ body: uploadUrlSchema })`, handler calls `generateUploadUrl`, returns 201 with `{ success: true, data }`.
  - `GET /api/products` → `requireAuth`, `requirePermission('products:read')`, `validate({ query: listProductsQuerySchema })`, `requireBranchAccess('branchId')` (middleware reads from query), handler.
  - `GET /api/products/:id` → `requireAuth`, `requirePermission('products:read')`, `validate({ params: productIdParamSchema })`. Branch check is inside the service (needs the doc).
  - `POST /api/products` → `requireAuth`, `requirePermission('products:write')`, `validate({ body: createProductSchema })`, handler returns 201.
  - `PATCH /api/products/:id` → `requireAuth`, `requirePermission('products:write')`, `validate({ params, body: updateProductSchema })`, handler returns 200.
  - `DELETE /api/products/:id` → `requireAuth`, `requirePermission('products:delete')`, `validate({ params })`, handler returns 204 No Content (no body).
- [x] Mount in `apps/backend/src/app.ts`: `import productsRoutes from './routes/products.js'` and `app.route('/', productsRoutes);` alongside the existing routes.
- [x] Read `ASSETS_BUCKET_NAME` and `ASSETS_CDN_DOMAIN` env vars in the upload service. Document in `apps/backend/.env.example` (create if missing) + root `CLAUDE.md`'s "Environment Variables" section (append two lines).
- [x] Tests — `apps/backend/src/services/products.test.ts`:
  - Multi-tenant: cross-business `getById`/`list`/`update`/`delete` → 404 (read) / 403+audit (mutate).
  - Multi-branch: cashier assigned to branch A cannot read/mutate branch B → 404 / 403+audit.
  - Permission denial: cashier calling `createProduct` → 403 + audit (simulated via middleware in route tests; service test covers `assertBranchAccess` branch).
  - Soft delete: doc persists with `isActive: false`; `includeInactive: true` returns it; default does not.
  - Search: `q=arroz` matches by name and SKU, case-insensitive.
  - Filter: `category=Entradas` scopes correctly.
  - SKU uniqueness: same SKU in same branch → 409 with `{ code: 'SKU_ALREADY_EXISTS', field: 'sku' }`; same SKU across branches → allowed.
  - Super_admin cross-tenant via `query.businessId`; admin with `branches:manage` operates on any branch.
  - `kitchenStationIds` validation: id from another branch → `ValidationError` with field `kitchenStationIds`.
- [x] Tests — `apps/backend/src/routes/products.test.ts`:
  - HTTP codes: 201 create, 200 read/list/update, 204 delete.
  - `requireBranchAccess` gating on `GET /api/products`.
  - `assertBranchAccess` inline on `POST` (mock service to throw `ForbiddenError`).
  - Upload-url: 201 with expected shape; 400 on bad `contentType`; 400 on `fileSize > 2MB`; 403 + audit if caller lacks `products:write` (handled by middleware).
  - Follow the users.routes.test.ts fixture pattern (mock `verifyAccessToken`, service functions, `logAuditEvent`, logger; use `withToken(payload)` helper).

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm --filter @kaipos/backend test` passes (new products tests + no regressions)
- [x] Manual verification via curl or HTTP client against `pnpm dev`: admin can create/list/edit/soft-delete a product; cashier gets 403 on create with audit log row visible in `auditLogs` collection.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 3: Frontend — shared primitives (icons, BranchSelector, useActiveBranch, sidebar entry)

**Branch**: `NT-33618b91/crud-productos/frontend-shared`
**Targets**: `NT-33618b91/crud-productos/backend-api`

### Tasks

- [x] Extend `@kaipos/ui` icon re-exports (`packages/ui/src/components/index.ts` or `packages/ui/src/icons/index.ts` — follow the existing re-export style): `Package`, `Edit` (or `Pencil`), `Trash2`, `Plus`, `Upload`, `X`, `ChevronRight`, `Check`, `ImageIcon`. Match the existing Lucide re-export pattern (named re-export, no aliasing unless the Lucide name collides with an MUI component).
- [x] Create `apps/frontend-admin/src/hooks/useActiveBranch.ts`:
  - Signature: `useActiveBranch(): { branchId: string | null; setBranchId: (id: string) => void; branchIds: string[]; canManage: boolean }`.
  - Sources: `useAuth().user` for `branchIds` and role; `hasPermission(role, 'branches:manage')` for `canManage`.
  - Persistence: `sessionStorage` under `kaipos.activeBranchId`, with URL `?branchId=` sync via `useSearchParams` when the hook is used in pages that put branch in the URL. Hook accepts an options arg `{ syncToSearchParam?: boolean }` defaulting to `false`.
  - Auto-select single branch when `branchIds.length === 1 && !canManage`.
- [x] Create `apps/frontend-admin/src/components/BranchSelector.tsx`:
  - Props: `value: string | null`, `onChange: (branchId: string) => void`.
  - On mount, fetch `/api/branches` (admin/super_admin see all; others see only those in `user.branchIds`). If the endpoint does not already exist under `/api/branches`, fall back to the user's `branchIds` and display them as simple ids (document as a follow-up; do not build a new branches endpoint here — out of scope).
  - Renders `@kaipos/ui` `Select` with branch names. When `branchIds.length === 1 && !canManage`, render a readonly `Chip` with the branch name instead of a `Select`.
  - Emits `onChange` immediately; parent persists via `useActiveBranch`.
- [x] Add `Productos` entry to `apps/frontend-admin/src/components/Sidebar.tsx`: `{ label: 'Productos', to: '/products', icon: Package, permission: 'products:read' }`. Position between Dashboard and Usuarios (or per existing order convention).
- [x] Create `apps/frontend-admin/src/lib/products-api.ts` (optional thin helper). Purpose: typed wrappers around `apiJson` for list/get/create/update/delete/uploadUrl. Keep thin — one function per endpoint, exports the `ProductsApiError` mapping for `SKU_ALREADY_EXISTS` handling.
- [x] No route wiring yet — the list and form pages land in Phase 4/5.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [ ] Manual verification: sidebar shows the "Productos" item for an admin user in `pnpm dev`; clicking it currently 404s (no route yet — that's expected, will be added next phase).
- [x] `rg "from '@mui/material" apps/frontend-admin/src` → zero matches (no regressions).
- [x] `rg "from 'lucide-react'" apps/frontend-admin/src` → zero matches.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 4: Frontend — Products list page

**Branch**: `NT-33618b91/crud-productos/products-list`
**Targets**: `NT-33618b91/crud-productos/frontend-shared`

### Tasks

- [x] Create `apps/frontend-admin/src/pages/ProductsListPage.tsx` mirroring the `UsersListPage` state machine (`loading | error | success`).
- [x] Header row: local `PageHeader` with title "Productos" + subtitle; right-aligned `BranchSelector`; "Nuevo producto" primary button (visible only with `products:write`) navigating to `/products/new?branchId=<active>`.
- [x] Controls row: debounced `TextField` for `q` (300ms via a small local debounce helper or `useEffect` + `setTimeout`; don't add a new dep), `Select` for `category` (options = distinct categories from the current result set), `Checkbox` for `includeInactive` (visible with `products:write`).
- [x] Table columns: Imagen (thumb 40×40 via `<img>` with `imageUrl` fallback placeholder), Nombre, SKU (mono), Categoría (Chip), Precio (right-aligned, mono, via `formatCurrency` from `@kaipos/shared/utils`), Estado (Chip Activo/Inactivo), Acciones (edit button → `/products/:id/edit` if `products:write`; delete button with confirm dialog if `products:delete`).
- [x] Delete flow: `@kaipos/ui` `Dialog` confirm → call `DELETE /api/products/:id` → optimistic remove from list (or refetch). On error, show `Alert`.
- [x] Empty state: `EmptyState` component with `Inbox` icon when the filtered list is empty.
- [x] Error state: `Alert severity="error"` with `mapError()`-translated message + "Reintentar" button.
- [x] Route wiring in `apps/frontend-admin/src/App.tsx`: add `<Route element={<RequirePermission permission="products:read" />}><Route path="/products" element={<ProductsListPage />} /></Route>` inside the `AppLayout` block.
- [x] Handle "no active branch" gracefully: if `useActiveBranch().branchId` is null (user has zero branches), render an `Alert` prompting contact to admin; do not call the list endpoint.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [ ] Manual verification in `pnpm dev`: navigate to `/products` as admin (seed user). See 10 seeded products. Search by name filters the table. Toggle `includeInactive` shows/hides soft-deleted rows. Switch branch (needs a second seeded branch, optional) → list refetches. Delete a product → row disappears; `includeInactive` brings it back.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 5: Frontend — Product form page (create + edit + image upload)

**Branch**: `NT-33618b91/crud-productos/products-form`
**Targets**: `NT-33618b91/crud-productos/products-list`

### Tasks

- [x] Create `apps/frontend-admin/src/pages/ProductFormPage.tsx`. Single file handles both `new` (no `:id`) and `edit` (`:id`) modes by reading `useParams().id`.
- [x] Top bar: breadcrumb `← Productos / <Categoría> / <Nombre | Nuevo producto>`; status label "Borrador · guardado hace Xs" (static, with `// TODO: real auto-save` comment); disabled "Vista previa" and "Guardar borrador"; primary "Publicar producto" button.
- [x] Layout: two columns on ≥md — left column stacks the form Cards; right column is a sticky sidebar. On `<md`, collapse to single column (sidebar moves below the form).
- [x] Left column cards (all built from `@kaipos/ui` primitives):
  - **Información básica**: Name (`TextField`), Category (`Select` with existing categories from the branch's current list + "+ Crear nueva" option that swaps the select for a `TextField`), SKU (monospace `TextField`, auto-filled from `<CAT>-<3LETRAS-NAME>-<001>` pattern on first name/category change when empty; stays editable after), Short description (`TextField` multiline).
  - **Precio y costos**: Price (`TextField` type=number with `$` adornment), Cost (`TextField` type=number with `$` adornment, optional), IVA (`TextField` type=number with `%` adornment, optional). Below, a green info card shows `Margen: XX%` and `Ganancia por unidad: $X.XX` computed client-side; hidden when `price === 0` or `cost` empty.
  - **Inventario**: `Switch` for `trackStock`. When on: Stock (`TextField` int), Alerta en (`TextField` int for `lowStockThreshold`), Unidad (`Select` for `stockUnit`).
  - **Modificadores**: dynamic list of `ModifierGroup`. Each group card has name field, `Switch` for required/optional, list of options (label + priceDelta number), "+ Opción" button. "+ Grupo nuevo" button at bottom. Use `crypto.randomUUID()` for group/option ids client-side. No drag-and-drop (TODO marker with `⋮⋮` icon visible but non-functional).
  - **Etiquetas y alérgenos**: Two chip groups. Allergens = static enum (9 chips, toggleable). Dietary tags = static enum (6 chips, toggleable).
- [x] Right sticky sidebar:
  - **Vista en POS**: small card reading form state in real time. Shows name, price (via `formatCurrency`), and allergen chips (rendered small) when any allergen is selected. Placeholder thumbnail until image uploaded.
  - **Disponibilidad**: three `Switch` rows (POS, Online, Kiosko) bound to `availability`. Service schedule: three chips (Desayuno/Almuerzo/Cena) toggleable, bound to `serviceSchedules`.
  - **Imagen**: dropzone `<div>` that also accepts click → hidden `<input type="file">`. On select, validate MIME in `{image/jpeg,image/png,image/webp}` and size `≤ 2 MB`. If valid: `POST /api/products/upload-url` → PUT file to `uploadUrl` with `Content-Type` header → set `imageUrl` to `publicUrl`. Show thumbnail when set; "Remover" button clears `imageUrl`. On validation fail or upload error, show inline `Alert`.
  - **Ruta en cocina**: fetch `/api/kitchen-stations?branchId=<active>` on mount / when branch changes. Render chips (multi-select). If empty: `EmptyState` with link to `/kitchen-stations?branchId=<active>`.
- [x] Edit mode: on mount, `GET /api/products/:id`; hydrate form state; render `branchId` as a readonly `Chip` labeled "Sucursal: <name>" (branch name comes from the `BranchSelector`'s branch list or the `business.branches` cache — if not available, show the id).
- [x] Submit handler:
  - Client-side required-field check (name, price, category, sku, branchId).
  - `POST /api/products` (create) or `PATCH /api/products/:id` (edit).
  - On success, navigate to `/products?branchId=<branchId>`.
  - On 409 with `{ code: 'SKU_ALREADY_EXISTS', field: 'sku' }`: set an inline error on the SKU field ("Este SKU ya existe en esta sucursal").
  - On 403: top-of-form `Alert` "No tienes permiso para publicar productos en esta sucursal.".
  - On validation errors (`VALIDATION_ERROR` from backend): map `details[].field` to per-field inline errors.
  - Generic errors: top-of-form `Alert` with `mapError` output.
- [x] Route wiring: add two protected routes in `App.tsx` nested under `RequirePermission permission="products:read"`, each wrapped in a second `RequirePermission permission="products:write"`:
  - `/products/new` → `<ProductFormPage mode="new" />` (or read mode from absent `:id`)
  - `/products/:id/edit` → `<ProductFormPage mode="edit" />`

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `rg "from '@mui/material" apps/frontend-admin/src` → zero matches
- [ ] Manual verification (golden path): in `pnpm dev` as admin seed user, go to `/products/new?branchId=branch_seed_001`, fill name/category/price, publish → redirected to list, new row present; click Edit → fields hydrated; change price, publish → list reflects new price; delete from list → disappears, reappears with `includeInactive`.
- [ ] Manual verification (image upload, requires infra phase deployed OR local `ASSETS_BUCKET_NAME` unset → verify graceful 503 flow with a visible error banner).
- [ ] Manual verification (negative): cashier seed user sees `/products` list but no "Nuevo producto" button and no edit/delete actions; attempting to navigate directly to `/products/new` redirects to `/products`.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 6: Infrastructure — public assets CloudFront, narrower IAM, CORS

**Branch**: `NT-33618b91/crud-productos/infra-assets`
**Targets**: `NT-33618b91/crud-productos/products-form`

### Tasks

- [ ] Update `infra/lib/assets-stack.ts`:
  - Add `cors` array to the `s3.Bucket` constructor: one rule with `allowedMethods: [s3.HttpMethods.PUT]`, `allowedOrigins: [<frontend distribution URL>, 'http://localhost:3000', 'http://localhost:3001']`, `allowedHeaders: ['*']`, `maxAge: 300`.
  - Add a `cloudfront.Distribution` (or extend if one exists) with:
    - Default behavior: 403/404 (just a placeholder so the distribution has a sensible root).
    - `/products/*` additional behavior: S3 origin = `kaipos-assets-prod` with `S3OriginAccessControl` (or legacy OAI if cleaner), `CACHING_OPTIMIZED` policy, `viewerProtocolPolicy: REDIRECT_TO_HTTPS`.
  - Grant the CloudFront distribution read access to the bucket (bucket policy statement scoped to the distribution's service principal).
  - Export two new `CfnOutput`s: `AssetsCdnDomain` (distribution domain) and confirm `AssetsBucketName` already present.
- [ ] Update `infra/lib/api-stack.ts`:
  - Replace `assetsBucket.grantReadWrite(apiFunction)` (if that is the current call — confirm from code) with narrower grants:
    - `apiFunction.addToRolePolicy(new iam.PolicyStatement({ actions: ['s3:PutObject'], resources: [\`\${assetsBucket.bucketArn}/products/\*\`] }))`
    - `apiFunction.addToRolePolicy(new iam.PolicyStatement({ actions: ['s3:GetObject'], resources: [\`\${assetsBucket.bucketArn}/products/\*\`] }))` (optional — not needed if we don't read from the Lambda; delete this line if unused).
  - Inject env var `ASSETS_CDN_DOMAIN` (from new CfnOutput, cross-stack via prop) alongside existing `ASSETS_BUCKET_NAME`.
- [ ] Update `infra/lib/config.ts` if needed to carry the assets CDN config (only if anything stage-specific is required; otherwise rely on CDK's auto-generated distribution domain).
- [ ] Update `infra/bin/infra.ts` to pass the new output from AssetsStack to ApiStack (extend the existing cross-stack reference pattern).
- [ ] Document in `infra/DEPLOYMENT.md` (append a short "Assets CDN" section): the new distribution, CORS allowlist, and that `ASSETS_CDN_DOMAIN` is injected into the api Lambda automatically.
- [ ] `pnpm --filter @kaipos/infra build` (or equivalent CDK synth command) to verify the template compiles; `cdk synth -c stage=prod` without errors.
- [ ] **No automatic deploy** — deployment is a manual user step after review. Plan the deploy order: run `pnpm deploy:prod:api` (which deploys AssetsStack → ApiStack per dependency graph), then confirm the new CfnOutput is visible, then `pnpm deploy:prod:frontend` to pick up any bundled changes.

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds
- [ ] `pnpm --filter @kaipos/infra exec cdk synth -c stage=prod` succeeds without errors
- [ ] Manual verification (post-deploy, staged carefully): image upload from `/products/new` works end-to-end against prod; the `publicUrl` resolves via the new CloudFront distribution; unauthorized direct PUT (without pre-signed URL) is rejected by S3.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

End-to-end verification once all phases are merged. Use the admin seed user (`admin@lacocinadekai.com` / `admin123`) unless noted.

- [ ] **Golden path — create**: `/products` → "Nuevo producto" → fill every section (name, category "Postres" (new), SKU default, price, cost, IVA, trackStock on with threshold, allergens {peanut, gluten}, dietary {vegetarian}, one ModifierGroup with two options, availability {pos+online}, serviceSchedule {lunch}, upload a 1 MB JPG, pick one kitchen station). Publish. List shows the new product with image thumb, price, category.
- [ ] **Golden path — edit**: open the new product; change price and add an allergen; publish. List reflects the new price; margin info recomputes live during edit.
- [ ] **Golden path — soft delete**: delete from list; row disappears; toggle `includeInactive`; row reappears with `Inactivo` chip.
- [ ] **Multi-branch**: log in as a cashier assigned to branch A; confirm only branch-A products are listed; `/products/:id` for a branch-B product → 404. `/products/new?branchId=<branchB>` direct navigation → 403 banner.
- [ ] **Multi-tenant**: super_admin can switch businesses via `?businessId=`; regular admin cannot (422/403 or the query param is ignored).
- [ ] **RBAC cashier**: sidebar shows Productos; list loads; no "Nuevo producto" / edit / delete buttons. Direct PATCH via curl with cashier token → 403 and an `authorization_failed` row in `auditLogs`.
- [ ] **RBAC manager**: can create/edit but `DELETE` returns 403 + audit log.
- [ ] **SKU uniqueness**: create two products with same SKU in same branch → second attempt shows inline "Este SKU ya existe en esta sucursal". Same SKU across two branches → both succeed.
- [ ] **Search**: `q=arroz` returns the Arroz con Pollo seed product and any SKU starting with ARR.
- [ ] **Category filter**: selecting "Entradas" scopes the table to Entradas rows only.
- [ ] **`includeInactive`**: default list excludes soft-deleted; toggle reveals them.
- [ ] **Kitchen station cross-branch guard**: POST with `kitchenStationIds` from another branch → 400 with `ValidationError` citing the field.
- [ ] **Image validation**: try uploading a 3 MB PNG → client-side rejection message; try uploading a PDF → rejected.
- [ ] **Upload flow**: successful upload writes to `s3://kaipos-assets-prod/products/<branchId>/<uuid>.<ext>`; `publicUrl` renders as thumb in list + POS preview.
- [ ] **Lint/Type/Test gate**: `pnpm lint && pnpm typecheck && pnpm --filter @kaipos/backend test` all green on the feature branch tip.
- [ ] **UI boundary**: `rg "from '@mui/material" apps/frontend-admin/src` and `rg "from 'lucide-react'" apps/frontend-admin/src` → zero matches.
- [ ] **Mockup parity (visual spot-check)**: `/products/new` matches the two-column layout, card grouping, and teal/slate palette of `kaiPos (2)/kaiPOS - Crear producto.html` with no MUI default theming leaking through.

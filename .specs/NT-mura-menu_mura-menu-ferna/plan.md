# Plan: Menú de Mura en KaiPOS para Ferna

| Field          | Value                                             |
| -------------- | ------------------------------------------------- |
| Notion Ticket  | NT-mura-menu (sin página Notion)                  |
| Spec           | `.specs/NT-mura-menu_mura-menu-ferna/spec.md`     |
| Feature Branch | `NT-mura-menu/mura-menu-ferna/feature`            |
| Target         | `main`                                            |

<!-- Multi-phase parallel plan. Fases 1, 2 y 3 son independientes y se implementan en worktrees
     separados. La fase 4 espera a que 2 y 3 estén mergeadas en la feature branch. -->

<!-- Decisiones arquitectónicas (fijadas en planificación):
  - El menú es un módulo de datos puro `apps/backend/src/db/seed-data/mura-menu.ts` consumido por
    `seedData`. La idempotencia pasa de slug `la-cocina-de-kai` a slug `mura`.
  - El purge de Atlas es un script explícito `db:purge-business` (dry-run por defecto, `--yes` para
    ejecutar), nunca dentro de `db:seed-atlas`.
  - Migración de kelvin = copiar `passwordHash` del doc existente (otro business) ANTES del purge; el
    índice único de users es `{businessId, email}` así que ambos docs coexisten.
  - Placeholder de imagen: WebP estático commiteado, subido una vez por el operador a
    `s3://kaipos-assets-prod/products/<branchId>/placeholder.webp`; el seed solo referencia la URL
    (`MURA_IMAGE_BASE_URL` override). El seed nunca toca S3.
  - `product.sku` es el slug de Ferna: skus kebab-case. Categorías con `_id` fijo. Alcohol con
    `availability.online: false`. Sin campo `slug` nuevo en el modelo.
  - Límite de upload 10 MB exportado desde `@kaipos/shared` (`MAX_UPLOAD_SIZE_BYTES`,
    `UPLOAD_CONTENT_TYPES`); compresión en un único helper del admin usado por ambos pickers.
-->

## Phase Status

| Phase   | Slug                       | Status  | Depends on       | Unblocks |
| ------- | -------------------------- | ------- | ---------------- | -------- |
| Phase 1 | `upload-limit-compression` | done    | none             | —        |
| Phase 2 | `mura-seed-data`           | done    | none             | Phase 4  |
| Phase 3 | `purge-business-script`    | done    | none             | Phase 4  |
| Phase 4 | `ferna-contract-cutover`   | docs done, prod cutover pending | Phase 2, Phase 3 | —        |

## Dependency Graph

```
Phase 1 ─────────────────────────────── (independiente)
Phase 2 ──┐
          ├──→ Phase 4
Phase 3 ──┘
```

## IDs fijos (patrón `00000000-0000-4000-8000-NNNNNNNNNNNN`)

- business Mura `…000000001000` (slug `mura`, COP) · branch "Alianza Colombo-Francesa" `…000000001100`
- users `…000000001301` admin@mura.co · `…000000001302` kelvin.hernandezc30@gmail.com
- categories `…0000000020NN` (01 Filtrados, 02 Café, 03 Ice, 04 Cold Brew, 05 Frappé, 06 Tés, 07 Jugos,
  08 Fizz, 09 Otros, 10 Cervezas, 11 Desayunos, 12 Bowls, 13 All Day)
- products `…0000000030NN` (01–64 en orden del docx) · productPreferences `…0000000040NN`

## SKUs canónicos (= slugs de Ferna)

- filtrados: filtrado-lavado, filtrado-honey, filtrado-natural
- cafe: espresso, americano, macchiato, cappuccino, carpaccio, mocaccino, latte, flat-white, chocolate, affogato
- ice: ice-latte, ice-cappuccino, vietnamese, ice-mocaccino
- cold-brew: cold-brew, lupin, tropico, etiopia, pistachio-cream
- frappe: frappe-clasico, oreo-mocca-crumble, nutcaramel, frappe-milo
- tes: masala-chai, ice-chai, dirty-chai, infusion, matcha, ice-matcha-latte, dirty-matcha, caribe-matcha, matcha-temporada
- jugos: jugo-naranja, jugo-temporada, limonada-coco · fizz: limonada-toria, cordial
- otros: agua, agua-con-gas, coca-cola, coca-cola-zero · cervezas: stella-artois, tumbao, club-colombia, copa-de-vino
- desayunos: parfait, granola, huevos-estrellados, omelette · bowls: bowl-lomo, bowl-pollo, bowl-pulled-pork, ensalada-de-la-casa
- all-day: sandwich-pulled-pork, sandwich-clasico, huevos-tocineta, pollo-coleslaw, sandwich-avellana, salchipan, burger, choripan
- Featured: flat-white, tropico, dirty-chai, burger, filtrado-lavado.

---

## Phase 1: Upload 10 MB + compresión en cliente

**Branch**: `NT-mura-menu/mura-menu-ferna/upload-limit-compression`
**Base**: `NT-mura-menu/mura-menu-ferna/feature`
**Depends on**: none

### Tasks

- [x] `packages/shared/src/schemas/products.ts`: `export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024`
      (reemplaza `MAX_UPLOAD_SIZE`) y `export const UPLOAD_CONTENT_TYPES = uploadContentTypeEnum.options`.
- [x] Test en `packages/shared/src/schemas/products.test.ts`: `uploadUrlSchema` acepta 10 MB, rechaza 10 MB + 1.
- [x] `pnpm --filter @kaipos/backend openapi:generate` y commit de `apps/backend/openapi.json`.
- [x] `apps/backend/src/routes/products.test.ts`: "400 when fileSize exceeds 10 MB" (11 MB) + "201 at exactly 10 MB".
- [x] Nuevo `apps/frontend-admin/src/lib/upload-image.ts` con `browser-image-compression`:
      `UploadImageError` (codes `BRANCH_REQUIRED | UNSUPPORTED_TYPE | TOO_LARGE | UPLOAD_FAILED | ASSETS_NOT_CONFIGURED`),
      `COMPRESSION_OPTIONS` (maxSizeMB 1, maxWidthOrHeight 1600, `image/webp`, useWebWorker, initialQuality 0.85),
      `prepareImageForUpload(file)` (MIME → compresión con fallback al original → chequeo de tamaño),
      `uploadProductImage({ branchId, file })` (presign con el tipo/tamaño reales, PUT, `publicUrl`),
      `uploadErrorMessage(code)` con los copys en español.
- [x] `apps/frontend-admin/src/pages/ProductFormPage.tsx`: eliminar `UPLOAD_MIME` / `UPLOAD_MAX_BYTES`;
      `handleImagePick` y `VariantsCard.onUploadImage` delegan al helper; el catch de variantes mapea
      `UploadImageError.code`; copys "máx 10 MB · se comprime automáticamente"; `accept` desde `UPLOAD_CONTENT_TYPES`.
- [x] Test `apps/frontend-admin/src/lib/upload-image.test.ts` (mocks de `browser-image-compression`,
      `./products-api.js` y `fetch`): compresión invocada y presign con `image/webp`; PNG 12 MB → 0.8 MB sube;
      compresión falla + >10 MB → `TOO_LARGE`; `image/gif` → `UNSUPPORTED_TYPE`; PUT non-ok → `UPLOAD_FAILED`.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test` passes y `git diff --exit-code apps/backend/openapi.json` limpio tras regenerar
- [ ] Manual (MinIO, navegador): JPEG 6 MB → presign `image/webp` < 1.2 MB, PUT ok, thumbnail; idem variante
- [x] Verificado por API contra Docker MinIO: presign JPEG 8,5 MB → 201, PUT → 200, GET público → 200; 10 MB + 1 → 400; 10 MB exactos → 201

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 2: Seed de Mura + export de fixture

**Branch**: `NT-mura-menu/mura-menu-ferna/mura-seed-data`
**Base**: `NT-mura-menu/mura-menu-ferna/feature`
**Depends on**: none

### Tasks

- [x] Nuevo `apps/backend/src/db/seed-data/mura-menu.ts` (puro): constantes de IDs, `MURA_BUSINESS`
      (contacto real de Cartagena, sin email), `MURA_BRANCH`, `MURA_CATEGORIES` (13, en orden del docx),
      builders `methodGroup()`, `milkGroup()`, `syrupGroup()`, `micheladaGroup()`, `foodExtrasGroup()`,
      `MURA_PRODUCTS` (64, precios y descripciones verbatim del docx, skus canónicos, `sortOrder` 10/20/30,
      `availability {pos:true, online:true, kiosk:false}` salvo alcohol `online:false`, `trackStock:false`,
      `stock:0`, `imageUrl` placeholder, alérgenos/dietary evidentes), `featuredProducts()`,
      `buildMuraDocuments({ now, imageBaseUrl, createdBy })`.
- [x] `apps/backend/src/db/seed.ts`: borrar data la-cocina; `seedData` idempotente por slug `mura`;
      `resolveMuraUsers(db)` exportado (admin@mura.co con `MURA_ADMIN_PASSWORD`, kelvin con carry-over
      de hash → `MURA_KELVIN_PASSWORD` → skip local / throw en Atlas); `MURA_IMAGE_BASE_URL`.
- [x] `apps/backend/src/db/seed-atlas.ts`: exigir `MURA_ADMIN_PASSWORD`; actualizar cabecera.
- [x] Nuevo `apps/backend/scripts/export-mura-fixture.ts` + script `menu:export` (JSON determinista a stdout, sin DB).
- [x] Placeholder `apps/backend/src/db/seed-data/assets/product-placeholder.webp` (≤ 20 KB, 800×800).
- [x] Tests `apps/backend/src/db/seed-data/mura-menu.test.ts` y `apps/backend/src/db/seed.test.ts`.
- [x] Docs: `CLAUDE.md` (login), `README.md`, `docs/local-dev.md`, `docs/database.md` (bullet de seed),
      `apps/e2e/.env.example`, `apps/e2e/README.md`.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test` passes
- [x] Manual: `db:setup` → `db:seed` ×2 (2º no-op); login `admin@mura.co`; 13 categorías en orden;
      Filtrado Lavado con 3 variantes + Método; Latte con Leche y Extras; Burger con Adiciones; 5 destacados;
      `menu:export | jq '.products|length'` = 64

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 3: Script `db:purge-business`

**Branch**: `NT-mura-menu/mura-menu-ferna/purge-business-script`
**Base**: `NT-mura-menu/mura-menu-ferna/feature`
**Depends on**: none

### Tasks

- [x] Nuevo `apps/backend/src/db/purge-business.ts`: `--slug` (obligatorio), `--yes`, `--expect-carried-over <email>`
      (repetible); rechaza `^cypress-`; `planBusinessPurge(db, slug)` con 12 pasos hijos→padres
      (refreshTokens, passwordResetTokens, loginAttempts, auditLogs, orders, productPreferences, products,
      categories, kitchenStations, users, branches, businesses); dry-run con `countDocuments`; `--yes` con
      `deleteMany` en orden; exit ≠ 0 si el negocio no existe o falla una expectativa.
- [x] `apps/backend/package.json`: script `db:purge-business`.
- [x] Test `apps/backend/src/db/purge-business.test.ts` (mock `Db`).
- [x] `docs/database.md`: bullet "Purging a business".

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test` passes
- [x] Manual en Docker Mongo con data vieja: dry-run no borra; `--yes` borra solo ese negocio; re-run exit ≠ 0

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 4: Contrato Ferna + cutover de prod

**Branch**: `NT-mura-menu/mura-menu-ferna/ferna-contract-cutover`
**Base**: `NT-mura-menu/mura-menu-ferna/feature` (con Phase 2 y 3 mergeadas)
**Depends on**: Phase 2, Phase 3

### Tasks

- [x] Nuevo `docs/ferna-integration.md` (conexión read-only, IDs fijos, queries exactas, shapes, campos a
      ignorar, dinero COP + fórmula de `computeEffectivePrice`, semántica de modifiers/variants, SKU = slug,
      imágenes, política de cambios, cache ≥ 60 s). Enlazar desde `CLAUDE.md` y `docs/database.md`.
- [x] Runbook "Atlas runbooks" en `docs/database.md` (pasos 0–8: deploy, placeholder a S3, dry-run purge,
      seed-atlas con `MURA_ADMIN_PASSWORD`, inventario, login, purge `--yes`, GitHub vars, Atlas user read-only).
- [ ] Ejecutar el runbook contra Atlas y enviar `menu:export` a la sesión Ferna.

### Verification

- [x] `pnpm format:check` passes
- [x] `pnpm typecheck` / `pnpm lint` / `pnpm build` passes
- [ ] Inventario Atlas: negocios `mura`, `cypress-biz-a`, `cypress-biz-b`; 64 productos Mura; 5 featured
- [ ] Smoke E2E post-deploy verde tras rotar `CYPRESS_USER_ADMIN_*`

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

- [ ] Clone limpio: `pnpm setup` → login `admin@mura.co`; `db:seed` re-run no-op; `db:seed-cypress` convive con Mura.
- [ ] Matriz de upload en MinIO: 1 MB JPG, 6 MB JPG, 12 MB PNG, 9.9 MB WebP suben como webp ≤ ~1.2 MB;
      `POST /api/products/upload-url` 10485760 → 201, 10485761 → 400.
- [ ] CI `quality` verde (openapi-sync incluido).
- [ ] Runbook prod ejecutado con inventarios esperados; Ferna lista 60 productos online y 5 destacados.

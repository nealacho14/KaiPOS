# Follow-up Tasks

Source: `.specs/NT-33618b91_crud-productos/`

<!-- Items discovered during planning exploration that are out of scope for Paso 10 but worth tracking. -->

- [ ] **Users CRUD create/edit pages** — `UsersListPage` exists but there is no `UsersFormPage`, create dialog, or edit flow. Products establishes the page-based form pattern; `users` should be refactored to use it once products ships, so both features share a single form shell.
- [ ] **Branches API + shared `BranchSelector` data source** — `BranchSelector` in Paso 10 falls back to `user.branchIds` (ids only, no names) unless a `/api/branches` endpoint already exists. If it does not, promote the minimal "list my branches" endpoint and collapse the fallback. This unblocks showing branch names everywhere instead of ids.
- [ ] **Shared Zod schemas** — Paso 10 duplicates client-side required-field checks; the authoritative schemas live in `apps/backend/src/schemas/products.ts`. Export them from `@kaipos/shared/schemas/products` and consume from the frontend form for field-level validation without drift.
- [ ] **`{ code, field }` 409 convention** — Paso 10 introduces `{ code: 'SKU_ALREADY_EXISTS', field: 'sku' }`. Backfill the pattern into the existing duplicate-email path in `services/users.ts` (currently `DUPLICATE_EMAIL` without a `field` slot) so the frontend can map both uniformly.
- [ ] **Modifier collection + FK refactor** — Paso 10 embeds `modifierGroups` in each product. A dedicated `modifiers` collection already exists in the DB schema (see `apps/backend/src/db/setup.ts`) but is unused. Reconcile: either consume the shared collection via FK, or drop the unused collection and keep the embedded model as the canonical shape. Decision deferred.
- [ ] **Categories as a first-class resource** — `category` stays a string in Paso 10. Promote to a `categories` collection with CRUD + FK from `products.category` once the product catalog stabilizes, so category renames don't require bulk updates.
- [ ] **Drag-and-drop ordering for modifier groups/options** — Mockup shows `⋮⋮` handles; Paso 10 renders them inert. Add DnD (probably `@dnd-kit`, not a new dep decision) once the base UX is validated.
- [ ] **Auto-save for the product form** — "Borrador · guardado hace Xs" label is static in Paso 10 (marked TODO in code). Implement real draft persistence (local storage → backend draft doc) once product lifecycle gets a proper "draft vs published" state.
- [ ] **Low-stock alerting** — `lowStockThreshold` is persisted but nothing consumes it. Wire consumers (KDS badge, admin notification, email) in a dedicated ticket.
- [ ] **WebSocket product events** — Paso 10 does not emit `product.created|updated|deleted`. Once the POS/kiosk is live and benefits from push invalidation, fan out via `publishToChannel(channelFor.branch(branchId), ...)` mirroring the orders pattern.
- [ ] **Narrow Assets bucket IAM audit** — Phase 6 narrows `s3:PutObject` to `products/*`. Re-audit once additional asset types (e.g. logos, receipts) land, to prevent regression back to `grantReadWrite`.
- [ ] **Logging boundary in `@kaipos/ui`** — the re-export pattern has drifted: some icons live in `components/index.ts`, some in `icons/index.ts`. Paso 10 adds several new icons; follow up by consolidating so future icon adds have one obvious location.

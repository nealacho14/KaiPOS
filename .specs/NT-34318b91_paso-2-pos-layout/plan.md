# Plan: Paso 2 — Interfaz POS: Layout y Navegación

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| Notion Ticket  | [NT-34318b91](https://notion.so/34318b913fdd814f82a2dcf2e2907dfd)  |
| Spec           | `.specs/NT-34318b91_paso-2-pos-layout/spec.md`                     |
| Feature Branch | `NT-34318b91/paso-2-pos-layout/feature`                            |
| Target         | `main`                                                             |

<!-- Multi-phase sequential plan. Phases are stacked — each targets the previous phase's branch.
     Phase 1 branch targets the feature branch; subsequent phases target the previous phase.
     Use `/kaipos.implement` to implement one phase at a time. -->

## Decisions taken before phase 1

- **App location**: new app `apps/frontend-pos` (`@kaipos/frontend-pos`), not a `/pos` route inside `frontend-admin`. Rationale in the spec — admin sidebar fights the split, smaller bundle for cashier/waiter, POS-aware tokens (`Button size="pos"`, `Button variant="tile"`, `Card variant="ticket"`, `Typography variant="money*"`, `theme.posSize.*`) already live in `@kaipos/ui`.
- **Plumbing reuse**: `AuthContext`, `ActiveBranchContext`, `WebSocketContext`, `lib/api.ts`, `lib/auth-storage.ts`, `lib/ws-client.ts`, `hooks/useWebSocket.ts`, `hooks/useActiveBranch.ts`, `hooks/useBranches.ts` are **replicated** from `apps/frontend-admin/src` (verbatim, with package imports unchanged because they already reference `@kaipos/shared` and `@kaipos/ui`). Extracting them to a shared `packages/app-runtime` is the right long-term answer, but it inflates KAI2-2 scope and touches admin tests. A follow-up captures the extraction.
- **Login flow**: the POS reuses the same `/login`, `/forgot-password`, `/reset-password` flow as the admin. We replicate the three pages so the POS is a self-contained Vite app — the backend already accepts logins for `cashier`/`waiter`/`manager`/`admin` regardless of which app they came from.
- **Dev port**: `apps/frontend-pos` runs on `:3002` (admin already squats `:3000`, backend on `:4000`, admin Docker on `:3001`).
- **Backend changes**: none. `GET /api/products` already exposes `branchId`, `category`, `q`, `includeInactive`, `activeNow`, `featuredIn`, `businessId`, `page`, `limit` (`packages/shared/src/schemas/products.ts:168`), and `GET /api/categories` is paginated. The 100-row pagination cap stays — if 500 products fail the `< 1 s` SLA after we ship, we open a separate PR (captured as a conditional follow-up).
- **Phase strategy**: 3 stacked sequential phases. The phases are tightly coupled to the same `App.tsx` / layout file, so parallel worktrees would generate constant rebases. Sequential keeps review cost predictable.

## Phase 1: scaffold-and-runtime

**Branch**: `NT-34318b91/paso-2-pos-layout/scaffold-and-runtime`
**Targets**: `NT-34318b91/paso-2-pos-layout/feature`

End state: `pnpm --filter @kaipos/frontend-pos dev` boots a Vite server on `:3002` with `/api` proxied to `http://localhost:4000`, `pnpm dev` from the repo root brings up backend + admin + POS together, and `/login` works against the live API. The POS does not yet render the catalog UI — Phase 2 lays it on top.

### Tasks

- [x] Create `apps/frontend-pos` with `package.json` (`@kaipos/frontend-pos`, `private: true`, `type: module`, scripts `dev/build/preview/lint/typecheck/test`). Mirror the dep list from `apps/frontend-admin/package.json` but drop `@dnd-kit/*` (admin-only reorder). Keep `@emotion/*`, `@mui/material`, `@mui/icons-material`, `react`, `react-dom`, `react-router-dom`, `@kaipos/ui`, `@kaipos/shared`, and the same Vitest / Testing Library / Vite devDeps.
- [x] Add `tsconfig.json` (extends `@kaipos/tsconfig/react.json`, `rootDir: src`, `outDir: dist`, `include: ["src"]`) and `tsconfig.node.json` (extends `@kaipos/tsconfig/node.json`, `include: ["vite.config.ts"]`).
- [x] Add `eslint.config.js` (re-exports `@kaipos/eslint-config/react` — same single-line shape as admin).
- [x] Add `vite.config.ts` mirroring admin: `VITE_PORT` default `3002`, `VITE_API_URL` default `http://localhost:4000`, `/api` proxy, `react()` plugin, `VITE_APP_VERSION` definedFromPackageJson.
- [x] Add `vitest.config.ts` (happy-dom, `globals: true`, `setupFiles: ['./src/test-setup.ts']`, `testTimeout: 30_000`).
- [x] Add `index.html` with Spanish lang, Inter + JetBrains Mono preconnects, `<title>KaiPOS</title>`, `<div id="root"></div>`, `/src/main.tsx` module.
- [x] Add `src/vite-env.d.ts` (mirror admin) and `src/test-setup.ts` (`import '@testing-library/jest-dom/vitest'`).
- [x] Replicate runtime modules from `apps/frontend-admin/src` into `apps/frontend-pos/src` **verbatim** (preserving imports/comments):
  - `lib/api.ts` (incl. throttle retry + refresh dance) and `lib/api.test.ts`.
  - `lib/auth-storage.ts`.
  - `lib/ws-client.ts` and `lib/ws-client.test.ts`.
  - `lib/products-api.ts`, `lib/categories-api.ts` (dropped `reorderProducts` and `generateUploadUrl`; kept `listProducts`, `getProduct`, `setProductFeatured`, `listCategories`).
  - `context/AuthContext.tsx` (+ `AuthContext.test.tsx`), `context/ActiveBranchContext.tsx`, `context/WebSocketContext.tsx`.
  - `hooks/useActiveBranch.ts`, `hooks/useBranches.ts`, `hooks/useWebSocket.ts`.
  - `components/guards/RequireAuth.tsx`, `components/guards/RequirePermission.tsx` (+ test), `components/guards/index.ts`. `RequirePermission` now redirects to `/` (POS has no `/dashboard`); test updated to match.
- [x] Add `src/main.tsx` (StrictMode → KaiPOSThemeProvider → BrowserRouter → AuthProvider → App) and `src/App.tsx` with the **minimum** routes: `/login`, `/forgot-password`, `/reset-password` (replicate the three admin pages), and a single `/` route gated by `RequireAuth` rendering a temporary placeholder (`<Box>POS shell coming in phase 2</Box>`). Phase 2 replaces the placeholder.
- [x] Replicate `pages/LoginPage.tsx`, `pages/ForgotPasswordPage.tsx`, `pages/ResetPasswordPage.tsx` and their `.test.tsx` files. `LoginPage` post-login redirect default flipped `/dashboard` → `/`; test asserts `/`. All other copy untouched.
- [x] No changes to `pnpm-workspace.yaml` (already `apps/*`). No changes to `turbo.json` — `dev/build/lint/typecheck/test` are inherited.
- [x] Verify `pnpm install` resolves cleanly, `pnpm --filter @kaipos/frontend-pos dev` serves on `:3002`, and `pnpm dev` from root brings up backend + admin + POS without port collisions.
- [x] Update `apps/frontend-admin/README.md` is **not** in scope; instead, add a brief `apps/frontend-pos/README.md` describing dev ports, env vars, and the "Paso 2 / Paso 3" split.
- [x] Update root `CLAUDE.md` references? **No** — `CLAUDE.md` is already at the 80-line cap. Detail goes into `apps/frontend-pos/README.md`.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds (Turbo discovers the new app and builds it)
- [x] `pnpm test` passes (replicated tests for `api`, `ws-client`, `AuthContext`, `RequirePermission`, `LoginPage`, `ForgotPasswordPage`, `ResetPasswordPage` all run against the POS app — 7 files, 36 tests)
- [x] `rg "from '@mui/material" apps/frontend-pos/src` → zero matches
- [x] `rg "from 'lucide-react" apps/frontend-pos/src` → zero matches
- [x] Playwright verification — POS dev server pointed at Docker backend on `:4001` (env `VITE_API_URL`). Backend `/api/health` returned 200. `browser_navigate http://localhost:3002` redirected to `/login` and `browser_snapshot` showed the form. `browser_fill_form` with `admin@lacocinadekai.com` / `admin123` + submit → URL `http://localhost:3002/`, body `POS shell coming in phase 2`. Reload of `/` kept the session (`hasSession: true`) and stayed on `/` (no `/login` redirect). Only console errors were two `favicon.ico` 404s — same as the admin app, no app code involved.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 2: layout-shell-and-permissions

**Branch**: `NT-34318b91/paso-2-pos-layout/layout-shell-and-permissions`
**Targets**: `NT-34318b91/paso-2-pos-layout/scaffold-and-replicated-runtime` (i.e. Phase 1 branch)

End state: `/` is gated by `RequireAuth` + `RequirePermission permission="products:read"` and renders a split layout — POS header (logo, branch switcher, WS chip, color toggle, user menu, business picker for super_admin) on top, an empty left panel (catalog area) at `~70%` width, and an empty `CartPanel` placeholder at `~30%` (min 360 px, max 480 px). The `< md` breakpoint switches to a stacked layout with the cart panel collapsible. `WebSocketProvider` is mounted and connected on auth. Super_admin without a selected business sees an empty state.

### Tasks

- [x] Build `src/components/PosHeader.tsx` based on admin's `Header.tsx`, but **without** sidebar/hamburger logic. Slots: `KaiPOSLogo` (icon variant on `< md`, horizontal on `>= md`), optional `BusinessPicker` for super_admin (desktop only), business name `Typography` for everyone else, optional role `Chip`, `ActiveBranchSwitcher`, `WsStatusChip` (compact on `< sm`), `ColorSchemeToggle`, `UserMenu`. Height 64 px, 1 px bottom border, `bgcolor: 'background.paper'`. Receives `wsStatus: WsStatusChipStatus` as a prop (same shape as admin).
- [x] Replicate `components/ActiveBranchSwitcher.tsx`, `components/BusinessPicker.tsx`, `components/UserMenu.tsx`, `components/WsStatusChip.tsx`, `components/EmptyState.tsx` from admin verbatim into `apps/frontend-pos/src/components/`. Add `components/index.ts` barrel exposing all of them.
- [x] Build `src/layouts/PosLayout.tsx`:
  - Outer flex column (`100vh`, `bgcolor: 'background.default'`, `overflow: hidden`).
  - `PosHeader` (flex `0 0 64px`).
  - Body row (`flex: 1`, `min-height: 0`). On `>= md`: left panel `flex: 1` (`min-width: 0`); right panel `flex: 0 0 30%` clamped via `minWidth: 360`, `maxWidth: 480`. On `< md`: stack vertical; right panel becomes a bottom `Drawer` (`anchor="bottom"`, `variant="persistent"`, `open` toggled by a CTA in the left panel header — but no real content yet; Paso 3 wires it).
  - Wraps children in `ActiveBranchProvider` + `WebSocketProvider` (with `getWsEndpoint()` reading `import.meta.env.VITE_WS_ENDPOINT ?? ''`, same as admin).
  - Inside the layout, mount the WS connect/disconnect effect from admin (`AppLayout.tsx:18-35`) so the socket attaches on auth and detaches on logout.
  - Renders `<Outlet />` in the left panel and `<CartPanel />` (placeholder, defined in phase 3) in the right panel — for Phase 2 just render an empty `<Box>` placeholder; the real panel ships in Phase 3.
- [x] Build `src/pages/PosHomePage.tsx` — for now a placeholder that renders `<EmptyState title="Catálogo en construcción (Paso 2)" subtitle="El grid llega en Paso 3" />` so the layout is testable end-to-end. Phase 3 replaces the body.
- [x] Build `src/pages/SelectBusinessPage.tsx` for super_admin without a selected business. Reuses `BusinessPicker` and an `EmptyState` ("Selecciona un negocio para operar el POS"). The `/` route routes super_admins here when `business` is `null`. Mirror admin's behavior.
- [x] Build `src/pages/NoBranchPage.tsx` for users whose `branchIds` is empty. Renders `<EmptyState title="Sin sucursales asignadas" subtitle="Pídele a tu administrador que te asigne una sucursal." />`.
- [x] Wire `App.tsx`: replace the Phase 1 placeholder route with:

  ```tsx
  <Route element={<RequireAuth />}>
    <Route element={<PosLayout />}>
      <Route element={<RequirePermission permission="products:read" />}>
        <Route path="/" element={<PosHomePage />} />
      </Route>
      <Route path="/no-branch" element={<NoBranchPage />} />
      <Route path="/select-business" element={<SelectBusinessPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Route>
  ```

  A small wrapper component reads `useAuth().business` + `useActiveBranch().branchIds` and redirects super_admin without business → `/select-business`, regular user with no branches → `/no-branch`. Cleanest place is inside `PosLayout` after the header but before the Outlet.
- [x] Tests (Vitest + Testing Library, mocking `fetch` for `/api/auth/me` and `/api/branches`):
  - `PosLayout.test.tsx` — renders header + empty left and right panels; on viewport `< md` the right panel collapses.
  - `App.test.tsx` (or `PosHomePage.test.tsx`) — verified gating: a `cashier` with `products:read` reaches `/`; a hypothetical role missing `products:read` is redirected (this is exercised by `RequirePermission.test.tsx` already; an integration-level smoke is enough here).
  - Super_admin without selected business is routed to `/select-business`.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes (`no-restricted-imports` clean — no MUI/lucide leaks)
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test` passes (new PosLayout + routing tests, plus all Phase 1 tests still green — 8 files, 39 tests)
- [x] `rg "fontSize: [0-9]|fontWeight: [0-9]|borderRadius: [0-9]" apps/frontend-pos/src` → zero matches (token discipline; not ESLint-enforced, manual grep)
- [x] `rg "'[0-9]+px'" apps/frontend-pos/src/**/*.tsx` → no spacing-as-string literals
- [x] Playwright verification (agent-executed via the `playwright` MCP, dev server on `:3002`, Docker backend `:4001`):
  - Admin login renders POS header (logo, business name `La Cocina de Kai`, `Admin` role chip, `ActiveBranchSwitcher` showing `Sucursal Piantini`, `WsStatusChip` `Inactivo`, `ColorSchemeToggle`, `UserMenu`), left panel `EmptyState` `Catálogo en construcción (Paso 2)`, right panel `Orden actual` header — screenshot `qa-screenshots/phase-2-desktop-admin.png`.
  - At `1280×800`: `[data-testid="pos-cart-pane-desktop"]` `getBoundingClientRect().width = 384` (within the 360–480 clamp), height = 736 = viewport − 64 px header.
  - At `420×900`: desktop cart pane hidden, `[data-testid="pos-open-cart"]` CTA visible (screenshot `phase-2-mobile.png`). Clicking it opens the bottom `Drawer` at 70vh / `630` px height (screenshot `phase-2-mobile-cart-drawer.png`).
  - `ColorSchemeToggle` flips `<html data-color-scheme>` from `light` → `dark` and persists after `browser_navigate` reload.
  - Logout via `UserMenu` → URL `http://localhost:3002/login`. Re-login with `admin@lacocinadekai.com` / `admin123` → URL `/`.
  - Single-branch user `Chip` render: covered by `ActiveBranchSwitcher`'s `options.length === 1` branch (unit-tested in admin parity).
  - Super_admin `/select-business` empty-state path: covered by `PosLayout.test.tsx` `redirects super_admin without selected business to /select-business`.
  - `browser_console_messages` across the flow: only `favicon.ico 404` (same as Phase 1 and admin) — zero app-code errors.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 3: catalog-scanner-cart

**Branch**: `NT-34318b91/paso-2-pos-layout/catalog-scanner-cart`
**Targets**: `NT-34318b91/paso-2-pos-layout/layout-shell-and-permissions` (i.e. Phase 2 branch)

End state: the left panel renders pinned tabs (`Todas`, `Destacados`) + dynamic categories, a debounced search bar, and a touch-first grid of product tiles. Tiles show image (with initials fallback), name, money price, and a `Configurable` chip when applicable. A global HID barcode-scanner hook converts keystroke bursts into queries and dispatches `onProductSelected` on a unique match. The right panel renders a `CartPanel` placeholder backed by a no-op `CartContext`. All acceptance-criteria tests pass.

### Tasks

#### Catalog state + caching

- [x] Build `src/state/CatalogProvider.tsx` (or `hooks/useCatalog.ts`) — manages catalog state keyed by `(branchId, category, q, activeNow, featuredIn)`. Holds a `Map<key, { data: Product[]; pagination; pagesFetched: number; status: 'loading' | 'partial' | 'ready' | 'error' }>` for the lifetime of the session.
- [x] First-paint fetch: `listProducts({ branchId, category?, q?, activeNow: true, featuredIn?, page: 1, limit: 100 })` blocks initial render of the grid.
- [x] Background fetch: if `pagination.totalPages > 1`, kick off `page=2..N` requests in parallel (capped to e.g. 5 concurrent) and merge results into state, deduped by `_id`. Skip if any other key is currently active (avoid wasting requests on the user's previous tab).
- [x] Render order: keep server `sortOrder`; do not re-sort client-side.
- [x] If the result count after merge exceeds 300 visible tiles, render the grid with `content-visibility: auto` on each tile (`Box sx={{ contentVisibility: 'auto', containIntrinsicSize: '160px 220px' }}`). True virtualization is **not** required.
- [x] Re-fetch on `branchId` change. Do not re-fetch on tab switch if the cache key already has `status !== 'error'`.

#### Tabs

- [x] Build `src/components/CategoryTabs.tsx`:
  - Loads categories on mount: `listCategories({ limit: 100 })` (categories are bounded — paginate only if `totalPages > 1`, same merge pattern).
  - Tab order: pinned `Todas` (value `'all'`), pinned `Destacados` (value `'featured'`), then the fetched categories sorted by `sortOrder`.
  - Uses `Tabs variant="scrollable"` + `Tab`. Selected tab is the controlled `value`; `onChange` calls a parent setter.
- [x] Parent (`PosHomePage`) translates the tab value into request params: `'all'` → no `category`, no `featuredIn`; `'featured'` → `featuredIn: activeBranchId`, no `category`; any other → `category: <id>`.

#### Search + activeNow toggle

- [x] Build `src/components/CatalogSearch.tsx`:
  - `TextField` size `small`, `inputMode="search"`, `enterKeyHint="search"`, `autoFocus`.
  - Internal state + `useDebouncedValue` hook (150 ms) → parent's search setter.
  - Clear `X` button (icon button + adornment) that resets to `''` and refocuses.
  - Global `/` keystroke (when focus is not in any other `INPUT/TEXTAREA/SELECT`) refocuses the search input.
- [x] Build `src/components/ActiveNowToggle.tsx`:
  - Visible only when `hasPermission(role, 'products:write')` (i.e. `admin`/`manager`/`super_admin` per `ROLE_PERMISSIONS` — picking `products:write` because it's the closest existing permission that maps to the "can manage catalog" idea; alternative is `branches:manage`).
  - `Switch` labeled "Ver fuera de horario". When ON, `activeNow=false` is passed to the API; when OFF, `activeNow=true` (the default).

#### Product tile + grid

- [x] Build `src/components/ProductTile.tsx`:
  - `Button variant="tile"` with `data-product-id={product._id}` and `aria-label={product.name + ' ' + formattedPrice}`. Min height tracks `theme.posSize.pos`.
  - Image: `<Box component="img" src={product.imageUrl} />` with `onError` swap to a `<Box>` initials fallback ( `colors.primary[100]` background, primary-dark text, derived from first 2 chars of `product.name`).
  - Name: `Typography variant="subtitle1"` with 2-line clamp (`-webkit-line-clamp: 2`, `display: '-webkit-box'`, `WebkitBoxOrient: 'vertical'`, `overflow: 'hidden'`).
  - Price: `Typography variant="money"` formatted via `new Intl.NumberFormat('es-MX', { style: 'currency', currency: business.currency ?? 'MXN' })` — `business.currency` is not in the existing `AuthBusiness` type, so fall back to `'MXN'` with a `TODO` comment referencing the follow-up to plumb a per-business currency.
  - `Chip` with label "Configurable" (size small, variant outlined) in the bottom-right corner when `product.modifierGroups.some(g => g.required)`.
  - `onClick` calls `onProductSelected(product, { requiresConfig })`.
- [x] Build `src/components/ProductGrid.tsx`:
  - `Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={1.5}` (or 2 — finalize during implementation review).
  - Skeleton state: when status is `loading` and the cache is empty, render 12 `Skeleton variant="rounded" height={140}` placeholders.
  - Empty state: when status is `ready` and the merged list is empty, render `<EmptyState title="Sin productos" subtitle="Ajusta la búsqueda o cambia de categoría." />`.
  - Error state: when status is `error`, render `<EmptyState title="No pudimos cargar el catálogo" subtitle={error.message} action={<Button onClick={retry}>Reintentar</Button>} />`.
- [x] Wire `PosHomePage` to compose: header strip (search + activeNow toggle) → `CategoryTabs` → `ProductGrid`. The page owns: `activeTab`, `searchValue`, `activeNow`, and derives the request params + cache key. On tile click, calls the (currently no-op) `CartContext.addItem`.

#### Barcode scanner (HID)

- [x] Build `src/hooks/useBarcodeScanner.ts`:
  - Signature: `useBarcodeScanner({ onScan, minLength = 6, maxIntervalMs = 30, terminator = 'Enter' })`.
  - Listens to `window` `keydown`. Maintains a per-window buffer + last-keystroke timestamp.
  - Ignores events whose `event.target` is `INPUT`/`TEXTAREA`/`SELECT` **except** when the target has `data-scanner-target="true"` — Phase 3 marks the search `TextField` with this attribute and a dedicated codepath consumes the scan as a search query rather than a direct product fetch (open-question default per spec).
  - Burst rule: each new keystroke must arrive within `maxIntervalMs` of the previous one; otherwise the buffer resets. The first event of a burst is always accepted.
  - `Enter` flushes the buffer; if `buffer.length >= minLength`, calls `onScan(buffer)`. The terminating `Enter` is `preventDefault`-ed so it does not submit a form.
  - Returns nothing (side-effect-only hook). Calling component is responsible for ref-stable `onScan` (memo it).
- [x] In `PosHomePage`, register `useBarcodeScanner({ onScan: handleScan })`. `handleScan(code)` calls `listProducts({ branchId, q: code, limit: 2 })`:
  - 1 match → `onProductSelected(product)`, scroll/focus the tile via `data-product-id`, briefly toggle a `boxShadow` highlight (250 ms via `useTransition`-style timer or a controlled state).
  - 0 matches → `Snackbar` open `Sin coincidencias para "${code}"` (auto-hide 3 s).
  - `>1` matches → `Snackbar` "Múltiples coincidencias, selecciona manualmente"; scroll/focus first match.

#### Cart panel placeholder + `CartContext`

- [x] Build `src/context/CartContext.tsx`:
  - Shape: `{ items: []; addItem: (p: Product, opts?: { requiresConfig?: boolean }) => void; clear: () => void; }`.
  - `addItem` is a no-op for KAI2-2 but logs via a thin `logger` helper (`src/lib/logger.ts` — wraps `console.warn` so it's not flagged as `console.log` by future lint, and includes an `// eslint-disable-next-line no-console` comment with rationale). Phase 3 KAI2-3 replaces the body.
  - `clear()` is also a no-op for now.
  - `CartProvider` wraps `PosLayout` children so anyone in the tree can call `useCart()`.
- [x] Build `src/components/CartPanel.tsx`:
  - `Card variant="ticket"` filling the right panel (`height: 100%`, `display: flex`, `flexDirection: column`).
  - Header row: `Typography variant="h6">Orden actual</Typography>`.
  - Body: `<EmptyState title="Toca un producto para empezar" />` (when `items.length === 0` — always, in this phase).
  - Footer: `Stack` with `Typography variant="moneyLg">$0.00</Typography>` + `Button size="pos" disabled>Cobrar (Paso 3)</Button>`.
- [x] Mount `CartProvider` in `PosLayout` (between `WebSocketProvider` and the body). Replace the Phase 2 right-panel placeholder with `<CartPanel />`. On `< md`, `CartPanel` renders inside the bottom `Drawer`.
- [x] When a tile is tapped on a product with `modifierGroups.some(g => g.required)`, `PosHomePage` also shows a `Snackbar` "Configuración pendiente (Paso 3)" — this is the visible signal that Paso 3 has work to do. Auto-hide 2.5 s.

#### Tests

- [x] `useBarcodeScanner.test.ts` — fakes `keydown` events with mocked timestamps; verifies burst detection, terminator handling, length threshold, focus filtering, and the `data-scanner-target` override.
- [x] `CategoryTabs.test.tsx` — mocks `fetch` to return `[ {sortOrder:1,name:'Bebidas'}, {sortOrder:2,name:'Comida'} ]`; asserts the pinned tabs come first and the dynamic tabs are sorted.
- [x] `CatalogSearch.test.tsx` — types `bur`, advances timers by 150 ms with `vi.useFakeTimers()` + `await act(...)`, asserts the parent's `onSearchChange` fires once with `'bur'`. Clear button resets.
- [x] `ProductGrid.test.tsx` — given a mocked `listProducts` returning 3 products including one with `modifierGroups: [{ required: true, ...}]`, asserts the `Configurable` chip renders only on that tile.
- [x] `PosHomePage.test.tsx` (integration) — renders the page inside `<MemoryRouter>` + providers, mocks `fetch` for `/api/categories` and `/api/products`, switches tabs, asserts the URL hit by `listProducts` includes `featuredIn=<branchId>` for `Destacados`, simulates a barcode scan via the `useBarcodeScanner` exposed test seam (or via firing keydown events on `window`), asserts `onProductSelected` was called once for the single-match case, and the `Snackbar` appears for the 0-match case.
- [x] `CartPanel.test.tsx` — asserts empty state copy, the `$0.00` total, and the disabled `Cobrar (Paso 3)` CTA.

#### Documentation

- [x] Append a "POS app (frontend-pos)" section to `apps/frontend-pos/README.md` listing the env vars (`VITE_PORT`, `VITE_API_URL`, `VITE_WS_ENDPOINT`), dev port (`:3002`), and the hand-off boundary with Paso 3 (`CartContext.addItem` is a no-op; modifier modal is out of scope; subtotal/total stay at `$0.00`).
- [x] No edits to `apps/frontend-admin/README.md` (out of scope).
- [x] No edits to `docs/architecture.md` in this ticket; the long-form cross-app architecture write-up belongs with the runtime-extraction follow-up.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test` passes (all Phase 1/2/3 tests)
- [x] `rg "from '@mui/material" apps/frontend-pos/src` → zero matches
- [x] `rg "from 'lucide-react" apps/frontend-pos/src` → zero matches
- [x] `rg "fontSize: [0-9]|fontWeight: [0-9]|borderRadius: [0-9]" apps/frontend-pos/src` → zero matches
- [x] `rg "console\.log" apps/frontend-pos/src` → zero matches (logger wrapper only)
- [x] Playwright verification — see QA Plan below (executed by the agent, not the user).

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

**Runner**: the agent (Claude) drives this end-to-end using the `playwright` MCP — there is no human checklist. The user only reviews the resulting screenshots / network traces / console summary that the agent produces.

**Pre-flight (the agent runs these itself)**:

1. Ensure Docker Mongo is up and seeded: `pnpm --filter @kaipos/backend db:seed` (idempotent; refuses Atlas).
2. Start backend + admin + POS in the background: `pnpm dev` via `Bash` with `run_in_background: true`. Wait until `http://localhost:4000/api/health` returns 200 and `http://localhost:3002/` returns 200 (poll with `Bash`, not `sleep` loops).
3. Use `browser_resize` to set viewport `1440×900` for desktop checks unless a step says otherwise.
4. Use `browser_evaluate` to clear `localStorage` and `sessionStorage` between scenarios so previous sessions don't bleed in.
5. Use `browser_network_requests` to capture `/api/products` and `/api/categories` calls and assert on query strings.
6. Take screenshots (`browser_take_screenshot`) at the end of each scenario; save into `.specs/NT-34318b91_paso-2-pos-layout/qa-screenshots/` so the user can spot-check.

**Scenarios** — every box is a Playwright-MCP-driven check. The agent must report PASS/FAIL with the supporting evidence (snapshot diff, network entry, screenshot path).

- [x] **Login & gating**
  - `browser_navigate` `http://localhost:3002` without a session → URL becomes `/login`; assert `browser_snapshot` shows the login form.
  - `browser_fill_form` `admin@lacocinadekai.com` / `admin123`; submit → URL is `/`; the POS shell renders; `browser_take_screenshot` `01-login-admin.png`.
  - Sign out via `UserMenu`. Log in as a seeded `cashier` whose `branchIds` includes at least one branch → URL is `/`; `ActiveBranchSwitcher` shows that branch as a `Chip` (`browser_evaluate` reads its `textContent`).
  - Inject a temporary user state via `browser_evaluate` (mutating `localStorage`) representing a user with `branchIds: []` and reload → URL is `/no-branch`; assert the empty-state title text.
  - Inject a super_admin session without a selected business → URL is `/select-business`; assert the empty-state copy.
- [x] **Layout & responsiveness**
  - Desktop (`1440×900`): assert via `browser_evaluate` that the right panel's `getBoundingClientRect().width` is between 360 and 480 px and `getBoundingClientRect().height` matches the viewport minus the header.
  - Tablet (`820×1180`): same as desktop.
  - Mobile (`420×900`): right panel is hidden (or rendered as a bottom drawer `aria-hidden="true"`); `browser_click` on the "Ver orden" CTA opens it; `browser_take_screenshot` `02-cart-drawer-mobile.png`.
- [x] **Header controls**
  - `WsStatusChip`: assert `data-status` starts at `inactive` and (when `VITE_WS_ENDPOINT` is set in `.env.local`) transitions to `active` within 5 s (poll via `browser_evaluate`). With no endpoint, stays `inactive` — also acceptable; record which path was exercised.
  - `ColorSchemeToggle`: click, assert `<html>` `data-mui-color-scheme` flips; `browser_navigate` reload, assert it persisted.
  - `UserMenu`: open, assert the user's email is visible, assert the "Cerrar sesión" item is present.
  - Super_admin only: `BusinessPicker` lists all visible businesses; switching reloads the page and re-fetches `/api/products` under the new tenant (assert via `browser_network_requests`).
- [x] **Tabs & catalog**
  - Logged in as the seeded admin: assert pinned tabs `Todas` and `Destacados` are first, then dynamic categories sorted by `sortOrder`.
  - Click `Destacados` → assert the next `/api/products` request URL contains `featuredIn=<activeBranchId>`. If the seed has no featured products, mark a sample featured via the existing admin app (`PATCH /api/products/:id/feature`) before the run so this scenario is meaningful.
  - Click a category tab → assert request URL includes `category=<id>`.
  - Click back to `Todas`, then back to the previously visited category → `browser_network_requests` shows **no new request** for that key (cache hit).
- [x] **Search**
  - Focus the search field; type `bur` character-by-character via `browser_type` with `delay: 50` (or `browser_press_key` per char). Wait 250 ms (`browser_wait_for { time: 0.25 }`). Assert exactly **one** `/api/products` request with `q=bur`.
  - Continue typing `ger` quickly; wait 250 ms; assert **one** additional request with `q=burger` and **no** intermediate request with `q=burg`.
  - Click the clear `X`; assert the input is empty and refocused.
  - With focus on `<body>`, press `/`; assert `document.activeElement` is the search input (via `browser_evaluate`).
- [x] **`activeNow` toggle**
  - As `cashier`: assert the toggle is **not** in the DOM (`browser_evaluate` query returns null).
  - As `manager` or `admin`: assert it is visible. Flip it ON; assert the next `/api/products` request has `activeNow=false` (or omits the param — verify which is the implemented contract). Flip OFF; the next request restores the default.
- [x] **Barcode scanner (HID simulation)**
  - With focus on `<body>` (not in any input), use `browser_press_key` to dispatch a burst of keys representing a barcode (e.g. `0`,`7`,`5`,`6`,`8`,`0`,`Enter`) with `delay: 10` between presses. Assert that:
    - One `/api/products?q=07568&limit=2` request fired.
    - For a known SKU (single match), `onProductSelected` fired (assert via a test seam: the tile gains `data-highlighted="true"` for ~250 ms — check via `browser_wait_for` text or a `browser_evaluate` selector poll).
    - For `q=unknown123` (no match), the `Sin coincidencias` Snackbar appears (assert by `browser_snapshot` containing the text).
    - For a multi-match prefix, the `Múltiples coincidencias` Snackbar appears.
  - Repeat with focus inside the search `TextField` — assert the field's `value` does **not** receive the scan (`browser_evaluate` on `input.value`).
- [x] **Configurable badge**
  - Find a product with `modifierGroups[].required === true` (the seed includes at least one — verify by listing `/api/products` directly via `Bash` `curl`); assert its tile renders the `Configurable` chip and tapping it shows the `Configuración pendiente (Paso 3)` Snackbar without changing the cart UI.
- [x] **Cart panel**
  - `browser_snapshot` of the right panel shows: `Orden actual` header, empty-state copy `Toca un producto para empezar`, total `$0.00`, and a disabled `Cobrar (Paso 3)` button (`browser_evaluate` checks `disabled === true`).
  - Tap any tile; assert the cart panel is **unchanged** (no items added — `CartContext.addItem` is a no-op in this phase).
- [x] **Performance (`< 1 s` SLA)**
  - Use `browser_evaluate` to measure `performance.now()` between the start of the `/api/products` request (intercepted via `browser_network_requests` timestamp) and the moment the first 100 tiles are present in the DOM (`document.querySelectorAll('[data-product-id]').length >= 100`). Assert the elapsed time is `< 1000` ms with a warm backend.
  - If the SLA misses, capture the timing in the QA report and flip the conditional follow-up item to "active".
- [x] **Console & design hygiene**
  - `browser_console_messages` across all scenarios shows zero `error`-level entries. Zero `console.log` messages from `apps/frontend-pos` source files (the logger wrapper goes through `warn`).
  - `browser_evaluate` returns `[...document.querySelectorAll('script')].filter(s => s.src.includes('@mui/material')).length === 0` — bundle doesn't smuggle MUI in directly.

**Reporting**: at the end of the QA run, the agent writes `.specs/NT-34318b91_paso-2-pos-layout/qa-report.md` summarizing PASS / FAIL / N/A per scenario with screenshot links + network-trace excerpts. If any scenario fails, the agent goes back and fixes it before declaring the ticket done; it does **not** ask the user to triage failures unless the failure is in third-party / infra territory.

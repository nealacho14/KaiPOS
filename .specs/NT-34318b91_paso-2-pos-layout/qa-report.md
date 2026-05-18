# QA Report — Phase 3: catalog-scanner-cart (NT-34318b91)

**Runner**: agent (Claude) via the `playwright` MCP against the Docker backend on `:4001` and the POS dev server on `:3002`.
**Environment**: Docker Mongo + backend (seeded), POS Vite dev server (`VITE_API_URL=http://localhost:4001`).

## Scenario results

| # | Scenario | Result | Evidence |
| - | -------- | ------ | -------- |
| 1 | **Login & gating — admin** | PASS | `admin@lacocinadekai.com / admin123` → URL `/`, header (`La Cocina de Kai`, `Admin` chip, `Sucursal Piantini`), catalog grid renders. Screenshot: `phase-3-desktop-admin.png`. |
| 2 | **Login & gating — cashier** | PASS | `cajero@lacocinadekai.com / cajero123` → URL `/`, role is `cashier` (`localStorage.kaipos:user.role === "cashier"`). Screenshot: `phase-3-desktop-cashier.png`. |
| 3 | **Layout (desktop 1440×900)** | PASS | `pos-cart-pane-desktop` width = 432 px (within 360–480 clamp), height = 836 = viewport − 64 px header. Grid fills the remaining left column. |
| 4 | **Layout (mobile 420×900)** | PASS | Desktop cart pane absent; `pos-open-cart` IconButton renders. Tapping opens the bottom `Drawer` at 70vh. Screenshots: `phase-3-mobile.png`, `phase-3-mobile-cart-drawer.png`. |
| 5 | **Category tabs — pinned + dynamic** | PASS | Tab order: `Todas, Destacados, Entradas, Platos Principales, Bebidas, Postres, Acompañantes` (server `sortOrder`). |
| 6 | **Category filter param** | PASS | Clicking `Entradas` fires `GET /api/products?branchId=…&category=00000000-0000-4000-8000-000000000401&page=1&limit=100&activeNow=true`. |
| 7 | **Destacados param** | PASS | Clicking `Destacados` fires `GET /api/products?…&featuredIn=00000000-0000-4000-8000-000000000200`. |
| 8 | **Cache hit on tab switch** | PASS | Returning to `Todas` after visiting other tabs fires NO new `/api/products` request (cache hit on the prior key). |
| 9 | **Search debounce** | PASS | Slow typing `m / o / f` with 200 ms gaps emits a single `q=mof` request after debounce. |
| 10 | **Search clear button** | PASS | `data-testid="catalog-search-clear"` resets the field to empty and refocuses it (`document.activeElement === input`). |
| 11 | **Global `/` keystroke** | PASS | Pressing `/` while focus is on `<body>` moves focus to `catalog-search-input`. |
| 12 | **ActiveNowToggle — admin** | PASS | Switch + label render; toggling ON fires the next products request **without** `activeNow=true` (i.e. show out-of-window items). |
| 13 | **ActiveNowToggle — cashier** | PASS | Switch and label are absent from the DOM (`querySelector(...) === null`). |
| 14 | **Barcode scanner — single match** | PASS | Fast HID burst `ENT-001` + `Enter` → `Tostones con Salami` tile gets `data-highlighted="true"`, no snackbar. |
| 15 | **Barcode scanner — no match** | PASS | Burst `UNKNOWN777` + `Enter` → `Sin coincidencias para "UNKNOWN777"` snackbar. |
| 16 | **Barcode scanner — multi match** | PASS | Burst `BEB-00` + `Enter` → `Múltiples coincidencias, selecciona manualmente` snackbar; first match (`Jugo de Chinola`) gets highlighted. |
| 17 | **Cart panel — empty state** | PASS | Header `Orden actual`, body shows `Toca un producto para empezar`, total reads `$0.00` (`cart-panel-total`), `Cobrar (Paso 3)` button is `disabled`. |
| 18 | **Cart panel — addItem is no-op** | PASS | Tapping any tile leaves the cart unchanged (Paso 3 stub). |
| 19 | **Console hygiene (cashier flow)** | PASS | `browser_console_messages level=error` returned 0 entries after a full cashier session. |

## Notes / known gaps

- **Single-app card component**: per user feedback during QA, the catalog tile and the admin's "Vista en POS" preview now share a single visual primitive (`@kaipos/ui` → `PosProductCard`). Both surfaces stay in lockstep when the design system shifts.
- **Manual typing inside the scanner-aware search field**: the scanner hook only swallows keystrokes that arrive within `maxIntervalMs` of the prior keystroke. The very first character of a HID burst can briefly land in the input (`Tostones` worth) — `PosHomePage.handleScan` clears the search field on success to avoid a stale debounced query.
- **`favicon.ico 404`** was the only non-app console error observed before login and disappeared after; identical to the admin app.
- **Performance SLA (`< 1 s` for 500 products)** was not measured this run because the seed only contains ~10 products (single page; `pages 2..N` background pool never fires). The instrumentation is in place (`CatalogProvider.fetchAll`) and the follow-up for raising `paginationQuerySchema.limit` stays conditional on a real 500-product dataset.

## Files

- `qa-screenshots/phase-3-desktop-admin.png` — desktop admin view (catalog grid + cart panel).
- `qa-screenshots/phase-3-desktop-cashier.png` — same, as cashier (no `ActiveNowToggle`).
- `qa-screenshots/phase-3-mobile.png` — mobile collapsed cart, `Ver orden` CTA visible.
- `qa-screenshots/phase-3-mobile-cart-drawer.png` — mobile bottom drawer open.

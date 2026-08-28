# @kaipos/frontend-pos

Operator-facing Point of Sale UI for KaiPOS. Vite + React 19 + TypeScript, on the shared
`@kaipos/ui` design system. Sister app to `@kaipos/frontend-admin` — both consume the same
backend at `apps/backend`.

## Dev

```bash
pnpm --filter @kaipos/frontend-pos dev
```

Boots Vite on `http://localhost:3002/pos/` (the app is mounted under the `/pos/` base
so dev mirrors how prod serves it under CloudFront `/pos/*`) and proxies `/api` to the
backend (default `http://localhost:4000`). `pnpm dev` from the repo root brings up
backend + admin + POS together; the POS owns `:3002`, the admin owns `:3000`, the
backend owns `:4000`.

After seeding the backend (`pnpm --filter @kaipos/backend db:seed`), log in with
`admin@lacocinadekai.com` / `admin123`.

## Env vars

| Var                | Default                 | Notes                                                         |
| ------------------ | ----------------------- | ------------------------------------------------------------- |
| `VITE_PORT`        | `3002`                  | Dev server port.                                              |
| `VITE_API_URL`     | `http://localhost:4000` | Proxy target for `/api/*` — backend in dev.                   |
| `VITE_WS_ENDPOINT` | _(empty)_               | `wss://…` URL the WS client connects to. Empty → WS disabled. |
| `VITE_APP_VERSION` | from `package.json`     | Stamped at build time; shown in the login footer.             |

## Production routing

Vite is configured with `base: '/pos/'`, so the build emits assets like
`/pos/assets/index-<hash>.js`. The CloudFront distribution in
`infra/lib/frontend-stack.ts` has a dedicated `/pos/*` behavior pointing at a
separate `kaipos-frontend-pos-prod` S3 bucket, whose objects are uploaded under
a matching `pos/` key prefix so viewer URIs map 1:1 to S3 keys. A CloudFront
Function (`infra/lib/spa-router-pos.js`) rewrites no-extension URIs to
`/pos/index.html` for SPA deep-links; asset URIs pass through unchanged.

The `/pos` prefix is **not** stripped. The rewrite happens before the cache
lookup and the CloudFront cache key is the rewritten URI — it does not include
the behavior or origin — so both SPAs rewriting to `/index.html` made them
share one cache entry and serve each other's app. The two routers must always
rewrite to disjoint URIs.

## PWA

Both SPAs are installable. Config lives in `pwa.config.ts` next to each app's
`vite.config.ts`.

Because the two apps share one origin, two things are load-bearing:

- The POS service worker is served from `/pos/sw.js`, so its scope is capped at
  `/pos/` and it cannot reach the admin app. The admin worker is at `/sw.js`
  with scope `/`, so it _does_ cover `/pos/*` — its
  `navigateFallbackDenylist` therefore excludes `/^\/pos(\/|$)/` (and
  `/^\/api\//`). Without it, a client that visited the admin first would be
  served the admin shell at `/pos/`.
- Workbox derives its cache names from the worker's scope, which keeps the two
  precaches disjoint in the shared `CacheStorage`.

Updates use `registerType: 'prompt'`: a new worker waits until the user accepts
`<UpdatePrompt>`, so the app never reloads out from under a cashier mid-order.

Offline is **read-only**. The shell and the last `GET /api/products` /
`/api/categories` responses are cached (`StaleWhileRevalidate`), so the catalog
stays browsable, but nothing can be submitted — orders are not queued. The
`<OfflineBanner>` says so. The cached catalog is purged on logout and on
business switch, because the Cache API keys on URL alone and terminals are
shared.

Fonts are self-hosted (`@kaipos/ui/fonts`) rather than loaded from Google
Fonts, both to drop a render-blocking cross-origin request and because an
offline shell needs them precached. Inter must be the **variable** build: the
type scale uses weights 450/550/650, which exist only on the `wght` axis.

Icons are generated from `packages/ui/src/assets/pwa-icon*.svg`. After editing
those, run `pnpm icons:generate` from the repo root and commit the PNGs.

The service worker only runs in a build, not on the dev server — test it with
`pnpm --filter @kaipos/frontend-pos build && pnpm --filter @kaipos/frontend-pos preview`.

## Shared runtime

`AuthContext`, `ActiveBranchContext`, `WebSocketContext`, the API/WS client
libs, the auth hooks, and the `RequireAuth` / `RequirePermission` guards all
live in `@kaipos/app-runtime` — shared with `@kaipos/frontend-admin`. The
login / forgot / reset flows live in `@kaipos/auth-pages`. The POS app composes
both: it passes `defaultRedirectPath="/"` to `<LoginPage>` and `fallbackPath="/"`
to `<RequirePermission>` (the admin app passes `/dashboard` for both).

## Paso 2 / Paso 3 split (KAI2-2 → KAI2-3)

This package was scaffolded for the "Paso 2: Interfaz POS — Layout y Navegación" ticket.

- **Phase 1 (scaffold)** — Vite project, replicated `lib/`, `context/`, `hooks/`,
  `components/guards/`, and the `/login`, `/forgot-password`, `/reset-password` flow.
- **Phase 2** — POS header (logo, branch switcher, WS chip, color toggle, user menu) +
  split layout (catalog panel + cart panel placeholder) + permission gating.
- **Phase 3 (current)** — catalog grid (category tabs, search, product tiles), barcode
  scanner hook, no-op `CartContext` + `CartPanel` placeholder. Total stays at `$0.00`
  and the modifier modal is out of scope — those ship in Paso 3 (`KAI2-3`).

### Hand-off boundary with KAI2-3 (Paso 3)

The cart is intentionally inert in this ticket. KAI2-3 replaces these surfaces with
real behavior:

- `src/context/CartContext.tsx` — `addItem` / `clear` log via `lib/logger.ts` and never
  mutate state. Replace the no-op body with reducer-backed line items + modifier state.
- `src/components/CartPanel.tsx` — renders the empty-state row, a `$0.00` total via
  `Typography variant="moneyLg"`, and a disabled `Button size="pos">Cobrar (Paso 3)`.
  Wire up line-item rendering, totals, tax, and the active "Cobrar" submission flow.
- `src/pages/PosHomePage.tsx` — taps on configurable tiles open an info `Snackbar`
  ("Configuración pendiente (Paso 3)"). Swap that for the real modifier modal once
  the modal lands in `@kaipos/ui` / a shared package.
- `src/state/CatalogProvider.tsx` — session-lived cache keyed by
  `(branchId, category, q, activeNow, featuredIn)`. Page 1 blocks first paint;
  page 2..N runs in a 5-wide pool. The 100-item page limit comes from
  `packages/shared/src/schemas/pagination.ts:16` — if the 500-product SLA misses, raise
  it (tracked in `.specs/NT-34318b91_paso-2-pos-layout/follow-up.md`).

See `.specs/NT-34318b91_paso-2-pos-layout/` for the spec, plan, and QA report.

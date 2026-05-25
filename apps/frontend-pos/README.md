# @kaipos/frontend-pos

Operator-facing Point of Sale UI for KaiPOS. Vite + React 19 + TypeScript, on the shared
`@kaipos/ui` design system. Sister app to `@kaipos/frontend-admin` — both consume the same
backend at `apps/backend`.

## Dev

```bash
pnpm --filter @kaipos/frontend-pos dev
```

Boots Vite on `http://localhost:3002` and proxies `/api` to the backend (default
`http://localhost:4000`). `pnpm dev` from the repo root brings up backend + admin + POS
together; the POS owns `:3002`, the admin owns `:3000`, the backend owns `:4000`.

After seeding the backend (`pnpm --filter @kaipos/backend db:seed`), log in with
`admin@lacocinadekai.com` / `admin123`.

## Env vars

| Var                | Default                 | Notes                                                         |
| ------------------ | ----------------------- | ------------------------------------------------------------- |
| `VITE_PORT`        | `3002`                  | Dev server port.                                              |
| `VITE_API_URL`     | `http://localhost:4000` | Proxy target for `/api/*` — backend in dev.                   |
| `VITE_WS_ENDPOINT` | _(empty)_               | `wss://…` URL the WS client connects to. Empty → WS disabled. |
| `VITE_APP_VERSION` | from `package.json`     | Stamped at build time; shown in the login footer.             |

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

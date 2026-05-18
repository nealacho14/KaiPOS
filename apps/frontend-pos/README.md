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

- **Phase 1 (current scaffold)** — Vite project, replicated `lib/`, `context/`, `hooks/`,
  `components/guards/`, and the `/login`, `/forgot-password`, `/reset-password` flow.
  Authenticated `/` renders a placeholder.
- **Phase 2** — POS header (logo, branch switcher, WS chip, color toggle, user menu) +
  split layout (catalog panel + cart panel placeholder) + permission gating.
- **Phase 3** — catalog grid (category tabs, search, product tiles), barcode scanner hook,
  no-op `CartContext` + `CartPanel` placeholder. Subtotal/total stay at `$0.00` and the
  modifier modal is out of scope — those ship in Paso 3 (`KAI2-3`).

See `.specs/NT-34318b91_paso-2-pos-layout/` for the spec, plan, and QA report.

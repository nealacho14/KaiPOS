# `@kaipos/frontend-admin`

React 19 + Vite SPA for the KaiPOS administration console.

## Dev

```bash
pnpm --filter @kaipos/frontend-admin dev     # :3000, proxies /api to :4000
pnpm docker:up                                # docker variant on :3001 + backend :4001
```

## Shell routes

| Path         | Guard                                                | Page               |
| ------------ | ---------------------------------------------------- | ------------------ |
| `/login`     | public                                               | `LoginPage`        |
| `/dashboard` | `RequireAuth`                                        | `DashboardPage`    |
| `/users`     | `RequireAuth` + `RequirePermission('users:read')`    | `UsersListPage`    |
| `/products`  | `RequireAuth` + `RequirePermission('products:read')` | `ProductsListPage` |
| `/debug/ws`  | `RequireAuth`                                        | `DebugWebSocket`   |
| `*`          | `RequireAuth` (below `AppLayout`)                    | `NotFoundPage`     |

`/` redirects to `/dashboard`. Unknown paths inside the authenticated shell render the 404 page.

## Shell architecture

- `App.tsx` is the router root; wrapped by `BrowserRouter` + `AuthProvider` in `main.tsx`.
- `AppLayout` owns a single `WebSocketProvider` so `DashboardPage` and `DebugWebSocket` share one socket.
- The WS connects on `status === 'authenticated'` using the session access token. If `VITE_WS_ENDPOINT` is unset the chip renders `Inactivo` and no connection is attempted.
- Responsive sidebar: permanent drawer `≥ md`, temporary drawer with a hamburger trigger in the header `< md`.

## Design system rule

**All MUI surface goes through `@kaipos/ui`.** `apps/frontend-admin/src` must not import from `@mui/material/*` directly. Add re-exports to `packages/ui/src/components/index.ts` as components are needed. The same applies to icons — they are re-exported from `@kaipos/ui` (backed by `lucide-react`).

Verification:

```bash
rg "from '@mui/material" apps/frontend-admin/src   # expected: no matches
```

## Auth plumbing

- `context/AuthContext.tsx` — hydrates from `localStorage` on mount via `GET /api/auth/me`.
- `lib/api.ts` — `api()` + `apiJson()` inject the bearer token and transparently run a single-flight refresh on `401 TOKEN_EXPIRED`.
- `lib/auth-storage.ts` — typed `getSession` / `setSession` / `clearSession` plus a tiny pub-sub.

## Catálogo de productos

`ProductsListPage` y `ProductFormPage` cubren el catálogo avanzado de la sucursal.

- **Modo reordenar**: botón "Reordenar" en el header activa drag-and-drop por fila (`@dnd-kit/sortable`). Mientras está activo, los filtros de búsqueda / inactivos / destacados / activo-ahora se deshabilitan; el de categoría sigue disponible. "Guardar orden" envía un único `PATCH /api/products/reorder` con `{ id, sortOrder }` por fila; "Cancelar" descarta los cambios locales.
- **Filtro `Sólo destacados`**: pasa `featuredIn=branchId` al API y muestra solo los productos marcados como destacados para la sucursal activa (preferencia por-sucursal).
- **Filtro `Sólo disponibles ahora`**: pasa `activeNow=true`. El backend filtra contra `availabilityWindow` usando la zona horaria de la sucursal; el conteo total de paginación es pre-filtro (se muestra un info-alert que lo explica).
- **Columna "Destacado"**: icono Star clickable por fila (requiere `products:write`). Estado optimista con revert en error.
- **Variantes, `maxSelectable`, horarios por opción, `availabilityWindow`, `barcode`**: editados en `ProductFormPage`. Validación en cliente (SKU duplicado entre variantes, `maxSelectable ≤ options.length`) y al guardar el servicio backend rechaza con `VARIANT_SKU_DUPLICATE` / `MAX_SELECTABLE_EXCEEDS_OPTIONS`.
- **WS**: ante `product.created/updated/deleted/reordered` la lista se refetchea, excepto si el usuario está en modo reordenar (para no descartar el draft).

## Testing

```bash
pnpm --filter @kaipos/frontend-admin test
```

Vitest + Testing Library + `happy-dom`. No real backend or WebSocket is required — tests mock `fetch` and use `MemoryRouter` to place the shell at a specific route.

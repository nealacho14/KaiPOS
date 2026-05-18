# Spec: Paso 2 — Interfaz POS: Layout y Navegación

| Field         | Value                                                          |
| ------------- | -------------------------------------------------------------- |
| Notion Ticket | [NT-34318b91](https://notion.so/34318b913fdd814f82a2dcf2e2907dfd) |
| Status        | To-do                                                          |
| Priority      | Alta                                                           |
| Branch        | `NT-34318b91/paso-2-pos-layout/feature`                        |
| Created       | 2026-05-18                                                     |

## Context

Construir el **shell del POS** como una nueva app `apps/frontend-pos` (Vite + React 19 + TS strict, Node 20) que espeja el plumbing de `apps/frontend-admin` (auth, `ActiveBranchProvider`, `WebSocketProvider`, `lib/api.ts`, `lib/auth-storage.ts`) pero con un layout touch-first dedicado al flujo de pedido. Esta es la **Fase 2 / Paso 2 (KAI2-2)** del project board "Fase 2: Core POS + KDS" y prepara la superficie sobre la que Paso 3 (KAI2-3) implementará el carrito, modificadores, totales y envío a KDS.

Se eligió una app nueva en lugar de una ruta `/pos` dentro de `frontend-admin` porque:

- El admin usa una sidebar permanente de 240 px que no encaja con un split touch-first de pantalla completa.
- `cashier` y `waiter` no necesitan el bundle del admin (gestión de productos, usuarios, drag-and-drop de reorden); enviar menos JS al dispositivo táctil es deseable.
- Los tokens y variantes táctiles ya existen en `@kaipos/ui` (`Button size="pos"`, `Button variant="tile"`, `Card variant="ticket"`, `Typography variant="money*"`, `theme.posSize.*`) y este es su consumidor natural.
- El despliegue puede ir bajo CloudFront en `/pos/*` o un subdominio sin tocar al admin.

Se reutilizan **sin duplicar**: `@kaipos/ui`, `@kaipos/shared` (tipos, schemas Zod, permisos), `@kaipos/eslint-config`, `@kaipos/tsconfig`, y los endpoints `GET /api/products` y `GET /api/categories` ya existentes en el backend (incluyendo el filtro `featuredIn=<branchId>` alimentado por `ProductPreference` y el toggle `activeNow` que respeta `availabilityWindow`).

El panel del carrito se entrega como **contenedor visual vacío** con un `CartContext` mínimo (`items: []`, `addItem(product)` no-op, `clear()`) y un callback `onProductSelected(product)`. **No** se implementa lógica de totales, impuestos, modificadores, persistencia ni publicación WebSocket — todo eso vive en KAI2-3.

## Requirements

### Estructura de la app

- Crear `apps/frontend-pos` (`@kaipos/frontend-pos`) con `package.json`, `vite.config.ts`, `tsconfig.json` (extiende `@kaipos/tsconfig`), `eslint.config.js` (usa `@kaipos/eslint-config/react`), `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`.
- Integrar en `pnpm-workspace.yaml` (ya cubre `apps/*`) y `turbo.json` (tareas estándar `dev/build/lint/typecheck/test` ya aplican por convención).
- `pnpm dev` levanta backend + admin + POS en puertos distintos: backend `:4000`, admin `:3000`, POS `:3002`.
- Proxy de Vite a `/api` → `http://localhost:4000` (mismo patrón que admin).
- Pipeline `quality` (lint / typecheck / build / test) cubre la nueva app sin cambios en CI (Turborepo la recoge).

### Layout y navegación

- **Layout split** ocupando 100 % del viewport:
  - Panel izquierdo (≈70 % ancho en desktop) con búsqueda + tabs de categorías + grid de productos.
  - Panel derecho (≈30 %, mín 360 px, max 480 px) con el `CartPanel` placeholder.
- En `< md` (móvil/tablet vertical): stack vertical — el panel del carrito queda como bottom-sheet/drawer colapsable; Paso 3 implementa el contenido, este ticket entrega el contenedor.
- **Header POS minimal**: `KaiPOSLogo`, `ActiveBranchSwitcher`, `WsStatusChip`, `ColorSchemeToggle`, `UserMenu` con logout. Sin sidebar de admin.
- **Tabs de categorías** horizontales con scroll (no sidebar), usando `Tabs variant="scrollable"`. Pestañas pinned: `Todas` (sin filtro `category`) y `Destacados` (con `featuredIn=<activeBranchId>`); el resto se carga desde `GET /api/categories` y se ordena por `sortOrder`.

### Catálogo y grid de productos

- Grid responsivo de tarjetas con `Button variant="tile"` o `Card` táctil (alto interactivo mínimo `theme.posSize.pos` = 56 px). Layout `repeat(auto-fill, minmax(160px, 1fr))` con `gap` 1.5–2 (escala spacing).
- Cada tarjeta muestra: imagen (con fallback de iniciales si no hay `imageUrl`), `name` (`Typography subtitle1`, 2 líneas máx con ellipsis), precio (`Typography variant="money"`).
- Llamadas: `GET /api/products?branchId=<active>&category=<id>&limit=100`. Para 500+ productos, paginar `page=1..N` en background; render página 1 inmediato y enriquecer al llegar páginas siguientes.
- **Inactivos**: por defecto `includeInactive=false`. El POS no expone toggle (el cajero no debería ver inactivos).
- **Horario**: por defecto `activeNow=true` para ocultar productos fuera de su `availabilityWindow`. Toggle "Ver fuera de horario" disponible **sólo** para `manager`/`admin`.
- **Badge "Configurable"**: si `product.modifierGroups.some(g => g.required)`, mostrar `Chip` pequeño en la tarjeta. Al presionar un tile configurable, llamar `onProductSelected(product, { requiresConfig: true })` — Paso 3 abrirá el modal real. En este ticket basta un `Snackbar` informativo "Configuración pendiente (Paso 3)".

### Búsqueda

- `TextField` arriba del grid, autofocus al montar y al presionar `/`. `inputMode="search"`, `enterKeyHint="search"`.
- Debounce 150–200 ms → `GET /api/products?branchId=…&q=<value>&limit=100`. El backend ya matchea `name | sku | barcode` con prefix anchored (`^… i`).
- Botón limpiar (`X` icon) que resetea el query y refoca el input.

### Barcode scanner HID

- Hook global `useBarcodeScanner({ onScan })` montado en el layout. Detección:
  - Ráfaga de `keydown` con intervalo `≤ 30 ms` entre eventos.
  - Longitud total `≥ 6` chars.
  - Terminada con `Enter`.
  - Ignora eventos cuando el foco está en un `INPUT/TEXTAREA/SELECT`, salvo el input dedicado de búsqueda (configurable: aceptar el escaneo o redirigirlo al endpoint).
- Al disparar, llamar `GET /api/products?branchId=…&q=<code>&limit=2`:
  - **1 match** → `onProductSelected(product)` + feedback visual breve sobre la tarjeta correspondiente.
  - **0 matches** → `Snackbar` "Sin coincidencias para `<code>`".
  - **> 1 matches** → resaltar y enfocar el primer match en el grid + `Snackbar` "Múltiples coincidencias, selecciona manualmente".
- El estado del scanner no debe pelear con la búsqueda manual (no escribir el código en el `TextField`).

### Destacados / Favoritos

- La pestaña "Destacados" pasa `featuredIn=<activeBranchId>` al mismo endpoint usando el mismo helper que el resto (`lib/products-api.ts` del POS, replicado o reutilizado).
- **No** hay administración de destacados en el POS — sigue siendo prerrogativa del admin (`PATCH /api/products/:id/feature` desde `ProductsListPage`).

### Carrito (placeholder)

- Componente `CartPanel` con `Card variant="ticket"`:
  - Header "Orden actual".
  - Lista vacía con `EmptyState` ("Toca un producto para empezar").
  - Footer con subtotal/total en `Typography variant="moneyLg"` mostrando `$0.00`.
  - `Button size="pos"` deshabilitado "Cobrar (Paso 3)".
- `CartContext` mínimo: `items: []`, `addItem(product)`, `clear()`. `addItem` sólo loguea vía un wrapper neutro (nunca `console.log`). Paso 3 lo reemplaza.

### Permisos y branch scope

- Ruta raíz `/` gated por `RequireAuth` + `RequirePermission permission="products:read"`. Sin acceso si el usuario no tiene `branchIds` válidos.
- Si el usuario tiene una sola sucursal asignada, `ActiveBranchProvider` la elige automáticamente; si tiene varias, mostrar selector tipo `BusinessPicker` al primer login.
- **Super_admin**: el POS no opera como POS de super_admin (no tiene `businessId` concreto). Mostrar empty state "Selecciona un negocio para operar el POS" reutilizando el flow del admin.

### WebSocket

- Montar `WebSocketProvider` y conectar al token activo (mismo patrón que `AppLayout` del admin). Mostrar `WsStatusChip` en el header. Paso 3 se suscribirá a `product.*` y `order.*`; en este ticket basta dejar el provider listo.

### Design system — invariantes (no negociables)

- **Cero** imports de `@mui/material`, `@mui/material/*` o `lucide-react` en `apps/frontend-pos/src` (regla `no-restricted-imports` ya enforzada). Todo vía `@kaipos/ui`.
- **Cero** literales numéricos para `fontSize`, `fontWeight`, `borderRadius` en `sx`/`style`. Usar variantes de `Typography` y `theme.radii.*`.
- Spacing sólo vía la escala MUI (`p={2}`, `gap={1.5}`, `theme.spacing(n)`); nunca strings con `px`.
- Colores sólo vía `palette.*` o tokens `colors.*`. Nunca hex/rgb literales.
- `Button size="pos"` para acciones primarias del flujo de pedido y CTA del cart panel.

### Performance

- **SLA**: catálogo de 500 productos visible y navegable en `< 1 s` en red local con backend warm.
- Estrategia: página 1 (`limit=100`) bloquea el primer paint; páginas 2..N se cargan en background y se mergean al state. Render del grid con `content-visibility: auto` o virtualización si el conteo supera 300 visibles tras filtros.
- Cachear la respuesta por `(branchId, category, q, activeNow, featuredIn)` en memoria mientras la sesión esté activa, para que cambiar de tab no re-pegue al backend.
- **Riesgo conocido**: `paginationQuerySchema.limit` está topado a 100 (`packages/shared/src/schemas/pagination.ts:16`). Si la paginación incremental no alcanza el SLA, documentar como **follow-up** para subir el tope (o exponer un `?limit=500` específico para el POS) — **no se cambia en este ticket**.

### Tests

- Vitest + Testing Library cubre:
  - Render del layout split (header + tabs + grid + cart panel).
  - Filtrado por categoría con `fetch` mockeado.
  - Búsqueda con debounce.
  - `useBarcodeScanner` mock dispara `onProductSelected`.
  - Badge "Configurable" aparece cuando corresponde.
  - `CartPanel` muestra empty state y CTA deshabilitada.

## Acceptance Criteria

- [ ] Existe `apps/frontend-pos` con `pnpm --filter @kaipos/frontend-pos dev | build | lint | typecheck | test`, integrado en Turborepo, y `pnpm dev` lo levanta junto al backend (`:4000`) y al admin (`:3000`) en `:3002`.
- [ ] La ruta `/` (gated por `products:read`) renderiza el layout split: header POS + panel de catálogo + `CartPanel` placeholder.
- [ ] Las pestañas de categorías cargan desde `GET /api/categories` e incluyen pinned `Todas` y `Destacados`; cambiar de pestaña filtra el grid (`category=` o `featuredIn=`).
- [ ] La búsqueda dispara `GET /api/products?q=…` con debounce ≤ 200 ms y matchea por nombre, SKU o barcode (delegado al backend).
- [ ] Un código escaneado vía HID (ráfaga + Enter) llama al API y, con match único, dispara `onProductSelected(product)` con feedback visual breve; `0` y `>1` matches generan `Snackbar` informativo.
- [ ] Productos con `modifierGroups.some(g => g.required)` muestran badge "Configurable" en la tarjeta.
- [ ] El catálogo de 500 productos es navegable en `< 1 s` (página 1 bloqueante, resto en background). Si no se alcanza el SLA, queda documentado el follow-up para el límite de paginación.
- [ ] `pnpm lint` y `pnpm typecheck` pasan en la nueva app sin desactivar `no-restricted-imports` ni reglas de tokens.
- [ ] `rg "from '@mui/material" apps/frontend-pos/src` → cero matches.
- [ ] Tests Vitest pasan: layout, filtrado, búsqueda con debounce, scanner mock → `onProductSelected`, badge "Configurable", `CartPanel` empty state.

## Out of Scope

Lo siguiente lo cubre **Paso 3 — KAI2-3**:

- Estado real del carrito: cantidad por ítem, modificadores aplicados, notas por ítem, nota general.
- **Modal funcional de modificadores** con grupos `required`, `maxSelectable`, opciones con `available.daysOfWeek/from/to`, `priceDelta`.
- Cálculo de subtotal / impuestos / total y configuración de tasa por sucursal.
- Numeración secuencial de órdenes, transiciones de estado, persistencia en DB.
- Publicación WebSocket al confirmar (envío a KDS).
- Subir el `limit` máximo del `paginationQuerySchema` (queda como follow-up condicional al SLA).
- Cambios en el backend salvo que el SLA de 500 productos lo fuerce (en cuyo caso se abre PR separado).
- Administración de destacados desde el POS (sigue siendo del admin).

## Open Questions

- ¿Compartir `AuthContext`/`ActiveBranchContext`/`WebSocketContext`/`lib/api.ts`/`lib/auth-storage.ts` extrayéndolos a un paquete compartido (p.ej. `@kaipos/app-runtime`) en lugar de replicarlos desde `frontend-admin`? La extracción evita drift pero suma alcance al ticket. **Decisión pendiente en la fase de plan** — si se replica, abrir follow-up para consolidar.
- Ruta de despliegue final del POS: `/pos/*` bajo el mismo CloudFront del admin vs. subdominio dedicado. Afecta a la config de Vite (`base`) y a infra; **se difiere a un ticket de infraestructura**.
- Comportamiento del scanner cuando el foco está en el `TextField` de búsqueda: ¿aceptar el escaneo igual y limpiar el input, o tratarlo como entrada manual? Se asume **redirigir al endpoint** (sin escribir en el input) salvo que QA pida lo contrario.

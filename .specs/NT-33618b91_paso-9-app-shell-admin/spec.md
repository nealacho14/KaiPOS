# Spec: Paso 9 — App Shell de Administración (Frontend React)

| Field         | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd818d90a4e19e23fd0418) |
| Status        | In Progress                                                       |
| Priority      | Alta                                                              |
| Branch        | `NT-33618b91/paso-9-app-shell-admin/feature`                      |
| Created       | 2026-04-17                                                        |

## Context

La app `apps/frontend-admin` existe hoy como una SPA de debug con una sola
página (`DebugWebSocket`) y un `App.tsx` de health-check que hace hash-routing
manual. Este paso la convierte en la **app shell de administración**: un
contenedor con autenticación, layout, navegación por roles y conexión
WebSocket, sobre el cual se montarán las features de negocio más adelante
(productos, órdenes, reportes, etc.).

Toda la infraestructura que consume la shell ya está disponible:

- **API de auth** (`apps/backend/src/routes/auth.ts`, `services/auth.ts`):
  `POST /api/auth/login` → `{ accessToken, refreshToken, user }`,
  `POST /api/auth/refresh`, `POST /api/auth/logout`, `forgot/reset-password`.
  **No existe `GET /api/auth/me`** todavía; este spec lo agrega.
- **API de users** con RBAC (`apps/backend/src/routes/users.ts`,
  `services/users.ts`): listar/crear/editar/borrar protegido por
  `requirePermission('users:read' | 'users:write' | 'users:delete')`.
  `users:read` lo tienen `super_admin`, `admin` y `manager`.
- **RBAC** (`apps/backend/src/lib/permissions.ts`): `ROLE_PERMISSIONS`,
  `Permission`, `hasPermission` y `SUPER_ADMIN_BUSINESS_ID` viven en el
  backend. Este spec los mueve a `@kaipos/shared` para consumo del frontend.
- **Roles y tipos** en `@kaipos/shared`: `UserRole`, `TokenPayload`,
  `SafeUser`.
- **Cliente WebSocket** (`apps/frontend-admin/src/lib/ws-client.ts` +
  `src/hooks/useWebSocket.ts`): reconexión exponencial + re-subscripción.
  Endpoint inyectado al bundle vía `VITE_WS_ENDPOINT` (ver
  `scripts/deploy-prod.sh`). **Se reusa sin reimplementar.**
- **Token storage** (`apps/frontend-admin/src/lib/auth-storage.ts`):
  guarda sólo `accessToken`. Se extiende a `refreshToken` + caché opcional
  del user.
- **Design system `@kaipos/ui`** (commit `58b07b0`): expone
  `KaiPOSThemeProvider`, `kaiPOSTheme`, tokens (`colors`, `spacing`,
  `typography`, `radius`, `shadows`, `zIndex`), `KaiPOSLogo`,
  `ColorSchemeToggle` y re-exporta MUI v7. Hoy está construido sobre una
  paleta **navy + electric blue** (`colors.primary[500]` = `#3B82F6`).

### Canon visual nuevo: `kaiPos-ds/`

La fuente de verdad visual para esta tarea es **`kaiPos-ds/`**, un paquete
de referencia generado por Claude design y ubicado en la raíz del repo. Es
**requisito estricto** que todos los componentes UI de la shell se basen en
este sistema:

- `kaiPos-ds/theme.ts` — theme de MUI v7 completo con paleta **teal + amber**
  sobre **warm-slate neutrals**, tipografía **Inter + JetBrains Mono**
  (tabular-nums en dinero), escala de radii (`xs/sm/md/lg/xl/pill`), escala
  de shadows (`xs/sm/md/lg/xl/inset/focus`), escala de touch-targets
  (`min/pos/kds/desktop/dense`) y overrides por componente (Button incl.
  `size="pos"|"kds"` y `variant="tile"|"danger"`, Card incl.
  `variant="ticket"`, OutlinedInput, etc.).
- `kaiPos-ds/auth.html` + `kaiPos-ds/auth-components.jsx` — pantallas de
  autenticación. Contiene tres artboards: `StaffPinLogin` (POS terminal),
  **`MerchantLogin` (web admin — el diseño canónico de `/login` de este
  ticket)** y `MerchantRegister` (wizard de 4 pasos).
- `kaiPos-ds/design-system.html` — catálogo general de componentes del DS.
- `kaiPos-ds/components.html` + `pos-components.jsx` / `kds-components.jsx`
  / `floor-components.jsx` — pantallas POS, KDS y Floor Plan (no aplica a
  esta tarea, pero referencia del alcance global del DS).

Como `@kaipos/ui` hoy usa una paleta distinta (navy/blue), este spec incluye
**retokenizarlo para adoptar los tokens y overrides de
`kaiPos-ds/theme.ts`** antes de implementar la shell (Fase 0 del plan).
Fuera de esa fase, la shell consume exclusivamente `@kaipos/ui`: no se
permiten imports directos a `@mui/material` desde `apps/frontend-admin/src/`.

El stack permanece en Vite 6 + React 19 + TypeScript estricto según
convención del monorepo.

## Requirements

### Design system canon (requisito transversal)

- **Todos los componentes UI nuevos se basan estrictamente en
  `kaiPos-ds/`**: paleta (teal `#0B7A75` / amber `#E8833A` / warm-slate),
  tipografía (Inter UI + JetBrains Mono para números y dinero), radii,
  shadows, focus ring y overrides de componentes.
- Ningún componente de la shell importa directo de `@mui/material`. El
  consumo va por `@kaipos/ui` (que re-exporta MUI v7 con el theme
  retokenizado).
- `@kaipos/ui` se retokeniza para adoptar `kaiPos-ds/theme.ts` como theme
  base (primitivos, `buildPalette`, `buildComponents`, module augmentation
  tipada), y `KaiPOSLogo` pasa a usar brand teal (no navy).
- Google Fonts de Inter (pesos 400/450/500/550/600/650/700) + JetBrains
  Mono cargan desde `index.html` de `apps/frontend-admin` con los mismos
  pesos que usa `kaiPos-ds/auth.html`.

### Autenticación y sesión

- Página `/login` con formulario email/password y estados de error
  (credenciales inválidas 401, validación 400, account locked 429, error
  de red, 5xx genérico).
- **Diseño estricto**: la página replica el artboard **`MerchantLogin`**
  de `kaiPos-ds/auth-components.jsx` — layout de dos paneles (editorial
  teal 700 a la izquierda + formulario a la derecha), con SSO placeholders,
  divider, campos email/password con toggle mostrar/ocultar, checkbox
  remember 30 días, botón primario full-width y helper card informativo
  sobre el staff PIN. (Ver detalle visual en "Diseño de `LoginPage`".)
- Al login exitoso: persistir `accessToken` + `refreshToken` en
  `localStorage` (extender `auth-storage.ts`) y redirigir a `/dashboard`.
- Logout: llama a `POST /api/auth/logout`, limpia storage, cierra la
  conexión WS y redirige a `/login`.
- **Refresh automático**: un cliente HTTP compartido (wrapper de `fetch`)
  que al recibir `401 TOKEN_EXPIRED` intenta `POST /api/auth/refresh` con
  el refreshToken, guarda el nuevo par y reintenta la request **una sola
  vez**. Si el refresh falla, desloguea. Single-flight para evitar
  refreshes en paralelo.
- **Rehidratación al recargar**: si hay tokens en storage, consultar
  **`GET /api/auth/me`** (endpoint nuevo, devuelve el `SafeUser` derivado
  del JWT) para recuperar el perfil. Si falla con 401, deslogear.
- **Super_admin** puede loguearse y ve la shell con un placeholder en el
  header (ej. "Admin global" en vez de nombre de business). El business
  picker queda **fuera de scope**.

### Diseño de `LoginPage` (estricto, según `MerchantLogin`)

- Layout: grid de 2 columnas `1fr 1fr` en desktop, stack en tablet (sólo
  se muestra el panel derecho bajo `md`).
- **Panel izquierdo (brand editorial)**:
  - Fondo `palette.primary.dark` (teal 700 `#06504C`).
  - Textura sutil de grid con líneas a `rgba(255,255,255,.04)` cada 32px.
  - Header: `KaiPOSLogo` variant `horizontal` (marca blanca sobre teal) +
    chip "Merchant" (uppercase, tracking `.08em`, bg `rgba(255,255,255,.12)`).
  - Sección editorial inferior: eyebrow "Panel de administración"
    (uppercase `.1em`, `rgba(255,255,255,.65)`), headline
    `h1 44px/700/-0.02em` con texto "Un solo lugar para tu servicio." en
    dos líneas, bajada body 16/1.5 con opacity .75.
  - Stats strip (3 columnas, separador 1px top): `12,400+ restaurantes`,
    `$2.4B procesado / año`, `99.99% uptime` — números en JetBrains Mono
    22/700, label uppercase `.06em` opacity .6.
- **Panel derecho (formulario)**:
  - Link superior derecho: `¿Nuevo en kaiPOS? Crea una cuenta →`
    (para este ticket es un link muerto — la página de registro es otro
    ticket).
  - Card de formulario centrada vertical, `max-width 420px`:
    - Eyebrow uppercase `.08em` "Bienvenido de vuelta".
    - `h2 32px/700/-0.02em` "Inicia sesión en tu panel".
    - Botones SSO (Google + Apple) en grid `1fr 1fr` como **placeholders
      deshabilitados** con tooltip "Próximamente" (OAuth real es otro ticket).
    - Divider "o con email" (uppercase `.08em`, líneas a `divider`).
    - `TextField` Email (tipo email, autocomplete `email`, focus inicial).
    - `TextField` Password con botón `Mostrar/Ocultar` absoluto a la
      derecha del input; autocomplete `current-password`.
    - Link `¿Olvidaste?` en el label del password (link muerto — pantallas
      de forgot/reset son otro ticket).
    - Checkbox "Mantener sesión en este dispositivo (30 días)", accent en
      `primary.main`.
    - Button contained primary full-width, `minHeight 48`, radius 10:
      "Iniciar sesión".
    - Helper card (bg paper, border divider, radius 10) con icono `⌘` en
      badge teal-soft: "¿Eres miembro del staff? Ingresa directamente en la
      terminal con tu PIN de 4 dígitos." (puramente informativo; el PIN
      login vive en POS terminal).
  - Footer fino: links "Términos · Privacidad · Estado del sistema" +
    versión en JetBrains Mono (por ejemplo `v 2.8.14`, hardcoded o leído
    de `package.json`).
- **Estados**:
  - Loading: el botón "Iniciar sesión" entra a estado loading (spinner +
    disabled) durante el request.
  - Error de API: `Alert severity="error"` sobre el formulario, con foco
    programático para anunciar el error; mensaje legible por código
    (credenciales inválidas, cuenta bloqueada, validación, error de red).
  - Focus inicial en el input de email al montar.
- **Accesibilidad**: `aria-*` correctos, labels asociados, anuncios de
  error con `aria-live="polite"`, orden de tab consistente.

### Backend

- **Agregar `GET /api/auth/me`** en `apps/backend/src/routes/auth.ts`,
  protegido con `requireAuth()`. Devuelve el `SafeUser` (sin
  `passwordHash`) desde `c.get('user')`.
- Test de integración: 200 con token válido, 401 sin token, 401 con token
  expirado.

### Routing y guards

- Instalar `react-router-dom@^7`. Rutas:
  - `/login` (pública)
  - `/` → redirect a `/dashboard`
  - `/dashboard` (`RequireAuth`)
  - `/users` (`RequireAuth` + `RequirePermission('users:read')`)
  - `/debug/ws` (`RequireAuth`) — migrada desde `#/debug/ws` al nuevo router
  - `*` → página 404 con CTA "Volver al dashboard"
- **Guards**:
  - `RequireAuth`: si el contexto indica `unauthenticated`, navega a
    `/login` preservando `from` (`state`) para volver tras autenticar.
  - `RequirePermission(permission)`: si el rol no tiene el permiso,
    redirige a `/dashboard`.

### RBAC compartido

- Mover `ROLE_PERMISSIONS`, `Permission`, `hasPermission` y
  `SUPER_ADMIN_BUSINESS_ID` de `apps/backend/src/lib/permissions.ts` a
  `packages/shared/src/permissions.ts` y re-exportarlos desde
  `@kaipos/shared`. Backend re-exporta vía shim o migra sus imports.

### Layout

- **`AppLayout`** como layout anidado de react-router (`<Outlet />`):
  - **Header** (top bar, altura ~64, `background.paper` con
    `border-bottom divider`):
    - Izquierda: `KaiPOSLogo` variant `horizontal` (desktop) o `icon`
      (tablet `< md`), separador, nombre del business (placeholder
      "Admin global" para super_admin), chip secundario con rol.
    - Derecha: **chip de estado WS**
      (`idle | connecting | open | closed | reconnecting`, con color por
      estado: `open` → success, `connecting/reconnecting` → warning,
      `closed/idle` → default; punto circular a la izquierda del texto),
      `ColorSchemeToggle`, menú de usuario (avatar con iniciales en
      círculo coloreado por rol) → dropdown con nombre + email, divider
      y "Cerrar sesión".
  - **Sidebar**: fijo en desktop (ancho ~240), `Drawer` temporal bajo
    `md` (< 960). Items condicionados por permisos del rol:
    - Dashboard — siempre visible si auth.
    - Usuarios — sólo si `hasPermission(role, 'users:read')`.
    - Debug · WebSocket — siempre visible si auth (por ahora).
    - Item activo con fondo `action.selected` y borde izquierdo
      `primary.main`. Iconografía consistente (Material Icons o lucide,
      definir en plan).
  - **Main content**: contenedor responsive con padding consistente, usa
    `PageHeader` (componente local) para título/subtítulo/acciones.

### Páginas

- **`LoginPage`**: descrita arriba; state local para el formulario (no se
  introduce librería de forms aún).
- **`DashboardPage`** (placeholder): `PageHeader` + grid de `Card`s
  mostrando `user.name`, `user.role`, `businessId`, `branchIds` y estado
  del WS. Sin métricas de negocio.
- **`UsersListPage`** (requiere `users:read`): `PageHeader` + `Table` con
  columnas Nombre, Email, Rol (chip), Sucursales, Estado. Estados:
  loading (`Skeleton` 4–6 rows), error (`Alert` con botón "Reintentar"),
  empty (`EmptyState` local: icono + título + subtítulo). Sin acciones
  CRUD en esta iteración.

### Conexión WebSocket

- Reusar `useWebSocket({ endpoint: import.meta.env.VITE_WS_ENDPOINT })` sin
  reimplementar el cliente.
- Conectar automáticamente al autenticarse (dentro de `AppLayout`) y
  desconectar al logout.
- El `status` del hook alimenta el chip del header.
- Canales por default (server-side `user:<id>`, `business:<id>`,
  `branch:<id>`) bastan — no hay `subscribe`s manuales en esta iteración.

### Estados y accesibilidad

- Loading / error / empty consistentes en cualquier fetch.
- Focus management sensato: inicial en email al cargar login; foco en
  alert tras fallo de login.
- Contraste AA (ya está tuneado en el theme de `kaiPos-ds/`).

### Responsive

- Funcional en desktop y tablet (ancho mínimo **1024px**). Sidebar colapsa
  a drawer bajo `md`. No se optimiza móvil (< 600px) en esta iteración.

### Tests

- **Frontend** (Vitest + React Testing Library):
  - `LoginPage`: happy path (submit → navega a `/dashboard`), error 401
    (alert + focus), error 429 (mensaje de account locked), error de red.
  - Guards: `RequirePermission('users:read')` deja pasar a admin y
    redirige a cajero.
  - `api.ts` refresh automático (fetch mockeado): 401 `TOKEN_EXPIRED` →
    refresh → reintento exitoso; y refresh fallido → clear + redirect.
- **Backend** (Vitest integración): `GET /api/auth/me` — 200 con token
  válido, 401 sin token, 401 con token expirado.

## Acceptance Criteria

- [ ] `@kaipos/ui` está retokenizado a teal/amber + warm-slate según
      `kaiPos-ds/theme.ts` (paleta, tipografía Inter + JetBrains Mono,
      radii, shadows, overrides). `KaiPOSLogo` usa brand teal.
- [ ] Inter + JetBrains Mono cargan desde `index.html` con los pesos del
      mockup (Inter 400/450/500/550/600/650/700 + Mono 400/500/600/700).
- [ ] La `LoginPage` es **visualmente fiel** al artboard `MerchantLogin`
      de `kaiPos-ds/auth-components.jsx`: layout 2 columnas, panel
      editorial teal 700 con grid sutil + logo horizontal + chip Merchant + headline + stats en mono; panel derecho con link "Crea una cuenta",
      eyebrow + h2, SSO placeholders, divider, campos email/password con
      show/hide, checkbox remember, botón primario 48px, helper card de
      staff PIN, footer con versión en mono.
- [ ] Ningún archivo bajo `apps/frontend-admin/src/` importa directo de
      `@mui/material` — todo pasa por `@kaipos/ui`.
- [ ] Un admin hace login y ve el dashboard con su nombre, negocio y
      sucursal.
- [ ] Un cajero NO ve la opción de gestión de usuarios en la navegación
      ni accediendo por URL directa (`/users` redirige a `/dashboard`).
- [ ] Al cerrar sesión, vuelve a `/login`, el storage queda limpio y el
      WS se desconecta.
- [ ] Si el access token expira a mitad de una request, se renueva
      automáticamente con el refresh y la request original se reintenta
      **una sola vez** de forma transparente.
- [ ] El chip de WebSocket muestra `open` (success) conectado y
      `reconnecting` (warning) durante reconexión.
- [ ] Funcional en pantalla de 1024px (tablet) con el sidebar colapsable
      (drawer bajo `md`).
- [ ] Backend expone `GET /api/auth/me` con test de integración
      (200 + 401 × 2 casos).
- [ ] `ROLE_PERMISSIONS`, `Permission`, `hasPermission`,
      `SUPER_ADMIN_BUSINESS_ID` viven en `@kaipos/shared` y son
      consumidos por backend y frontend.
- [ ] Tests pasan: login (happy + errores 401/429/red), guard de rol,
      refresh automático (éxito + fallo), `/me` integración.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`
      pasan en todo el workspace.

## Out of Scope

- **`StaffPinLogin`** (PIN pad de la terminal POS, artboard 01 de
  `kaiPos-ds/auth.html`) — se implementará cuando la terminal POS tenga
  su propia app.
- **`MerchantRegister`** (wizard de 4 pasos Cuenta · Negocio · Plan ·
  Confirmar, artboard 03) — ticket propio.
- **Business picker para super_admin** — super_admin loguea pero ve
  placeholder "Admin global"; el picker es otro ticket.
- **SSO real (Google/Apple)** — los botones quedan como placeholder
  deshabilitado "Próximamente".
- **CRUD de usuarios** en `/users` — sólo listado en esta iteración.
- **Pantallas de forgot / reset password** — los endpoints existen en
  backend pero la UI es otro ticket.
- **Optimización móvil (< 600px)** — esta iteración cubre desktop + tablet.
- **Promoción de componentes a `@kaipos/ui`** — `EmptyState`,
  `PageHeader`, `Sidebar`, `Header`, `UserMenu`, `WsStatusChip` nacen
  locales en `apps/frontend-admin/src/components/` hasta que exista un
  segundo consumer (POS / kitchen).
- **Librería de forms** (`react-hook-form`, `zod`) y **cliente de queries**
  (`@tanstack/react-query`) — no se introducen en este ticket.
- **Componentes de POS / KDS / Floor Plan** (`kaiPos-ds/pos-components.jsx`,
  `kds-components.jsx`, `floor-components.jsx`) — referencia del DS global
  pero fuera de esta tarea.

## Open Questions

- **Iconografía**: `kaiPos-ds/` no fija una librería de iconos.
  Decidir en `/kaipos.plan` entre Material Icons (ya dep de MUI) o
  `lucide-react` (más liviana, estética cercana al mockup) y documentar
  la elección en `@kaipos/ui`.
- **Nombre legible del business**: `user.businessId` es el slug; para el
  header se necesita el `name` del business. Confirmar en `/kaipos.plan`
  si `/api/auth/me` debe devolver también `{ business: { id, name } }` o
  si la shell hace un fetch aparte a `/api/businesses/:id` (decisión de
  API shape).
- **Versión en el footer del login**: ¿hardcodeada o leída desde
  `package.json` (via `import.meta.env` + plugin de Vite)? Decidir en plan.

# Plan: Paso 9 — App Shell de Administración (Frontend React)

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Notion Ticket  | [NT-33618b91](https://notion.so/33618b913fdd818d90a4e19e23fd0418) |
| Spec           | `.specs/NT-33618b91_paso-9-app-shell-admin/spec.md`               |
| Feature Branch | `NT-33618b91/paso-9-app-shell-admin/feature`                      |
| Target         | `main`                                                            |

<!-- Multi-phase sequential plan. Phases are stacked — each targets the previous phase's branch.
     Phase 1 targets the feature branch; subsequent phases target the previous phase.
     Use `/kaipos.implement` to implement one phase at a time. -->

## Phase 1: Shared RBAC + backend `/api/auth/me`

**Branch**: `NT-33618b91/paso-9-app-shell-admin/shared-rbac-backend-me`
**Targets**: `NT-33618b91/paso-9-app-shell-admin/feature`

Objetivo: dejar lista la base que consumirá el frontend (permisos compartidos
y endpoint `/me`) sin tocar UI. PR chico y fácil de revisar.

### Tasks

- [ ] Crear `packages/shared/src/permissions.ts` con `Permission`,
      `ROLE_PERMISSIONS`, `SUPER_ADMIN_BUSINESS_ID`, y `hasPermission` movidos
      literalmente desde `apps/backend/src/lib/permissions.ts`.
- [ ] Exponerlo desde `packages/shared/src/index.ts` (export directo y
      opcional sub-path `@kaipos/shared/permissions`).
- [ ] En `apps/backend/src/lib/permissions.ts`: re-exportar desde
      `@kaipos/shared` para no romper imports existentes, o migrar los
      imports del backend a `@kaipos/shared` y borrar el archivo. Elegir la
      opción con menor churn (probablemente re-export tipo shim).
- [ ] Confirmar con `pnpm --filter @kaipos/backend typecheck` que nada se
      rompe (especialmente `src/middleware/authorize.ts`,
      `src/services/users.ts`, tests).
- [ ] Agregar `GET /api/auth/me` en `apps/backend/src/routes/auth.ts`:
      protegido con `requireAuth()`, devuelve `c.get('user')` (ya es
      `SafeUser` sin `passwordHash`, inyectado por el middleware).
- [ ] Test de integración en `apps/backend/src/routes/auth.test.ts` (o
      archivo nuevo `auth.me.test.ts` si conviene): caso 200 con token
      válido, caso 401 sin token, caso 401 con token expirado.
- [ ] Actualizar `CLAUDE.md` en la sección "RBAC" para reflejar que el mapa
      vive en `@kaipos/shared` (una línea).

### Verification

- [ ] `pnpm typecheck` pasa en todo el workspace
- [ ] `pnpm lint` pasa
- [ ] `pnpm format:check` pasa
- [ ] `pnpm --filter @kaipos/backend test` pasa (incluye el nuevo test de `/me`)
- [ ] `pnpm build` pasa
- [ ] Manual verification: `pnpm dev` local; `curl -H "Authorization: Bearer <token>" http://localhost:4000/api/auth/me` devuelve el user sin `passwordHash`; sin token devuelve 401.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 2: Auth plumbing + LoginPage

**Branch**: `NT-33618b91/paso-9-app-shell-admin/auth-plumbing-login`
**Targets**: `NT-33618b91/paso-9-app-shell-admin/shared-rbac-backend-me`

Objetivo: toda la infraestructura de sesión en el frontend + página de login
funcional. Aún sin layout ni páginas internas.

### Tasks

- [ ] Instalar `react-router-dom@^7` en `apps/frontend-admin`.
- [ ] Extender `apps/frontend-admin/src/lib/auth-storage.ts` para manejar
      `accessToken` + `refreshToken`. Mantener la API `getToken`/`setToken`/
      `clearToken` y añadir `getRefreshToken`/`setRefreshToken`/
      `clearRefreshToken` (o una API unificada `getSession`/`setSession`/
      `clearSession` — preferir la unificada).
- [ ] Crear `apps/frontend-admin/src/lib/api.ts`: wrapper tipado de `fetch`
      que (1) inyecta `Authorization: Bearer <accessToken>` cuando hay
      sesión, (2) al recibir `401 TOKEN_EXPIRED` intenta `POST
    /api/auth/refresh`, guarda el nuevo par y reintenta **una sola vez**,
      (3) si el refresh falla llama `clearSession()` y redirige a `/login`.
      Single-flight para el refresh (evitar refreshes en paralelo).
- [ ] Crear `apps/frontend-admin/src/context/AuthContext.tsx` con
      `AuthProvider` y hook `useAuth()`. Estado: `status`
      (`idle | loading | authenticated | unauthenticated`), `user`, y
      acciones `login(email, password)`, `logout()`, `refresh()`. Al montar:
      si hay tokens, llamar `GET /api/auth/me` para hidratar el user.
- [ ] Crear `apps/frontend-admin/src/pages/LoginPage.tsx` con formulario
      controlado (email, password), estados `idle/submitting/error`,
      mensajes para 400/401/429, y `aria-live` en el contenedor de error.
      Focus inicial en email. Usa `@kaipos/ui`.
- [ ] Crear `apps/frontend-admin/src/components/RequireAuth.tsx` y
      `src/components/RequirePermission.tsx`. Importan `hasPermission` desde
      `@kaipos/shared`. `RequireAuth` preserva `from` en el state de la
      redirección para volver post-login.
- [ ] Refactorizar `apps/frontend-admin/src/App.tsx`:
  - Envolver la app con `BrowserRouter` + `AuthProvider`.
  - Rutas: `/login` (pública), `/` (redirect a `/dashboard`),
    `/dashboard` (placeholder mínimo en esta fase: `<div>OK</div>`
    protegido con `RequireAuth` para poder validar), `/debug/ws`
    protegido, `*` 404.
  - Eliminar el hash routing manual y el `<DebugWebSocket />` como ruta
    por-hash; migrarla a path `/debug/ws`.
  - Mantener `main.tsx` igual (solo envuelve `<App />`).
- [ ] Actualizar `apps/frontend-admin/src/pages/DebugWebSocket.tsx` si
      depende del hash routing (probablemente solo los links en `App.tsx` —
      revisar).
- [ ] Tests en `apps/frontend-admin/src/__tests__/` (o colocados con el
      archivo):
  - `LoginPage.test.tsx`: happy path (mock de `api.ts` → `login` exitoso
    → redirige a `/dashboard`), error 401 muestra mensaje inline.
  - `RequirePermission.test.tsx`: admin (con `users:read`) ve el children;
    cajero redirige a `/dashboard`.
  - `api.test.ts`: 401 → refresh OK → reintento exitoso; 401 → refresh
    falla → clearSession + redirect.
- [ ] Ajustar `App.test.tsx` al nuevo shell (probablemente simplificarlo a
      un smoke test).

### Verification

- [ ] `pnpm typecheck` pasa
- [ ] `pnpm lint` pasa
- [ ] `pnpm format:check` pasa
- [ ] `pnpm --filter @kaipos/frontend-admin test` pasa (incluye tests nuevos)
- [ ] `pnpm --filter @kaipos/frontend-admin build` pasa
- [ ] Manual verification con backend local (`pnpm dev`):
  - `/` redirige a `/login` si no hay sesión.
  - Login con `admin@lacocinadekai.com` / `admin123` funciona y redirige
    a `/dashboard` (placeholder).
  - Login con credenciales inválidas muestra error inline.
  - Recargar en `/dashboard` mantiene la sesión (llama `/me`).
  - Navegar directo a `/users` (aún 404 en esta fase) — se verifica en
    Phase 3; aquí basta con que `RequirePermission` no rompa la app.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 3: AppLayout + páginas + WebSocket

**Branch**: `NT-33618b91/paso-9-app-shell-admin/layout-pages-ws`
**Targets**: `NT-33618b91/paso-9-app-shell-admin/auth-plumbing-login`

Objetivo: shell visual completo — layout, sidebar, header, dashboard, users
list y conexión WS. Al final de esta fase, todos los criterios del spec
están cumplidos.

### Tasks

- [ ] Crear componentes locales en `apps/frontend-admin/src/components/`:
  - `AppLayout.tsx`: layout con `<Outlet />`, compone `Header` + `Sidebar`
    - main content (`Container` con padding responsive).
  - `Sidebar.tsx`: navegación condicional por permisos; drawer permanente
    en `md+` y temporal debajo de `md` con botón hamburguesa en el header.
    Items: Dashboard, Usuarios (`users:read`), Debug WS.
  - `Header.tsx`: `KaiPOSLogo`, nombre del usuario, nombre del business
    (o "Admin global" si `businessId === '*'`), `ColorSchemeToggle`,
    `Chip` de WS (coloreado por status), `UserMenu` (avatar + menú con
    logout).
  - `UserMenu.tsx`: botón avatar que abre `Menu` con item "Cerrar sesión".
  - `WsStatusChip.tsx`: toma `status` del `useWebSocket` y renderiza
    color + etiqueta.
  - `PageHeader.tsx`: título + subtítulo + slot para actions (reusable
    entre páginas).
  - `EmptyState.tsx`: icono + mensaje + CTA opcional (reusable).
- [ ] Crear hook `apps/frontend-admin/src/hooks/useAppWebSocket.ts` (o
      integrarlo en `AuthProvider`): toma el accessToken del contexto, llama
      `useWebSocket({ endpoint: import.meta.env.VITE_WS_ENDPOINT })`, y
      gestiona connect en login / disconnect en logout. Expone `{ status }`
      al resto de la app (vía contexto propio `WsContext` o reusando el
      estado en `AuthContext` — preferir `WsContext` separado).
- [ ] Implementar `DashboardPage.tsx`:
  - `PageHeader` "Dashboard".
  - Grid de tarjetas (`Card` + `CardContent`) con: nombre, rol, businessId,
    branchIds, status del WS.
  - Sin fetches extra de negocio.
- [ ] Implementar `UsersListPage.tsx`:
  - `PageHeader` "Usuarios".
  - Fetch `GET /api/users` vía `api.ts` al montar.
  - Estados: loading (`Skeleton` de 5 filas), error (`Alert`), empty
    (`EmptyState`), data (`TableContainer` + `Table`).
  - Columnas: nombre, email, rol, sucursales (chips), estado
    (`Chip` active/inactive).
  - Sin paginación (por ahora la API tampoco la expone).
- [ ] Actualizar routing en `App.tsx`:
  - Agregar ruta `/` con `<AppLayout />` dentro de `RequireAuth` y
    sub-rutas `dashboard`, `users` (con `RequirePermission('users:read')`),
    `debug/ws`.
  - 404 sigue como `*`.
- [ ] Verificar que **cero** archivos dentro de
      `apps/frontend-admin/src/**` importan directamente desde
      `@mui/material` (todos vía `@kaipos/ui`). Correr un grep como gate.
- [ ] Tests adicionales:
  - `UsersListPage.test.tsx`: loading → data (mock fetch), empty, error.
  - `Sidebar.test.tsx`: admin ve link "Usuarios"; cajero no.
  - `WsStatusChip.test.tsx`: cada status mapea a su color.
- [ ] Actualizar `apps/frontend-admin/src/App.test.tsx` para cubrir el
      smoke del nuevo shell (redirige a login, renderiza con sesión).
- [ ] Actualizar `CLAUDE.md` con una sección mínima "Frontend shell" que
      apunte a `AppLayout`, `AuthContext`, `api.ts` y el uso de
      `@kaipos/ui`.

### Verification

- [ ] `pnpm typecheck` pasa
- [ ] `pnpm lint` pasa
- [ ] `pnpm format:check` pasa
- [ ] `pnpm test` pasa (incluye todos los tests nuevos)
- [ ] `pnpm build` pasa
- [ ] `rg "@mui/material" apps/frontend-admin/src` no retorna nada (solo
      `@kaipos/ui` está permitido).
- [ ] Manual verification con backend local (`pnpm dev`):
  - Login admin → dashboard con nombre, negocio, sucursal.
  - Login cajero (`cajero@lacocinadekai.com` / `cajero123`) → dashboard
    muestra datos; sidebar NO muestra "Usuarios"; navegar a `/users`
    directo redirige a `/dashboard`.
  - Chip WS muestra `open` (verde) cuando conectado.
  - Logout limpia storage, cierra WS (chip pasa a `closed`), redirige a
    `/login`.
  - Responsive: ancho 1024px → sidebar visible; ancho < 960px → sidebar
    se colapsa a drawer con hamburguesa.
  - Refresh automático: expirar manualmente el access token en DevTools
    (localStorage) — la siguiente request al API renueva y sigue.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

- [ ] Login + logout completos en admin, manager, cajero, waiter, kitchen.
- [ ] Admin ve link "Usuarios" y accede; los demás roles no lo ven en
      sidebar y la URL directa redirige a dashboard.
- [ ] `UsersListPage` muestra loading (red throttle), error (API down), y
      data correctamente.
- [ ] Chip WS transiciona `connecting → open` al login y `open → closed`
      al logout. Reconexión (detener/restaurar backend) muestra
      `reconnecting`.
- [ ] Refresh automático: forzar 401 del access token (borrar cookies /
      manipular localStorage) y verificar que una request normal se
      renueva transparentemente una vez, y que un segundo fallo del
      refresh desloguea.
- [ ] Super_admin hace login y ve header con placeholder "Admin global".
- [ ] Responsive manual: 1920px, 1280px, 1024px, 768px. Sidebar colapsa
      correctamente, contenido no se rompe.
- [ ] Accesibilidad: navegación por teclado en login (Tab entre inputs,
      Enter envía), focus visible, `aria-live` en errores.
- [ ] `pnpm build` del frontend genera bundle sin warnings nuevos.
- [ ] Deploy a prod (opcional en QA, típicamente en follow-up después del
      merge): `pnpm deploy:prod:frontend` con `VITE_WS_ENDPOINT` inyectado
      correctamente.

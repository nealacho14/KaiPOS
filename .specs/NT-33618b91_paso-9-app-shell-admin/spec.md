# Spec: Paso 9 — App Shell de Administración (Frontend React)

| Field         | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd818d90a4e19e23fd0418) |
| Status        | In Progress                                                       |
| Priority      | Alta                                                              |
| Branch        | `NT-33618b91/paso-9-app-shell-admin/feature`                      |
| Created       | 2026-04-17                                                        |

## Context

La app `apps/frontend-admin` existe como una SPA de debug con una sola página
(`DebugWebSocket`) y un `App.tsx` de health-check. Este paso la convierte en la
**app shell de administración**: un contenedor con autenticación, layout, y
navegación por roles sobre el cual se montarán en el futuro las features de
negocio (productos, órdenes, reportes, etc.).

Toda la infraestructura que consume esta shell ya está disponible en el repo:

- **Design system `@kaipos/ui`** (commit `58b07b0`) con `KaiPOSThemeProvider`,
  tokens, `KaiPOSLogo`, `ColorSchemeToggle` y re-exports de MUI v7. Es la
  fuente canónica de UI; los componentes nuevos deben importar de aquí.
- **API de auth**: `POST /api/auth/login`, `/refresh`, `/logout` en
  `apps/backend/src/routes/auth.ts`. `login` devuelve
  `{ accessToken, refreshToken, user }`.
- **API de users** con RBAC en `apps/backend/src/routes/users.ts`
  (`users:read` lo tienen `admin`, `manager`, `super_admin`).
- **Mapa RBAC** en `apps/backend/src/lib/permissions.ts` (`ROLE_PERMISSIONS`,
  `hasPermission`) — hoy sólo backend; se moverá a `@kaipos/shared` para
  consumo compartido.
- **Cliente WebSocket** en `apps/frontend-admin/src/lib/ws-client.ts` +
  `src/hooks/useWebSocket.ts`, con reconexión exponencial y re-subscripción.
  Endpoint inyectado al bundle vía `VITE_WS_ENDPOINT` (ver
  `scripts/deploy-prod.sh`).
- **Storage de token** en `apps/frontend-admin/src/lib/auth-storage.ts`
  (actualmente sólo `accessToken`).

La referencia visual (prototipo v0) queda como inspiración, pero el canon es
`@kaipos/ui`. El stack permanece en Vite 6 + React 19 + TypeScript estricto
según convención del monorepo.

## Requirements

### Autenticación y sesión

- Página `/login` con formulario email/password y estados de error (credenciales
  inválidas, account locked 429, validación 400, caído de red).
- Al login exitoso: persistir `accessToken` y `refreshToken` en `localStorage`
  (extender `auth-storage.ts`) y redirigir a `/dashboard`.
- Logout llama a `POST /api/auth/logout`, limpia storage, cierra la conexión
  WS y redirige a `/login`.
- **Refresh automático**: un cliente HTTP compartido (wrapper de `fetch`) que,
  al recibir `401` con código `TOKEN_EXPIRED`, intenta `POST /api/auth/refresh`
  con el refreshToken, guarda el nuevo par y reintenta la request **una sola
  vez**. Si el refresh también falla, desloguea.
- **Rehidratación al recargar**: si hay tokens en storage, consultar
  **`GET /api/auth/me`** (endpoint nuevo en el backend, devuelve el SafeUser
  derivado del JWT) para recuperar el perfil. Si falla con 401, deslogear.
- **Super_admin** queda habilitado para login y ve la shell con un placeholder
  en el header (ej. "Admin global" en vez de nombre de business). El business
  picker queda explícitamente **fuera de scope** (ver Out of Scope).

### Backend

- Agregar `GET /api/auth/me` protegido con `requireAuth()`. Devuelve el `user`
  (sin `passwordHash`) desde el JWT / DB. Incluye test de integración
  (éxito + 401 sin token).

### Routing y guards

- Instalar `react-router-dom` (v7). Rutas:
  - `/login` (pública)
  - `/` → redirect a `/dashboard`
  - `/dashboard` (`RequireAuth`)
  - `/users` (`RequireAuth` + `RequirePermission('users:read')`)
  - `*` → página 404
- **Guards**:
  - `RequireAuth`: si no hay user en el contexto, redirige a `/login`
    preservando `from` para volver tras autenticar.
  - `RequirePermission(permission)`: redirige a `/dashboard` si el rol no
    tiene el permiso requerido.
- La ruta `#/debug/ws` existente sigue funcionando: migrarla a `/debug/ws`
  bajo el nuevo router, accesible solo con auth.

### RBAC compartido

- Mover `ROLE_PERMISSIONS`, `Permission`, `hasPermission` y
  `SUPER_ADMIN_BUSINESS_ID` de `apps/backend/src/lib/permissions.ts` a
  `packages/shared/src/` y re-exportarlos. Backend importa desde
  `@kaipos/shared`; frontend también.

### Layout

- `AppLayout` como layout anidado de react-router (`<Outlet />`):
  - **Header**: `KaiPOSLogo` (variant `horizontal` en desktop, `icon` en
    tablet), nombre del usuario, nombre del business (o placeholder para
    super_admin), `ColorSchemeToggle`, `Chip` con estado WS
    (`idle | connecting | open | closed | reconnecting`, coloreado), menú
    de usuario con "Cerrar sesión".
  - **Sidebar**: navegación con items condicionados por permisos del rol:
    - Dashboard (siempre visible si auth)
    - Usuarios (`users:read`)
    - Debug · WebSocket (siempre visible si auth, por ahora)
      Colapsable bajo el breakpoint `md` (< 960px): en tablet se convierte en
      drawer temporal; en desktop queda fijo.
  - **Main content**: contenedor responsive con padding consistente.
- Componentes nuevos (`AppLayout`, `Sidebar`, `Header`, `EmptyState`,
  `PageHeader`, `UserMenu`, etc.) viven en
  `apps/frontend-admin/src/components/` — se promoverán a `@kaipos/ui`
  cuando haya un segundo consumer.

### Páginas

- **LoginPage**: `Card` centrada, formulario controlado (no agregar
  librería de forms aún — state local basta). Muestra errores inline.
- **DashboardPage** (placeholder): `PageHeader` + tarjetas con
  `user.name`, `user.role`, `businessId`, `branchIds`, y estado del WS.
  Sin métricas de negocio.
- **UsersListPage**: `PageHeader` + tabla con usuarios del negocio actual
  (columnas: nombre, email, rol, sucursales, estado). Manejo de
  loading (`Skeleton`), error (`Alert`) y empty (`EmptyState`). Sin acciones
  de CRUD en esta iteración.

### Conexión WebSocket

- Reusar `useWebSocket({ endpoint: import.meta.env.VITE_WS_ENDPOINT })` sin
  reimplementar el cliente.
- Conectar automáticamente tras login (usando el access token) y desconectar
  al logout.
- El estado (`status`) alimenta el chip del header.
- Canales por default (server-side `user:<id>`, `business:<id>`,
  `branch:<id>`) bastan — no hay `subscribe`s manuales en esta iteración.

### Estados y accesibilidad

- Loading / error / empty consistentes en cualquier fetch.
- Formularios con `aria-*` correctos y focus management sensato (focus
  inicial en email al cargar login; focus en mensaje de error tras fallo).

### Responsive

- Funcional en desktop y tablet (ancho mínimo 1024px). Sidebar colapsa bajo
  `md`. No se optimiza para móvil (< 600px) en esta iteración.

### Tests

- Frontend: test unit de login (happy path + error), de guard
  (`RequirePermission` deja pasar a admin y redirige a cajero), y de refresh
  automático (fetch mockeado: 401 → refresh → reintento exitoso).
- Backend: test de integración de `GET /api/auth/me` (éxito + 401).

## Acceptance Criteria

- [ ] Un admin hace login y ve el dashboard con su nombre, negocio y sucursal
- [ ] Un cajero NO ve la opción de gestión de usuarios en la navegación ni
      accediendo por URL directa (`/users` redirige a `/dashboard`)
- [ ] Al cerrar sesión, vuelve al login, el storage queda limpio y el WS se
      desconecta
- [ ] Si el access token expira a mitad de una request, se renueva
      automáticamente con el refresh y la request original se reintenta una
      vez de forma transparente al usuario
- [ ] El chip de WebSocket muestra `open` (verde) cuando conectado y
      `reconnecting` (amarillo) durante reconexión
- [ ] Funcional en pantalla de 1024px (tablet) con el sidebar colapsable
- [ ] Todos los componentes UI se importan desde `@kaipos/ui` (no hay imports
      directos a `@mui/material` en `apps/frontend-admin/src`)
- [ ] Backend expone `GET /api/auth/me` con test de integración (éxito + 401)
- [ ] `ROLE_PERMISSIONS` y `hasPermission` viven en `@kaipos/shared`,
      consumidos por backend y frontend
- [ ] Tests pasan: login (happy + error), guard de rol, refresh automático,
      `/me`
- [ ] `pnpm lint` y `pnpm typecheck` pasan

## Out of Scope

- **Business picker para super_admin**: super_admin puede loguearse pero sin
  seleccionar business activo; el header muestra un placeholder. El picker
  se diseñará en un ticket propio.
- **CRUD de usuarios** (crear/editar/borrar) en `UsersListPage`: solo
  listado por ahora. Las acciones van en otro ticket.
- **Optimización móvil (< 600px)**: esta iteración cubre desktop + tablet.
- **Forgot / reset password UI**: los endpoints existen en backend pero las
  pantallas quedan para un ticket posterior.
- **Promoción de componentes a `@kaipos/ui`**: `EmptyState`, `PageHeader`,
  `Sidebar`, etc. se quedan locales en `apps/frontend-admin/src/components/`
  hasta que exista un segundo consumer (POS o kitchen).
- **Librería de forms** (`react-hook-form`, `zod`): no se introduce en este
  ticket. Formularios simples con state local.
- **Gestión global de estado** más allá de `AuthContext` + hooks locales
  (no `zustand`, `redux`, `tanstack-query` por ahora).

## Open Questions

- Ninguna abierta al momento de crear el spec. Revisar durante `/kaipos.plan`
  si aparece alguna decisión técnica adicional (p.ej., dónde vive el cliente
  HTTP compartido si se usa en futuras features).

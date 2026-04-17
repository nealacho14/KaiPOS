# Plan: Paso 9 — App Shell de Administración (Frontend React)

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Notion Ticket  | [NT-33618b91](https://notion.so/33618b913fdd818d90a4e19e23fd0418) |
| Spec           | `.specs/NT-33618b91_paso-9-app-shell-admin/spec.md`               |
| Feature Branch | `NT-33618b91/paso-9-app-shell-admin/feature`                      |
| Target         | `main`                                                            |

<!-- Multi-phase sequential plan. Each phase is its own PR stacked on the previous one.
     Use `/kaipos.implement` to implement one phase at a time. -->

## Key decisions (from interview)

- **`GET /api/auth/me` shape**: returns `{ user: SafeUser, business: { _id, name, slug } | null }`. For `super_admin` the token carries `businessId: '*'` so `business` is `null` and the UI renders the "Admin global" placeholder. Single fetch — no follow-up call to a businesses endpoint.
- **Icon library**: `lucide-react` (added as a dep of `@kaipos/ui`, re-exported so the shell imports icons from `@kaipos/ui` just like every other component).
- **App version in login footer**: read `apps/frontend-admin/package.json#version` at build time via Vite `define` → `import.meta.env.VITE_APP_VERSION`, formatted as `v <version>` in JetBrains Mono.
- **Expired-token signal for refresh**: the backend today throws a generic `UNAUTHORIZED` for both invalid and expired tokens. Phase 1 narrows this — `middleware/auth.ts` distinguishes `jose.errors.JWTExpired` and throws a `TOKEN_EXPIRED` (still HTTP 401, new `AppError` code). The frontend `api.ts` wrapper only triggers the refresh dance on `TOKEN_EXPIRED`, so a truly invalid token cannot accidentally nuke a valid refresh token.

## Phase 0: retokenizar `@kaipos/ui` al canon de `kaiPos-ds/theme.ts`

**Branch**: `NT-33618b91/paso-9-app-shell-admin/retokenize-ui-ds`
**Targets**: `NT-33618b91/paso-9-app-shell-admin/feature`

### Tasks

- [ ] Add `lucide-react` as a dep of `@kaipos/ui` (peerDep of `react` is already in place). Update `packages/ui/package.json`.
- [ ] Replace `packages/ui/src/tokens/colors.ts` with the primitives from `kaiPos-ds/theme.ts`:
  - Export `brand.teal` (50–900, base `#0B7A75`), `brand.amber` (50–900, base `#E8833A`), `brand.slate` warm (0, 50, 100, 200, 300, 400, 500, 600, 700, 750, 800, 900, 950), and semantics `red / orange / green / blue` (50, 400, 500, 600, 700 where defined).
  - Keep the existing named export `colors` **but** derive it from the new primitives (`primary = teal`, `secondary = amber`, `grey = slate`) so existing consumers (`KaiPOSLogo`) keep compiling until they migrate.
- [ ] Replace `packages/ui/src/tokens/typography.ts` with the Inter + JetBrains Mono stack from `kaiPos-ds/theme.ts`:
  - Export `fontFamily.sans` (Inter + fallbacks) and `fontFamily.mono` (JetBrains Mono + fallbacks).
  - Export the heading / body / button / overline / caption / `mono` / `money` / `moneyLg` / `moneyXl` / `orderId` variants matching the spec (px-based).
- [ ] Replace `packages/ui/src/tokens/radius.ts` with `{ xs: 4, sm: 6, md: 10, lg: 14, xl: 20, pill: 999 }` (the existing file uses a different shape — check and rename exports so consumers keep working; MUI's `shape.borderRadius` keeps pointing at `radius.md`).
- [ ] Replace `packages/ui/src/tokens/shadows.ts` with the two-layer named scale from `kaiPos-ds/theme.ts` (`xs`, `sm`, `md`, `lg`, `xl`, `inset`, `focus`). Remove the `2xl` slot — the 25-entry MUI array is rebuilt inside the theme file.
- [ ] Add a new token file `packages/ui/src/tokens/touch.ts` exporting `{ min: 48, pos: 56, kds: 64, desktop: 36, dense: 32 }` and surface it from `packages/ui/src/tokens/index.ts` as `touch`.
- [ ] Keep `packages/ui/src/tokens/spacing.ts` and `zIndex.ts` as-is if already consistent (spacing unit 4, zIndex rationally ordered) — otherwise align to `kaiPos-ds/theme.ts`.
- [ ] Rewrite `packages/ui/src/theme/index.ts`:
  - Port `buildPalette(mode)` with `primary = teal`, `secondary = amber`, semantics tuned to AA (from `kaiPos-ds/theme.ts`), `action` slots bound to teal, plus custom slots `surfaces` (`canvas | default | raised | sunken | overlay | inverse`), `textExt` (`primary | secondary | tertiary | disabled | inverse`), `kds`, and `neutral`.
  - Port `buildComponents(mode)` covering **all** overrides from `kaiPos-ds/theme.ts`: `MuiCssBaseline`, `MuiButton` (incl. `size="pos"|"kds"` and `variant="tile"|"danger"`), `MuiIconButton`, `MuiCard` (incl. `variant="raised"|"ticket"`), `MuiCardHeader`, `MuiCardContent`, `MuiPaper`, `MuiTextField`, `MuiOutlinedInput`, `MuiInputLabel`, `MuiFormHelperText`, `MuiTable*`, `MuiDialog*`, `MuiBackdrop`, `MuiChip` (with tinted `colorPrimary / Success / Error / Warning / Info`), `MuiTabs`, `MuiTab`, `MuiDrawer`, `MuiList`, `MuiListItemButton`, `MuiListItemIcon`, `MuiListItemText`, `MuiSnackbar`, `MuiSnackbarContent`, `MuiAlert`, `MuiTooltip`, `MuiDivider`, `MuiSwitch`, `MuiCheckbox`, `MuiLinearProgress`.
  - Swap the MUI `cssVariables` + `colorSchemes` API we use today for `createTheme({ palette: buildPalette(mode), components: buildComponents(mode), ... })` **per mode**, wrapped in a helper `kaiPOSTheme(mode: PaletteMode = 'light')` (same signature as `kaiPos-ds`). The `KaiPOSThemeProvider` continues to drive mode switching — see next task.
  - Expose custom tokens on the theme: `posSize` (= `touch`), `radii` (= `radius`), `shadowTokens` (= `shadow`). Module augmentation must type these + `surfaces`, `textExt`, `kds`, `neutral`, typography variants (`mono`, `money`, `moneyLg`, `moneyXl`, `orderId`), and the Button/Card prop overrides.
- [ ] Update `packages/ui/src/providers/KaiPOSThemeProvider.tsx`:
  - Compute `theme` from `useColorScheme()` so `mode`/`systemMode` drives `kaiPOSTheme('light' | 'dark')` (since per-mode `createTheme` replaces the `colorSchemes` API).
  - Keep the existing `useColorScheme` hook's contract (`mode`, `systemMode`, `setMode`) so `ColorSchemeToggle` keeps working without changes.
  - Leave the existing `disableCssBaseline` / `theme` override props alone.
- [ ] Update `packages/ui/src/components/KaiPOSLogo.tsx` to use brand teal:
  - `BRAND.bg = colors.primary[500]` (`#0B7A75`) for the filled square and `BRAND.accent = colors.secondary[400]` (`#E8833A`) for the accent node.
  - Keep `horizontal | stacked | icon | wordmark` and `color | white | dark | auto`.
  - Wordmark: `kai` in slate primary (or white in white variant), `POS` in teal (or white).
- [ ] Add `lucide-react` re-export surface to `packages/ui/src/components/index.ts` — re-export the icons we actually need for Phase 3 navigation: `LayoutDashboard`, `Users`, `Radio` (debug WS), `Menu`, `LogOut`, `ChevronDown`, `Eye`, `EyeOff`, `AlertCircle`, `Inbox`. Document the import path so future features pull icons from `@kaipos/ui`, not `lucide-react` directly.
- [ ] Update `apps/frontend-admin/index.html`:
  - Add preconnect + Google Fonts CSS link for Inter (weights `400;450;500;550;600;650;700`) and JetBrains Mono (`400;500;600;700`) matching `kaiPos-ds/auth.html`.
  - Keep `<meta name="color-scheme">` and `lang="es"`.
- [ ] Update `apps/frontend-admin/src/main.tsx`:
  - Remove `@fontsource/inter/*` imports (fonts now come from Google Fonts via `index.html`).
  - Remove `@fontsource/inter` from `apps/frontend-admin/package.json` dependencies.
- [ ] Verify `packages/ui` test stub still runs (`vitest run --passWithNoTests`) — no new tests required in this phase; the next phase will exercise the theme indirectly via `LoginPage` tests.

### Verification

- [ ] `pnpm --filter @kaipos/ui typecheck` passes
- [ ] `pnpm --filter @kaipos/ui lint` passes
- [ ] `pnpm --filter @kaipos/frontend-admin typecheck` passes (consumer compiles against the new tokens + logo)
- [ ] `pnpm --filter @kaipos/frontend-admin build` succeeds
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check` pass at the root
- [ ] Manual verification: `pnpm --filter @kaipos/frontend-admin dev` and eyeball the existing `App.tsx` shell — primary color is teal, `KaiPOSLogo` square is teal with white `K`, body renders Inter, and `ColorSchemeToggle` still flips light/dark.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 1: RBAC compartido + `GET /api/auth/me` + `TOKEN_EXPIRED`

**Branch**: `NT-33618b91/paso-9-app-shell-admin/rbac-shared-auth-me`
**Targets**: `NT-33618b91/paso-9-app-shell-admin/retokenize-ui-ds`

### Tasks

- [ ] Create `packages/shared/src/permissions.ts`:
  - Move `Permission` type, `SUPER_ADMIN_BUSINESS_ID`, `ROLE_PERMISSIONS`, and `hasPermission` verbatim from `apps/backend/src/lib/permissions.ts`.
  - Keep the `import type { UserRole } from './types/index.js'` path (shared self-import, no circular risk since types are type-only).
- [ ] Re-export from `packages/shared/src/index.ts` and add a dedicated subpath export `./permissions` in `packages/shared/package.json` (`"./permissions": "./src/permissions.ts"`) so backend can import with `from '@kaipos/shared/permissions'` without pulling the whole barrel.
- [ ] Shim `apps/backend/src/lib/permissions.ts`: replace its body with `export { Permission, SUPER_ADMIN_BUSINESS_ID, ROLE_PERMISSIONS, hasPermission } from '@kaipos/shared/permissions';` to keep existing backend imports (`../lib/permissions.js`) working with zero churn. Delete the test file at the shim path and mirror it (copied / adapted) in `packages/shared/src/permissions.test.ts`.
- [ ] Add `permissions.test.ts` in `packages/shared/src/` with the same role × permission matrix and super_admin bypass coverage as the backend test.
- [ ] Narrow the auth error in `apps/backend/src/middleware/auth.ts`:
  - Import `jose.errors.JWTExpired` and `AppError`.
  - On `verifyAccessToken` failure, if the cause is `JWTExpired`, throw `new AppError('Access token expired', 401, 'TOKEN_EXPIRED')`. Any other failure keeps throwing `UnauthorizedError('Invalid token')`.
- [ ] Add `GET /api/auth/me` to `apps/backend/src/routes/auth.ts`:
  - Protected with `requireAuth()`.
  - Reads `c.get('user')` → the `TokenPayload`.
  - Looks up `SafeUser` (full record minus `passwordHash`) from the users collection by `userId`.
  - Looks up the business: if `user.businessId === SUPER_ADMIN_BUSINESS_ID` → `business: null`; else `businesses.findOne({ _id: user.businessId })` and return `{ _id, name, slug }` only. If the user row or business row is missing, return 404 with code `USER_NOT_FOUND` / `BUSINESS_NOT_FOUND`.
  - Response shape: `{ success: true, data: { user: SafeUser, business: { _id, name, slug } | null } }`.
  - Add `getBusinessesCollection()` to `apps/backend/src/db/collections.ts` if it is not already there (the codebase already seeds a business, check first and only add if missing).
- [ ] Add `MeResponse` (and any helper types) to `packages/shared/src/types/index.ts`:
  ```ts
  export interface MeResponse {
    user: Omit<User, 'passwordHash'>;
    business: { _id: string; name: string; slug: string } | null;
  }
  ```
- [ ] Add integration test `apps/backend/src/routes/auth.test.ts` (or extend existing) covering `GET /api/auth/me`:
  - 200 with a valid admin token → returns user + business.
  - 200 with a valid super_admin token → returns user + `business: null`.
  - 401 without any token → generic `UNAUTHORIZED`.
  - 401 with a token signed with a forged secret → `UNAUTHORIZED` (invalid).
  - 401 with an expired access token (sign manually with `setExpirationTime('0s')`) → `TOKEN_EXPIRED`.
- [ ] Update `apps/backend/src/lib/permissions.test.ts`: since the implementation moved, either delete this file and rely on the new shared test, or keep it as a thin shim-smoke-test that imports via `./permissions.js` to prove the re-export works. (Recommended: delete the backend test and keep only the shared one.)

### Verification

- [ ] `pnpm --filter @kaipos/shared test` passes (new `permissions.test.ts`)
- [ ] `pnpm --filter @kaipos/backend test` passes (new `/me` cases + existing suite green after the shim)
- [ ] `pnpm typecheck` passes (notable: `@kaipos/shared/permissions` export resolves everywhere it's imported)
- [ ] `pnpm lint`, `pnpm format:check` pass
- [ ] `pnpm build` succeeds (tsup bundles the backend Lambda with the shim)
- [ ] Manual verification: `pnpm docker:up`, `curl -H "Authorization: Bearer <admin-token>" http://localhost:4001/api/auth/me` returns `{ user: {...}, business: { _id: 'la-cocina-de-kai', name: 'La Cocina de Kai', slug: 'la-cocina-de-kai' } }`.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 2: Auth plumbing + `LoginPage` (canon `MerchantLogin`)

**Branch**: `NT-33618b91/paso-9-app-shell-admin/auth-plumbing-login`
**Targets**: `NT-33618b91/paso-9-app-shell-admin/rbac-shared-auth-me`

### Tasks

- [ ] Add `react-router-dom@^7` to `apps/frontend-admin/package.json` dependencies.
- [ ] Expose the app version to the client:
  - In `apps/frontend-admin/vite.config.ts`, read `JSON.parse(readFileSync('./package.json', 'utf8')).version` and add `define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) }`.
  - Add `VITE_APP_VERSION?: string` to `apps/frontend-admin/src/vite-env.d.ts`.
- [ ] Replace `apps/frontend-admin/src/lib/auth-storage.ts` with a session API:
  - Types: `SessionUser = SafeUser`, `StoredSession = { accessToken: string; refreshToken: string; user?: SafeUser }`.
  - Functions: `getSession(): StoredSession | null`, `setSession(next: StoredSession): void`, `clearSession(): void`, plus a tiny pub-sub (`onSessionChange(cb): () => void`) so the WS hook can react to logout without being wired through the AuthContext.
  - Keys: `kaipos:accessToken`, `kaipos:refreshToken`, `kaipos:user`.
  - Keep backward-compat reads: if only the legacy `kaipos:accessToken` is present, treat it as an orphan and clear it on the first `getSession` call.
- [ ] Create `apps/frontend-admin/src/lib/api.ts`:
  - Exported `api(input: RequestInfo, init?: RequestInit & { skipAuth?: boolean }): Promise<Response>`.
  - Injects `Authorization: Bearer <accessToken>` when a session exists and `skipAuth !== true`.
  - Parses the response body as JSON to look for `{ code: 'TOKEN_EXPIRED' }` on 401. If matched:
    - Kick off a **single-flight** refresh (a module-level `Promise<{ accessToken, refreshToken }> | null` resets after resolution).
    - On refresh success → `setSession({ ...prev, accessToken, refreshToken })` and retry the original request **exactly once** (track via a `__retried` symbol on the init object or a closure flag).
    - On refresh failure → `clearSession()` + redirect to `/login` (via `window.location.assign` to avoid coupling to the router; the `AuthContext` reconciles on next render anyway).
  - Non-TOKEN_EXPIRED 401 / other errors bubble up — let callers handle them.
  - Export typed helpers `apiJson<T>(input, init): Promise<T>` that parses `ApiResponse<T>` and throws `ApiError` on `success: false`.
  - Export `ApiError extends Error { status: number; code: string; details?: ApiErrorDetail[] }`.
- [ ] Create `apps/frontend-admin/src/context/AuthContext.tsx`:
  - `AuthProvider` holds `{ status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated'; user: SafeUser | null; business: { _id; name; slug } | null }`.
  - `login(email, password)` → `POST /api/auth/login`, store tokens + user, set `authenticated`, return void (throws `ApiError` on failure).
  - `logout()` → `POST /api/auth/logout` (fire-and-forget on error), then `clearSession()` + set `unauthenticated`.
  - On mount: if `getSession()` has tokens, set `status = 'loading'` and call `GET /api/auth/me`. On success → `authenticated` + cache user. On 401 → `clearSession()` + `unauthenticated`.
  - `useAuth()` hook returning the context.
- [ ] Create `apps/frontend-admin/src/pages/LoginPage.tsx` replicating `kaiPos-ds/auth-components.jsx · MerchantLogin` **to the letter**:
  - Grid `1fr 1fr` ≥ `md`, single-column stack `< md` (only the right panel visible).
  - Left panel (`background: theme.palette.primary.dark`, teal 700):
    - Absolute-positioned grid overlay (`linear-gradient` @ 32px, `rgba(255,255,255,.04)`).
    - Header row: `KaiPOSLogo` variant `horizontal` + uppercase `Merchant` chip (bg `rgba(255,255,255,.12)`, color `rgba(255,255,255,.85)`, tracking `.08em`, radius `xs`).
    - Editorial block pushed to bottom (`marginTop: 'auto'`): eyebrow `Panel de administración` (uppercase `.1em`, `rgba(255,255,255,.65)`), `h1` `"Un solo lugar"` (line break) `"para tu servicio."` (44 / 700 / -0.02em), `body1` bajada (`maxWidth: 420`, `rgba(255,255,255,.75)`).
    - Stats strip (3 equal columns, border-top `rgba(255,255,255,.15)`): `Stat` subcomponent with value in `Typography variant="money"` size 22 weight 700 and uppercase `.06em` label at `.6` opacity. Values: `12,400+` / `restaurantes`, `$2.4B` / `procesado / año`, `99.99%` / `uptime`.
  - Right panel (`background: theme.palette.background.default`, padding `48/56`):
    - Top-right link `¿Nuevo en kaiPOS? Crea una cuenta →` (teal 500, dead link `href="#"` — ticket aparte).
    - Center column (`maxWidth: 420`, `margin: 'auto 0'`):
      - Eyebrow `Bienvenido de vuelta` (uppercase `.08em`, slate 500).
      - `h2` `Inicia sesión en tu panel` (32 / 700 / -0.02em, `letterSpacing: -0.02em`).
      - SSO grid `1fr 1fr` (`Button variant="outlined"` with slate grey icon placeholder, **disabled**, wrapped in a `Tooltip` title `Próximamente`) — labels `Continuar con Google` / `Continuar con Apple`.
      - Divider row — horizontal 1px line + `o con email` label centered, uppercase `.08em`, slate 400.
      - `TextField` label `Email`, type `email`, autocomplete `email`, autofocus on mount.
      - Password field built manually so the `¿Olvidaste?` link sits in the label row: a flex row with `<label>Contraseña</label>` and a teal link (`href="#"`, dead — spec Out-of-Scope). `TextField` type toggles between `password` / `text` via an absolutely-positioned `IconButton` showing `Eye` / `EyeOff` from `@kaipos/ui` icons (aria-label `Mostrar contraseña` / `Ocultar contraseña`).
      - `Checkbox` + label `Mantener sesión en este dispositivo (30 días)` (`primary.main` accent). State-only for this ticket — no refresh-token TTL change yet.
      - `Button` contained primary, `fullWidth`, `sx={{ minHeight: 48, borderRadius: theme.radii.md }}` with label `Iniciar sesión`. Shows `CircularProgress size={18}` and `disabled` while submitting.
      - Helper card: `Box` `border-radius: md`, `1px solid divider`, `bg: background.paper`, flex row with a 32×32 teal-soft square badge containing `⌘` + two-line copy `¿Eres miembro del staff?` / `Ingresa directamente en la terminal con tu PIN de 4 dígitos.` — informational only, no link.
    - Footer: border-top `divider`, flex row with links `Términos`, `Privacidad`, `Estado del sistema` (dead `href="#"`) + `Typography variant="mono"` version `v {VITE_APP_VERSION}` aligned right.
  - **State machine**:
    - `status: 'idle' | 'submitting' | 'error'`.
    - On submit: `useAuth().login(email, password)` → on success, `navigate(location.state?.from ?? '/dashboard', { replace: true })`.
    - Map errors to human-readable copy by `ApiError.status` / `code`:
      - `401 UNAUTHORIZED` → `Email o contraseña incorrectos.`
      - `429 ACCOUNT_LOCKED` → `Cuenta temporalmente bloqueada. Intenta de nuevo en unos minutos.`
      - `400 VALIDATION_ERROR` → `Revisa los campos marcados.` (+ per-field inline errors from `details`)
      - Network / `TypeError` → `No pudimos conectar. Revisa tu conexión e inténtalo otra vez.`
      - Any other → `Algo salió mal. Inténtalo de nuevo.`
    - Render the mapped error as `<Alert severity="error" ref={alertRef}>` above the SSO row. On error, `alertRef.current?.focus()` (the element must have `tabIndex={-1}`) and `aria-live="polite"`.
  - **Accessibility**: labels linked by `htmlFor` / `id`; password toggle has `aria-label`; alert is focusable; initial focus on email.
- [ ] Tests (`apps/frontend-admin/src/pages/LoginPage.test.tsx`):
  - Happy path: type email + password → click submit → `api` mocked to resolve → `navigate` called with `/dashboard`.
  - 401 → alert renders mapped copy, receives focus.
  - 429 → alert renders lockout copy.
  - Network error (fetch throws) → alert renders generic copy.
  - Show/hide toggle flips input type.
- [ ] Tests (`apps/frontend-admin/src/lib/api.test.ts`):
  - Bearer is injected when a session exists.
  - On `401 TOKEN_EXPIRED`, refresh is called exactly once (two parallel calls share one refresh via single-flight) and the original request is retried.
  - When refresh fails, session is cleared and `window.location.assign('/login')` is called.
  - Non-TOKEN_EXPIRED 401 does **not** trigger a refresh.
- [ ] Update `apps/frontend-admin/src/main.tsx`: wrap the app in `<BrowserRouter>` and `<AuthProvider>`. Remove the existing `@fontsource` imports from this file (done in Phase 0, but double-check).

### Verification

- [ ] `pnpm --filter @kaipos/frontend-admin test` passes (new LoginPage + api tests)
- [ ] `pnpm --filter @kaipos/frontend-admin typecheck` passes
- [ ] `pnpm --filter @kaipos/frontend-admin build` succeeds
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check` pass
- [ ] Manual verification: against `pnpm docker:up`, navigate to `/login`, log in with `admin@lacocinadekai.com / admin123` → should land on a blank page (AppLayout still lives in Phase 3) **but** the `accessToken` + `refreshToken` + cached user are in `localStorage` and a reload reveals the user via `/api/auth/me`. Zero imports from `@mui/material` in `apps/frontend-admin/src`.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 3: `AppLayout` + guards + páginas + WebSocket

**Branch**: `NT-33618b91/paso-9-app-shell-admin/app-shell-and-routing`
**Targets**: `NT-33618b91/paso-9-app-shell-admin/auth-plumbing-login`

### Tasks

- [ ] Create the components module under `apps/frontend-admin/src/components/` with:
  - `Header.tsx` — 64px top bar, `background: background.paper`, `border-bottom: divider`:
    - Left: `KaiPOSLogo variant="horizontal"` at `md` / `variant="icon"` below `md`, divider, business name (`useAuth().business?.name ?? 'Admin global'`), `Chip` with role label (`colorPrimary` for admin, `colorSuccess` for manager, etc. — map in a tiny `roleToChipColor()` helper).
    - Right: `WsStatusChip` (see below), `ColorSchemeToggle`, `UserMenu` (avatar initials + dropdown `nombre · email · Cerrar sesión`).
  - `Sidebar.tsx` — 240px fixed `Drawer variant="permanent"` ≥ `md`, `Drawer variant="temporary"` (controlled via prop) `< md`:
    - Items: `{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, show: true }`, `{ label: 'Usuarios', to: '/users', icon: Users, show: hasPermission(user.role, 'users:read') }`, `{ label: 'Debug · WebSocket', to: '/debug/ws', icon: Radio, show: true }`.
    - Active item: `NavLink` `isActive` → `ListItemButton.selected = true` + a 3px teal left border via a pseudo-element or inline `borderLeft`. Hover respects `action.hover`.
  - `UserMenu.tsx` — `Avatar` with initials inside a `Box` whose `bgcolor` is role-keyed (teal 500 / amber 400 / slate 600), `ChevronDown` icon, clickable `Menu` with `MenuItem` nombre (disabled, subtitle email), `Divider`, `MenuItem` `LogOut` icon + `Cerrar sesión`.
  - `WsStatusChip.tsx` — `Chip` with a 8px circular dot on the left (inline `Box` styled) and text `Conectado | Conectando… | Reconectando… | Desconectado | Inactivo` keyed off status. Color map: `open → success`, `connecting / reconnecting → warning`, `closed / idle → default`.
  - `PageHeader.tsx` — title (`h4`), optional subtitle (`body2 text.secondary`), optional `actions` slot on the right. Responsible for top-of-page spacing.
  - `EmptyState.tsx` — icon + title + subtitle + optional CTA, centered.
  - Index barrel at `components/index.ts`.
- [ ] Create `apps/frontend-admin/src/components/guards/` with:
  - `RequireAuth.tsx`: `useAuth()` → `status === 'loading'` renders a centered `CircularProgress`; `unauthenticated` → `<Navigate to="/login" replace state={{ from: location }} />`; `authenticated` renders `<Outlet />`.
  - `RequirePermission.tsx` (props: `permission: Permission`): calls `useAuth()` and `hasPermission(user.role, permission)` → allow or `<Navigate to="/dashboard" replace />`.
- [ ] Create `apps/frontend-admin/src/layouts/AppLayout.tsx`:
  - Top-level grid: `Header` full-width, body = `Sidebar` + `<Outlet />` (with padding + responsive max-width).
  - Wire a `useWebSocket({ endpoint: import.meta.env.VITE_WS_ENDPOINT })` and call `connect(session.accessToken)` when `status === 'authenticated'`; call `disconnect()` on logout. The hook's `status` feeds `WsStatusChip`. If `VITE_WS_ENDPOINT` is not set (local without WS), render the chip as `Inactivo` and skip the connect.
  - Manage sidebar open/close state for the tablet drawer.
- [ ] Create `apps/frontend-admin/src/pages/DashboardPage.tsx`:
  - `PageHeader` title `Dashboard` + subtitle `Bienvenido, {user.name}`.
  - `Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }}` with `Card`s:
    - `Usuario` — name, email, role chip.
    - `Negocio` — business name (or `Admin global`), slug in `mono`, number of branches (`user.branchIds?.length ?? '—'`).
    - `Sucursales` — list of `branchIds` as small `Chip`s.
    - `Tiempo real` — current `WsStatusChip` + list of subscribed channels.
- [ ] Create `apps/frontend-admin/src/pages/UsersListPage.tsx`:
  - `PageHeader` title `Usuarios` + subtitle `Equipo de tu negocio`.
  - `useEffect` fetches `api('/api/users')` → sets `{ status, data, error }`.
  - Loading → `Table` with 6 `TableRow`s of `Skeleton` cells.
  - Error → `<Alert severity="error">{mapped message}</Alert>` + `Button variant="outlined"` `Reintentar`.
  - Empty (`data.length === 0`) → `<EmptyState icon={<Inbox />} title="Aún no hay miembros" subtitle="Invita a tu equipo cuando esté listo." />`.
  - Data → `Table` columns: `Nombre`, `Email`, `Rol` (`Chip color="primary"` by role), `Sucursales` (joined branch IDs or count), `Estado` (`Chip color={isActive ? 'success' : 'default'}`).
- [ ] Create `apps/frontend-admin/src/pages/NotFoundPage.tsx`:
  - `EmptyState` icon + title `No encontramos esa página.` + subtitle + `Button variant="contained"` `Volver al dashboard` linking to `/dashboard`.
- [ ] Migrate `apps/frontend-admin/src/pages/DebugWebSocket.tsx` to live under the new router:
  - Keep the file / component; remove any top-level container styling that overlaps with `AppLayout`. Rely on `AppLayout` for chrome.
  - It continues to use `useWebSocket` — confirm two simultaneous hook instances don't create duplicate sockets. If they do, lift the hook into a `WebSocketContext` owned by `AppLayout` and expose via `useWebSocketContext()` — refactor `DebugWebSocket.tsx` to consume the context instead of instantiating its own client.
- [ ] Rewrite `apps/frontend-admin/src/App.tsx` as the router root:
  - `<Routes>` with `/login` (public, renders `LoginPage`), a parent `/` route wrapped in `RequireAuth` + `AppLayout`, and children `/dashboard`, `/users` (additionally wrapped in `RequirePermission('users:read')`), `/debug/ws`. `path: '/'` redirects to `/dashboard`. `*` → `NotFoundPage`.
  - Delete the legacy `readHashRoute` / `/api/health` fetch — health is no longer part of the shell.
- [ ] Delete the obsolete `apps/frontend-admin/src/App.test.tsx` if its assertions are tied to the old health-check shell; replace with router-oriented smoke tests covering redirects.
- [ ] Tests (`apps/frontend-admin/src/components/guards/RequirePermission.test.tsx`):
  - Admin with `users:read` renders `<Outlet />`.
  - Cashier without `users:read` redirects to `/dashboard`.
- [ ] Tests (`apps/frontend-admin/src/layouts/AppLayout.test.tsx`):
  - Logged-in admin sees `Dashboard`, `Usuarios`, `Debug · WebSocket` nav items.
  - Logged-in cashier does **not** see `Usuarios`.
  - Logout click clears session and navigates to `/login`.
- [ ] Update documentation:
  - Add a short "Frontend Admin Shell" section to `apps/frontend-admin/README.md` (or create one) describing routes, guards, and the DS consumption rule (no direct `@mui/material` imports).
  - Update the root `CLAUDE.md` if a convention changes (we gain the "no direct MUI imports" rule and the shared `@kaipos/shared/permissions` subpath) — surface this in the `Key Conventions` block.

### Verification

- [ ] `pnpm --filter @kaipos/frontend-admin test` passes (guards, AppLayout, prior LoginPage/api suites remain green)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check` pass
- [ ] `pnpm build` succeeds
- [ ] Grep: `rg "from '@mui/material" apps/frontend-admin/src` returns zero matches
- [ ] Manual verification at 1024×768 (tablet): sidebar collapses behind a drawer trigger in the header; admin sees Usuarios; cashier does not; `/users` typed directly in the URL redirects cashier to `/dashboard`; logout returns to `/login`, clears localStorage, and `WsStatusChip` shows `Inactivo`; reload after login rehydrates via `/me`.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

- [ ] Login happy path (admin): `admin@lacocinadekai.com / admin123` → dashboard shows name, business `La Cocina de Kai`, role chip Admin, one or more branches, WS chip `Conectado`.
- [ ] Login happy path (cashier): `cajero@lacocinadekai.com / cajero123` → dashboard visible, `/users` URL redirects to `/dashboard`, sidebar hides Usuarios.
- [ ] Login 401: wrong password → Alert `Email o contraseña incorrectos.`, focus on alert, inputs preserved, no token written.
- [ ] Login 429: trigger the 5-attempt lockout → Alert `Cuenta temporalmente bloqueada...`.
- [ ] Network failure on login: kill `pnpm dev` backend, submit → Alert `No pudimos conectar...`.
- [ ] Refresh flow: set `accessToken` to an expired JWT in localStorage, reload → `/me` triggers refresh, UI hydrates without forcing re-login.
- [ ] Refresh failure: clear `refreshToken` but keep expired access token → on refresh failure, redirected to `/login` and localStorage cleared.
- [ ] Logout: from the user menu → `POST /api/auth/logout` fires, WS disconnects (chip shows `Desconectado`), redirected to `/login`, localStorage cleared.
- [ ] Super_admin login (seed a record if needed): header shows `Admin global`, `/users` visible, business picker absent.
- [ ] Responsive 1024px: sidebar is a drawer, header layout intact, no horizontal scroll.
- [ ] Dark mode: toggle via `ColorSchemeToggle`, LoginPage + AppLayout remain AA, teal + amber keep their semantic roles.
- [ ] Visual QA of `LoginPage` against the `MerchantLogin` artboard: panel izq teal 700 con grid sutil; `KaiPOSLogo` horizontal en brand teal con "K" blanca; chip Merchant; stats en JetBrains Mono; form derecha con SSO deshabilitado + tooltip "Próximamente"; helper card con ⌘; footer con versión mono `v 0.1.0` (o el número real del package).
- [ ] Accessibility pass: keyboard-only login, alert receives focus on error, password toggle announces correctly, nav items reachable via `Tab`.
- [ ] `rg "from '@mui/material" apps/frontend-admin/src` returns zero matches (captured as a phase 3 verification step, re-run at QA time).

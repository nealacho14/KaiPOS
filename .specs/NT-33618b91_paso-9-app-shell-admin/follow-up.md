# Follow-up Tasks

Source: `.specs/NT-33618b91_paso-9-app-shell-admin/`

<!-- Items discovered during implementation that are out of scope but worth tracking.
     Each item should explain what and why in one line. -->

- [ ] Extract a shared `stripPasswordHash(user)` util — currently duplicated across `apps/backend/src/services/auth.ts` and `apps/backend/src/services/users.ts`, and Phase 1 adds a third consumer in the `/api/auth/me` handler; pull it into `apps/backend/src/lib/` once the duplication lands to avoid drift.
- [ ] Extract a shared `idToString(id)` util — the same defensive-cast helper appears in `apps/backend/src/services/auth.ts` and will need to be reused by the `/me` handler in Phase 1; either centralize in `apps/backend/src/lib/` or, if it graduates to truly generic territory, in `@kaipos/shared/utils`.
- [ ] Delete the `apps/backend/src/lib/permissions.ts` re-export shim once every backend call site migrates to `import from '@kaipos/shared/permissions'`; the shim exists only to avoid a large import churn in Phase 1.
- [ ] Replace `window.location.assign('/login')` in `apps/frontend-admin/src/lib/api.ts` with an injected `onAuthFailure` callback wired through `AuthProvider` — keeps the HTTP client decoupled from the router and trivially testable without faking `window.location`.
- [ ] Promote `PageHeader`, `EmptyState`, `WsStatusChip`, `Sidebar`, `Header`, `UserMenu` from `apps/frontend-admin/src/components/` to `@kaipos/ui` once the POS or Kitchen terminal app becomes a second consumer — explicitly marked Out of Scope by the current ticket.
- [ ] Introduce a `WebSocketProvider` in `apps/frontend-admin/` wrapping a single `useWebSocket` instance once more than one page needs status / subscriptions — Phase 3 temporarily leaves `AppLayout` + `DebugWebSocket` as two independent hook callers, which works but risks drift.
- [ ] Wire the `Mantener sesión (30 días)` checkbox to an actual long-lived refresh-token TTL path — right now it's UI state only; the backend `REFRESH_TOKEN_TTL_DAYS` is a constant. Requires a new `rememberMe` field on `/api/auth/login` and a conditional TTL in `apps/backend/src/services/auth.ts`.
- [ ] Real SSO (Google + Apple) handlers — currently the `Continuar con Google / Apple` buttons are disabled placeholders with a `Próximamente` tooltip.
- [ ] Forgot / reset password UI screens — the backend endpoints exist (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`) but there are no pages yet; the `¿Olvidaste?` link in the password label is currently dead.
- [ ] Mobile (< 600px) optimization of the admin shell — explicitly out of scope for this ticket; the current iteration targets desktop + tablet (≥ 1024px).
- [ ] Business picker for `super_admin` — super_admin currently logs in and sees `Admin global` as a placeholder; a proper picker should let them scope the shell to a chosen business.

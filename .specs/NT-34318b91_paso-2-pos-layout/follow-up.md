# Follow-up Tasks

Source: `.specs/NT-34318b91_paso-2-pos-layout/`

<!-- Items discovered during implementation that are out of scope but worth tracking.
     Each item should explain what and why in one line. -->

- [ ] Extract shared app runtime into `packages/app-runtime`: `AuthContext`, `ActiveBranchContext`, `WebSocketContext`, `lib/api.ts`, `lib/auth-storage.ts`, `lib/ws-client.ts`, `hooks/useActiveBranch.ts`, `hooks/useBranches.ts`, `hooks/useWebSocket.ts`, and the `RequireAuth` / `RequirePermission` guards — currently duplicated between `apps/frontend-admin` and `apps/frontend-pos`; drift will silently introduce auth/WS divergence.
- [ ] Promote generic UI from `apps/frontend-admin/src/components` into `@kaipos/ui`: `EmptyState`, `WsStatusChip`, `ActiveBranchSwitcher`, `BusinessPicker`, and a non-admin-specific `UserMenu` — they are framework-level building blocks, not admin-only.
- [ ] If the 500-product SLA misses `< 1 s` after Paso 2 ships, raise `paginationQuerySchema.limit` cap above 100 (`packages/shared/src/schemas/pagination.ts:16`) — either globally or by exposing a POS-specific `?limit=500` path. Conditional on QA timing.
- [ ] Plumb a per-business currency (`business.currency`) through `AuthBusiness` and `MeResponse` so the POS / admin can format money beyond hardcoded MXN; the catalog tile currently falls back to `'MXN'` with a `TODO`.
- [ ] Decide on production routing: serve `frontend-pos` from `/pos/*` under the existing CloudFront distribution vs. a dedicated subdomain. Affects `vite.config.ts` `base`, `infra/lib/frontend-stack.ts` (currently single-app), and the deploy scripts in root `package.json` (`deploy:prod:frontend`).
- [ ] Replicating `LoginPage` / `ForgotPasswordPage` / `ResetPasswordPage` between admin and POS is duplication that ages badly. After the runtime-extraction follow-up lands, consider also extracting an `@kaipos/auth-pages` package (or shared route module) so both apps mount the same flow.

# Follow-up Tasks

Source: `.specs/NT-34318b91_paso-2-pos-layout/`

<!-- Items discovered during implementation that are out of scope but worth tracking.
     Each item should explain what and why in one line. -->

<!--
Status legend: `[x]` resolved in PR for this branch; `[ ]` deferred. The
follow-ups PR ships the items checked below; the unchecked ones depend on
either a deployment decision or a larger refactor that warrants its own PR.
-->

- [ ] Extract shared app runtime into `packages/app-runtime`: `AuthContext`, `ActiveBranchContext`, `WebSocketContext`, `lib/api.ts`, `lib/auth-storage.ts`, `lib/ws-client.ts`, `hooks/useActiveBranch.ts`, `hooks/useBranches.ts`, `hooks/useWebSocket.ts`, and the `RequireAuth` / `RequirePermission` guards — currently duplicated between `apps/frontend-admin` and `apps/frontend-pos`; drift will silently introduce auth/WS divergence. **Deferred to its own PR** (~30 files moved, touches both apps' tests; the spec authors themselves carved this out of KAI2-2 for scope).
- [x] Promote generic UI from `apps/frontend-admin/src/components` into `@kaipos/ui`: **`EmptyState` and `WsStatusChip` moved** (presentational, no runtime deps). `ActiveBranchSwitcher`, `BusinessPicker`, `UserMenu` still consume app-level hooks (`useActiveBranch`, `useBranches`, `useAuth`, `apiJson`) and can only move once the runtime is extracted — they remain in each app's `components/` for now.
- [x] Raised `paginationQuerySchema.limit` cap from 100 → 500 (`packages/shared/src/schemas/pagination.ts:16`) so the POS can request the full 500-product page in one shot. Default page size unchanged.
- [x] Plumbed per-business currency through `Business`, `AuthBusiness`, `LoginResponse.business`, `MeResponse.business`, and the Mongo validator; admin price tables and the POS catalog now read `business.currency` (defaulting to `'MXN'` when missing). Seed sets `currency: 'DOP'` for La Cocina de Kai.
- [ ] Decide on production routing: serve `frontend-pos` from `/pos/*` under the existing CloudFront distribution vs. a dedicated subdomain. Affects `vite.config.ts` `base`, `infra/lib/frontend-stack.ts` (currently single-app), and the deploy scripts in root `package.json` (`deploy:prod:frontend`). **Deferred — needs an infra/deploy decision before code.**
- [ ] Replicating `LoginPage` / `ForgotPasswordPage` / `ResetPasswordPage` between admin and POS is duplication that ages badly. After the runtime-extraction follow-up lands, consider also extracting an `@kaipos/auth-pages` package (or shared route module) so both apps mount the same flow. **Blocked on runtime extraction.**
- [x] `useBarcodeScanner` now skips modifier keys (`Shift`, `Control`, `Alt`, `Meta`, `CapsLock`, `NumLock`, `ScrollLock`, `AltGraph`, `Fn`, `FnLock`, `Hyper`, `Super`, `Symbol`, `SymbolLock`) instead of resetting the buffer. New test exercises a Shift+letter HID burst.
- [x] `CatalogProvider.fetchAll` resets the cache entry to `EMPTY_ENTRY` on the post-await bail when the key was abandoned mid-flight, so a revisit re-enters `ensureLoaded` and refetches instead of being stuck on `loading`.

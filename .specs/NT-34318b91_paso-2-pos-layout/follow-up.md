# Follow-up Tasks

Source: `.specs/NT-34318b91_paso-2-pos-layout/`

<!-- Items discovered during implementation that are out of scope but worth tracking.
     Each item should explain what and why in one line. -->

<!--
Status legend: `[x]` resolved in PR for this branch; `[ ]` deferred. The
follow-ups PR ships the items checked below; the unchecked ones depend on
either a deployment decision or a larger refactor that warrants its own PR.
-->

- [x] Extracted shared app runtime into `packages/app-runtime` — `AuthContext`, `ActiveBranchContext`, `WebSocketContext`, `lib/api.ts`, `lib/auth-storage.ts`, `lib/ws-client.ts`, `hooks/useActiveBranch.ts`, `hooks/useBranches.ts`, `hooks/useWebSocket.ts`, `RequireAuth` / `RequirePermission` guards. `RequirePermission` is now parametrized with a `fallbackPath` prop (admin passes `/dashboard`, POS passes `/`) so the guard stays neutral.
- [x] Promoted `ActiveBranchSwitcher`, `BusinessPicker`, `UserMenu` into the shared package alongside the runtime. **Deviation from the original wording**: they live in `@kaipos/app-runtime/src/components/` rather than `@kaipos/ui` because they consume `useAuth`, `useActiveBranch`, `apiJson`, etc. — placing them in `@kaipos/ui` would force the design-system package to depend on app state, which violates the rule that `@kaipos/ui` stays free of runtime dependencies. `EmptyState` and `WsStatusChip` remain in `@kaipos/ui` (pure presentation).
- [x] Raised `paginationQuerySchema.limit` cap from 100 → 500 (`packages/shared/src/schemas/pagination.ts:16`) so the POS can request the full 500-product page in one shot. Default page size unchanged.
- [x] Plumbed per-business currency through `Business`, `AuthBusiness`, `LoginResponse.business`, `MeResponse.business`, and the Mongo validator; admin price tables and the POS catalog now read `business.currency` (defaulting to `'MXN'` when missing). Seed sets `currency: 'DOP'` for La Cocina de Kai.
- [x] Production routing decided: **POS served at `/pos/*` on the same CloudFront distribution** (no Route53/ACM/CORS work needed). `apps/frontend-pos/vite.config.ts` now sets `base: '/pos/'`; `infra/lib/frontend-stack.ts` adds a second S3 bucket (`kaipos-frontend-pos-prod`), a `/pos/*` behavior, and a prefix-stripping CloudFront Function (`infra/lib/spa-router-pos.js`). The two-phase deploy script now builds both apps in phase 2.
- [x] Extracted `@kaipos/auth-pages` (`LoginPage`, `ForgotPasswordPage`, `ResetPasswordPage`). `LoginPage` takes a `defaultRedirectPath` prop so each app passes its own destination (admin → `/dashboard`, POS → `/`).
- [x] `useBarcodeScanner` now skips modifier keys (`Shift`, `Control`, `Alt`, `Meta`, `CapsLock`, `NumLock`, `ScrollLock`, `AltGraph`, `Fn`, `FnLock`, `Hyper`, `Super`, `Symbol`, `SymbolLock`) instead of resetting the buffer. New test exercises a Shift+letter HID burst.
- [x] `CatalogProvider.fetchAll` resets the cache entry to `EMPTY_ENTRY` on the post-await bail when the key was abandoned mid-flight, so a revisit re-enters `ensureLoaded` and refetches instead of being stuck on `loading`.

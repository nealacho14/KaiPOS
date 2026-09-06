# CLAUDE.md

## Project

KaiPOS — cloud-native Point of Sale. pnpm + Turborepo monorepo: apps in `apps/` (`backend`, `frontend-admin`, `frontend-pos`, `e2e`), libs in `packages/` (`shared`, `ui`, `app-runtime`, `auth-pages`, `tsconfig`, `eslint-config`), AWS CDK in `infra/`.

## Commands

```bash
pnpm install
pnpm dev                # backend :4000, frontend :3000 (Docker Mongo via .env)
pnpm docker:up          # backend :4001, frontend :3001 (Docker Mongo + MinIO)
pnpm build
pnpm lint && pnpm typecheck && pnpm test
pnpm format

pnpm --filter @kaipos/backend db:setup      # collections + validators + indexes (idempotent)
pnpm --filter @kaipos/backend db:seed       # Mura menu; Docker Mongo only — refuses mongodb+srv://
pnpm --filter @kaipos/backend menu:export   # Mura seed as JSON on stdout (Ferna fixture; no DB)

pnpm deploy:prod                            # full two-phase deploy
pnpm deploy:prod:api | :websocket | :frontend  # targeted
```

Login (after seed): `admin@mura.co` / `admin123` (override with `MURA_ADMIN_PASSWORD`).

## Invariants (do not violate)

- **Node 20** from `.nvmrc`. Never run with the shell default.
- **No `console.log`.** Backend logs through Pino (`src/lib/logger.ts`).
- **RBAC.** Authorization decisions go through `hasPermission(role, permission)` / `requirePermission(permission)`. **Never** inline `role === '...'` for authorization — the only legitimate `role === 'super_admin'` checks are for tenant-isolation scoping (`businessId === '*'`). See `docs/database.md`.
- **Design system boundary.** In `apps/**/src` never import from `@mui/material`, `@mui/material/*`, or `lucide-react` directly. Everything routes through `@kaipos/ui` (re-exports both). Enforced by `no-restricted-imports` in `packages/eslint-config/react.js`.
- **Design tokens.** In `apps/**/src` never use `fontSize: <n>`, `fontWeight: <n>` or `borderRadius: <n>` numeric literals in `sx`/`style`. Use `<Typography variant="...">` (or `theme.typography.X`), `theme.radii.X`, `theme.shape.borderRadius`. Spacing always via the MUI scale (`p={2}`, `m={3}`, `theme.spacing(n)`) — never `'<n>px'` strings. Colors via `palette.*` or `colors.*` — never hex/rgb literals. See `packages/ui/README.md` for variant mapping.
- **Responsive & PWA.** Three layout modes via `useLayoutMode()` from `@kaipos/ui` (`phone` / `tablet` / `desktop`) — use it when the component tree changes, `sx` breakpoints when only styling scales. Never `100vh`, always `100dvh`. Both SPAs share one origin, so the admin service worker must keep `/pos` and `/api` in its `navigateFallbackDenylist`. See `packages/ui/README.md` and `apps/frontend-pos/README.md`.
- **Shared RBAC types.** `Permission`, `ROLE_PERMISSIONS`, `hasPermission`, `SUPER_ADMIN_BUSINESS_ID` live only in `@kaipos/shared` / `@kaipos/shared/permissions`. No local shim in apps.
- **Lambda bundling.** Don't change `apps/backend/tsup.config.ts` without preserving: workspace packages + `mongodb` bundled, `@aws-sdk/*` external (Node 20 runtime), `dist/package.json` with `type: "module"`, and the `createRequire` banner.
- **No Atlas in local.** Never put `mongodb+srv://` in `.env`. Atlas creds live only in Secrets Manager (`kaipos/prod/mongo-uri`) and load at Lambda cold start; `src/db/client.ts`, `pnpm setup` and the seed scripts refuse `mongodb+srv://` when `MONGO_SECRET_ARN` is unset.
- **OpenAPI in sync.** After changing a Zod schema, run `pnpm --filter @kaipos/backend openapi:generate` and commit `apps/backend/openapi.json` — CI's `quality` job fails otherwise.

## Tests & CI

Vitest everywhere (unit + integration). PR CI runs `quality` only (format / lint / typecheck / build / openapi-sync / test); E2E is a **post-deploy smoke**, not a deploy gate. Pre-commit hook runs `lint-staged` (eslint + prettier on staged files), then `pnpm typecheck` and `pnpm test` against the full monorepo — fix issues, never `--no-verify`.

## Style

TypeScript strict, ES2022. MongoDB native driver (no Mongoose). Prettier: double quotes, semicolons, trailing commas, 100-char width. Unused vars prefixed with `_`.

## Deeper docs

- [docs/architecture.md](docs/architecture.md) — monorepo, backend pattern, frontend shell.
- [docs/database.md](docs/database.md) — DB scripts and full RBAC.
- [docs/realtime.md](docs/realtime.md) — WebSocket (channels, auth, publish helper).
- [docs/local-dev.md](docs/local-dev.md) — Docker, MinIO, environment variables.
- [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) — AWS stacks, CloudFront, secrets.
- [docs/observability.md](docs/observability.md) — alarms, runbook, Logs Insights queries.
- [infra/DEPLOYMENT.md](infra/DEPLOYMENT.md) — deployment runbook.
- [packages/ui/README.md](packages/ui/README.md) — design tokens and variants.
- [apps/frontend-admin/README.md](apps/frontend-admin/README.md) — admin routes and dev notes.
- [apps/frontend-pos/README.md](apps/frontend-pos/README.md) — POS routing, PWA and offline behavior.

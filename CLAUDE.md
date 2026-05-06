# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repo.

## Project

KaiPOS is a cloud-native Point of Sale platform. Monorepo: pnpm workspaces + Turborepo. Apps under `apps/` (`backend`, `frontend-admin`), libs under `packages/` (`shared`, `ui`, `tsconfig`, `eslint-config`), AWS CDK in `infra/`.

## Commands

```bash
pnpm install
pnpm dev                # backend :4000, frontend :3000 (Atlas via .env)
pnpm docker:up          # backend :4001, frontend :3001 (local Mongo + MinIO)
pnpm build
pnpm lint && pnpm typecheck && pnpm test
pnpm format

pnpm --filter @kaipos/backend db:setup      # collections + validators + indexes (Atlas-safe)
pnpm --filter @kaipos/backend db:seed       # demo data; refuses Atlas / mongodb+srv://

pnpm deploy:prod                            # full two-phase deploy
pnpm deploy:prod:api | :websocket | :frontend  # targeted
```

Login (after seed): `admin@lacocinadekai.com` / `admin123`.

## Invariants (do not violate)

- **Node 20** from `.nvmrc`. Never run with the shell default.
- **No `console.log`.** Backend logs through Pino (`src/lib/logger.ts`).
- **RBAC.** Authorization decisions go through `hasPermission(role, permission)` / `requirePermission(permission)`. **Never** inline `role === '...'` for authorization — the only legitimate `role === 'super_admin'` checks are for tenant-isolation scoping (`businessId === '*'`). See `docs/database.md`.
- **Design system boundary.** In `apps/**/src` never import from `@mui/material`, `@mui/material/*`, or `lucide-react` directly. Everything routes through `@kaipos/ui` (re-exports both). Enforced by `no-restricted-imports` in `packages/eslint-config/react.js`.
- **Design tokens.** In `apps/**/src` never use `fontSize: <n>`, `fontWeight: <n>` or `borderRadius: <n>` numeric literals in `sx`/`style`. Use `<Typography variant="...">` (or `theme.typography.X`), `theme.radii.X`, `theme.shape.borderRadius`. Spacing always via the MUI scale (`p={2}`, `m={3}`, `theme.spacing(n)`) — never `'<n>px'` strings. Colors via `palette.*` or `colors.*` — never hex/rgb literals. See `packages/ui/README.md` for variant mapping.
- **Shared RBAC types.** `Permission`, `ROLE_PERMISSIONS`, `hasPermission`, `SUPER_ADMIN_BUSINESS_ID` live only in `@kaipos/shared` / `@kaipos/shared/permissions`. No local shim in apps.
- **Lambda config.** `apps/backend/tsup.config.ts` bundles workspace packages and `mongodb`, leaves `@aws-sdk/*` external (provided by Node 20 runtime), emits `dist/package.json` with `type: "module"`, and injects a `createRequire` banner.
- **Seeds + secrets.** `db:seed` refuses to run if `MONGO_SECRET_ARN` is set or `MONGO_URI` contains `mongodb+srv://`. Atlas credentials live only in Secrets Manager (`kaipos/prod/mongo-uri`).

## Style

TypeScript strict, ES2022. MongoDB native driver (no Mongoose). Prettier: double quotes, semicolons, trailing commas, 100 char width. Unused vars prefixed with `_`.

## Deeper docs

- [docs/architecture.md](docs/architecture.md) — monorepo, backend pattern, frontend shell.
- [docs/database.md](docs/database.md) — DB scripts and full RBAC.
- [docs/realtime.md](docs/realtime.md) — WebSocket (channels, auth, publish helper).
- [docs/local-dev.md](docs/local-dev.md) — Docker, MinIO, environment variables.
- [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) — AWS stacks, CloudFront, secrets.
- [infra/DEPLOYMENT.md](infra/DEPLOYMENT.md) — deployment runbook.
- [packages/ui/README.md](packages/ui/README.md) — design tokens and variants.
- [apps/frontend-admin/README.md](apps/frontend-admin/README.md) — admin routes and dev notes.

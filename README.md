# KaiPOS

Cloud-native Point of Sale platform built with Node.js, TypeScript, React, and AWS serverless.

## Prerequisites

- **Node.js** >= 20 (recommend using [nvm](https://github.com/nvm-sh/nvm): `nvm use`)
- **pnpm** >= 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- **Docker & Docker Compose** (for local development)
- **AWS CLI v2** (for infrastructure deployment)

## Quick Start

One command from a fresh clone gets you a running stack with seeded demo data:

```bash
git clone <repo-url>
cd KaiPOS
pnpm setup        # node/docker pre-checks → .env → docker compose --wait → db:setup → db:seed
pnpm dev          # backend :4000 + frontend :3000 (against the Docker Mongo)
```

Sign in at http://localhost:3000 with `admin@mura.co` / `admin123`.

`pnpm setup` is idempotent — rerunning it is safe. It uses the local Docker
stack as the database (Mongo + MinIO), so a working Docker daemon is required.

### Manual setup

If you'd rather wire the pieces yourself, the long form (still Docker
Mongo — `mongodb+srv://` URIs are refused at every layer):

```bash
pnpm install                                       # install workspace deps
cp .env.example .env                               # adjust JWT_SECRET (MONGO_URI default is fine)
pnpm docker:up                                     # local Mongo + MinIO
pnpm --filter @kaipos/backend db:setup             # collections + validators + indexes
pnpm --filter @kaipos/backend db:seed              # demo data (Docker Mongo only)
pnpm dev                                           # backend :4000 + frontend :3000
```

## Available Commands

| Command                                  | Description                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm setup`                             | One-shot bootstrap: pre-checks, `.env`, Docker stack, schema + seed     |
| `pnpm dev`                               | Start all apps in dev mode (backend + frontend)                         |
| `pnpm build`                             | Build all packages                                                      |
| `pnpm lint`                              | Lint all packages                                                       |
| `pnpm typecheck`                         | Type-check all packages                                                 |
| `pnpm format`                            | Format all files with Prettier                                          |
| `pnpm format:check`                      | Check formatting without writing                                        |
| `pnpm e2e`                               | Run the Cypress suite headless (alias of `--filter @kaipos/e2e cy:run`) |
| `pnpm docker:up`                         | Start all services with Docker Compose (with build)                     |
| `pnpm docker:down`                       | Stop Docker Compose services                                            |
| `pnpm --filter @kaipos/backend db:setup` | Create MongoDB collections, validators, indexes (idempotent)            |
| `pnpm --filter @kaipos/backend db:seed`  | Insert demo data; Docker Mongo only — refuses `mongodb+srv://`          |
| `pnpm deploy:prod`                       | Build apps and deploy all AWS CDK stacks to prod                        |
| `pnpm deploy:prod:api`                   | Build backend and deploy only the API stack                             |
| `pnpm deploy:prod:frontend`              | Build frontend and deploy only the frontend stack                       |

## Environment Variables

Copy `.env.example` to `.env` and set your values. The root `.env` is used both by `pnpm dev` (via `DOTENV_CONFIG_PATH`) and by Docker (via `env_file:` in `docker-compose.yml`).

| Variable                  | Description                                                                                                                                                                                         | Default                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `MONGO_URI`               | Local Mongo connection string. `mongodb+srv://` is refused (Atlas lives in prod only, via Secrets Manager). Ignored inside Docker — the backend container hardcodes `mongodb://mongo:27017/kaipos`. | `mongodb://localhost:27017/kaipos` |
| `JWT_SECRET`              | HMAC secret for signing access tokens                                                                                                                                                               | _(required in dev)_                |
| `PASSWORD_RESET_BASE_URL` | Frontend URL where password reset links point                                                                                                                                                       | `http://localhost:3000`            |
| `SES_SENDER_EMAIL`        | From-address for SES emails (if unset, tokens are logged)                                                                                                                                           | _(unset)_                          |

## Development Modes

### Local (`pnpm dev`)

Uses the local Mongo configured via `MONGO_URI` in `.env` (default
`mongodb://localhost:27017/kaipos`, served by the `mongo` container from
`pnpm docker:up`). The backend refuses `mongodb+srv://` URIs — Atlas is
prod-only and reached exclusively via Secrets Manager from Lambda.

- **Backend API** on http://localhost:4000
- **Frontend Admin** on http://localhost:3000

### Docker (`pnpm docker:up`)

Uses a local MongoDB container. `MONGO_URI` is hardcoded to the Docker network (`mongodb://mongo:27017/kaipos`) inside the backend container, but the rest of the root `.env` (including `JWT_SECRET`) is still loaded via Compose's `env_file:` directive — so `.env` is still required.

- **Backend API** on http://localhost:4001
- **Frontend Admin** on http://localhost:3001
- **MongoDB** on localhost:27017

Both modes can run simultaneously without port conflicts.

## Project Structure

```
KaiPOS/
├── apps/
│   ├── backend/              # Node.js/TypeScript serverless API
│   └── frontend-admin/       # React/TypeScript admin SPA (Vite)
├── packages/
│   ├── shared/               # Shared types and utilities
│   ├── tsconfig/             # Shared TypeScript configurations
│   └── eslint-config/        # Shared ESLint configuration
├── infra/                    # AWS CDK v2 (Infrastructure as Code)
├── docker/                   # Dockerfiles
├── docker-compose.yml        # Local development services
├── turbo.json                # Turborepo pipeline configuration
└── pnpm-workspace.yaml       # pnpm workspace configuration
```

## Packages

| Package                  | Description                                                           |
| ------------------------ | --------------------------------------------------------------------- |
| `@kaipos/backend`        | API serverless handlers with Hono (local dev) and Lambda (production) |
| `@kaipos/frontend-admin` | React SPA for admin dashboard                                         |
| `@kaipos/shared`         | Shared TypeScript types and utility functions                         |
| `@kaipos/tsconfig`       | Shared TypeScript configurations (base, node, react)                  |
| `@kaipos/eslint-config`  | Shared ESLint flat config (base, node, react)                         |
| `@kaipos/infra`          | AWS CDK stacks for the production deployment                          |

## Backend Middleware & Logging

The backend includes a middleware stack applied to all requests:

1. **CORS** (`hono/cors`) — allows cross-origin requests in dev
2. **Origin verification** (`src/middleware/origin-verify.ts`) — in production, validates that requests come through CloudFront via a shared-secret `x-origin-verify` header. Skipped in local dev when `CLOUDFRONT_SECRET` is not set.
3. **Request logger** (`src/middleware/request-logger.ts`) — generates a `requestId` per request, logs method, path, status code, and duration in ms as structured JSON (Pino)
4. **Error handler** (`app.onError`) — catches unhandled errors, returns `ApiErrorResponse` without exposing internals
5. **Validation** (`src/middleware/validation.ts`) — Zod schema validation for body, params, and query

Logging uses **Pino** with structured JSON output. In local dev, `pino-pretty` provides colorized human-readable logs automatically (configured via Pino transport, no piping needed).

## Database

KaiPOS uses **MongoDB** with the native Node.js driver (`mongodb` package).

- **Local (pnpm dev)**: the Docker `mongo` service (default `mongodb://localhost:27017/kaipos`). `mongodb+srv://` is refused at startup
- **Local (Docker)**: MongoDB 7 via Docker Compose
- **Production (AWS)**: MongoDB Atlas. The connection URI is stored in AWS
  Secrets Manager (`kaipos/prod/mongo-uri`); the Lambda resolves it at cold
  start via `MONGO_SECRET_ARN`. No URI is ever hardcoded in source or
  CloudFormation templates.

### Schema setup and seeding

Two separate scripts:

- `pnpm --filter @kaipos/backend db:setup` — creates collections, `$jsonSchema` validators, and indexes. Idempotent. Safe to run against local, Docker, and (operationally) Atlas via a tunnel from a workstation.
- `pnpm --filter @kaipos/backend db:seed` — inserts the real menu of the café **Mura** (business `mura`, 1 branch, 2 admin users, 13 categories, 64 products, 5 featured preferences) from the pure data module `apps/backend/src/db/seed-data/mura-menu.ts`. Idempotent by business slug. **Docker/local only**: fails fast if `MONGO_URI` contains `mongodb+srv://` or if `MONGO_SECRET_ARN` is set. Env: `MURA_ADMIN_PASSWORD` (defaults to `admin123` locally), `MURA_KELVIN_PASSWORD`, `MURA_IMAGE_BASE_URL`.
- `pnpm --filter @kaipos/backend menu:export` — dumps the same seed as deterministic JSON on stdout (the fixture consumed by the external app Ferna). No DB connection.

Running inside Docker:

```bash
docker compose exec -w /app/apps/backend backend pnpm db:setup
docker compose exec -w /app/apps/backend backend pnpm db:seed
```

Seeded users (local/Docker only):

| Role  | Email                           | Password                                                                         |
| ----- | ------------------------------- | -------------------------------------------------------------------------------- |
| admin | `admin@mura.co`                 | `admin123` (or `MURA_ADMIN_PASSWORD`)                                            |
| admin | `kelvin.hernandezc30@gmail.com` | Solo si hay carry-over de otro negocio o `MURA_KELVIN_PASSWORD`; si no, se omite |

Passwords are hashed at runtime with bcrypt (12 rounds).

## Deployment

KaiPOS has **one AWS-deployed environment: `prod`**. Local development
(`pnpm dev` / `pnpm docker:up`) is the "dev" environment.

### One-command deploy (from repo root)

```bash
# Full deploy (backend + frontend + all stacks)
pnpm deploy:prod

# Targeted deploys (faster when you only touched one side)
pnpm deploy:prod:api
pnpm deploy:prod:frontend
```

### Stacks (region `us-east-1`)

| Stack                  | What it creates                                                        |
| ---------------------- | ---------------------------------------------------------------------- |
| `kaipos-prod-secrets`  | Secrets Manager secret `kaipos/prod/mongo-uri` (populated out-of-band) |
| `kaipos-prod-assets`   | Private versioned S3 bucket (`kaipos-assets-prod`)                     |
| `kaipos-prod-api`      | API Gateway HTTP API + Lambda (no VPC, talks to Atlas over the net)    |
| `kaipos-prod-frontend` | S3 + CloudFront serving the SPA; proxies `/api/*` to the API Gateway   |

### Architecture notes

- **No VPC / NAT Gateway.** The Lambda runs outside any VPC and reaches
  MongoDB Atlas directly. Atlas IP allowlist controls network access. This
  keeps monthly cost near zero (~$1/month).
- **Same-origin frontend.** CloudFront has a `/api/*` behavior that proxies
  to API Gateway. The SPA calls `/api/health` (relative), so there is no
  CORS and the API Gateway URL is never exposed in the browser bundle.
- **Origin verification.** CloudFront attaches a shared-secret
  `x-origin-verify` header to `/api/*` requests. The Lambda middleware
  validates it, returning 403 for requests that bypass CloudFront.
- **Secrets.** `MONGO_URI` lives only in Secrets Manager, read by the Lambda
  at cold start. It never appears in source, env vars, or CloudFormation.

See [`infra/DEPLOYMENT.md`](infra/DEPLOYMENT.md) for the full first-time
setup (bootstrap, secret population, Atlas allowlist, verification, rotation).

## Tech Stack

- **Runtime**: Node.js 20 (TypeScript)
- **Frontend**: React 19, Vite 6
- **Backend**: Hono (local), AWS Lambda (production)
- **Database**: MongoDB (native driver)
- **Infrastructure**: AWS CDK v2 (API Gateway, Lambda, S3, CloudFront)
- **Monorepo**: pnpm workspaces + Turborepo
- **Linting**: ESLint 9 (flat config) + Prettier

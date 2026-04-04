# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KaiPOS is a cloud-native Point of Sale platform. Monorepo managed with pnpm workspaces + Turborepo.

## Commands

```bash
# Install dependencies
pnpm install

# Development (starts backend :4000 + frontend :3000)
pnpm dev

# Or use Docker (includes MongoDB :27017)
pnpm docker:up
pnpm docker:down

# Build all packages
pnpm build

# Lint & typecheck
pnpm lint
pnpm typecheck

# Format
pnpm format
pnpm format:check

# Run a single app
pnpm --filter @kaipos/backend dev
pnpm --filter @kaipos/frontend-admin dev

# Lint a single package
pnpm --filter @kaipos/backend lint

# Infrastructure deployment
cd infra && pnpm deploy:staging
cd infra && pnpm deploy:prod
```

No test framework is configured yet.

## Architecture

### Monorepo Structure

- **apps/backend** — Hono HTTP server (local dev) + AWS Lambda handlers (production). Entry: `src/index.ts`. Lambda functions built from `src/functions/**/*.ts` via tsup (ESM output).
- **apps/frontend-admin** — React 19 SPA built with Vite. Dev server proxies `/api` requests to backend at localhost:4000.
- **packages/shared** — Domain types (`Product`, `Order`, `User`) and utilities (`formatCurrency`, `generateOrderNumber`, `calculateOrderTotal`). Importable as `@kaipos/shared`, `@kaipos/shared/types`, `@kaipos/shared/utils`.
- **packages/tsconfig** — Shared TS configs: `base.json`, `node.json`, `react.json`. All use ES2022, strict mode, bundler module resolution.
- **packages/eslint-config** — Shared ESLint flat configs: base, `./node` (console allowed), `./react` (console warned).
- **infra** — AWS CDK v2 stacks: `DatabaseStack` (DocumentDB), `ApiStack` (API Gateway + Lambda), `FrontendStack` (S3 + CloudFront). Stage context (`staging`/`prod`) controls instance sizing and HA.

### Backend Pattern

The backend has two execution modes:
1. **Local**: Hono server (`src/index.ts`) with `@hono/node-server` + `tsx watch` for hot reload
2. **Production**: Individual Lambda handlers in `src/functions/` typed as `APIGatewayProxyHandlerV2`, bundled by tsup

Database access goes through `src/db/client.ts` (MongoDB singleton) and `src/db/collections.ts` (typed collection getters for `products`, `orders`, `users`).

### Key Conventions

- TypeScript strict mode everywhere, target ES2022
- MongoDB native driver (not Mongoose)
- Prettier: double quotes, semicolons, trailing commas, 100 char width
- Unused vars prefixed with `_` (ESLint configured to allow this)
- Node.js 20 minimum (see `.nvmrc`)

# KaiPOS

Cloud-native Point of Sale platform built with Node.js, TypeScript, React, and AWS serverless.

## Prerequisites

- **Node.js** >= 20 (recommend using [nvm](https://github.com/nvm-sh/nvm): `nvm use`)
- **pnpm** >= 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- **Docker & Docker Compose** (for local development)
- **AWS CLI v2** (for infrastructure deployment)

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd KaiPOS

# Install all dependencies (single command)
pnpm install

# Start all apps in development mode
pnpm dev
```

## Available Commands

| Command             | Description                                     |
| ------------------- | ----------------------------------------------- |
| `pnpm dev`          | Start all apps in dev mode (backend + frontend) |
| `pnpm build`        | Build all packages                              |
| `pnpm lint`         | Lint all packages                               |
| `pnpm typecheck`    | Type-check all packages                         |
| `pnpm format`       | Format all files with Prettier                  |
| `pnpm format:check` | Check formatting without writing                |

## Docker (Local Development)

Start the full stack with Docker Compose:

```bash
docker compose up
```

This starts:

- **Backend API** on http://localhost:4000
- **Frontend Admin** on http://localhost:3000
- **MongoDB** on localhost:27017

Stop services:

```bash
docker compose down
```

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
| `@kaipos/infra`          | AWS CDK stacks for staging and production deployment                  |

## Database

KaiPOS uses **MongoDB** with the native Node.js driver (`mongodb` package).

- **Local**: MongoDB 7 via Docker Compose
- **Staging/Production**: AWS DocumentDB (MongoDB-compatible) or MongoDB Atlas

## Deployment

### Staging

```bash
cd infra
pnpm deploy:staging
```

### Production

```bash
cd infra
pnpm deploy:prod
```

## Tech Stack

- **Runtime**: Node.js 20 (TypeScript)
- **Frontend**: React 19, Vite 6
- **Backend**: Hono (local), AWS Lambda (production)
- **Database**: MongoDB (native driver)
- **Infrastructure**: AWS CDK v2 (API Gateway, Lambda, DocumentDB, S3, CloudFront)
- **Monorepo**: pnpm workspaces + Turborepo
- **Linting**: ESLint 9 (flat config) + Prettier

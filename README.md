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

# Copy .env.example and configure your MongoDB URI
cp .env.example .env

# Start all apps in development mode
pnpm dev
```

## Available Commands

| Command             | Description                                        |
| ------------------- | -------------------------------------------------- |
| `pnpm dev`          | Start all apps in dev mode (backend + frontend)    |
| `pnpm build`        | Build all packages                                 |
| `pnpm lint`         | Lint all packages                                  |
| `pnpm typecheck`    | Type-check all packages                            |
| `pnpm format`       | Format all files with Prettier                     |
| `pnpm format:check` | Check formatting without writing                   |
| `pnpm docker:up`    | Start all services with Docker Compose (with build)|
| `pnpm docker:down`  | Stop Docker Compose services                       |

## Environment Variables

Copy `.env.example` to `.env` and set your values:

| Variable    | Description                  | Default                              |
| ----------- | ---------------------------- | ------------------------------------ |
| `MONGO_URI` | MongoDB connection string    | `mongodb://localhost:27017/kaipos`   |

## Development Modes

### Local (`pnpm dev`)

Uses MongoDB Atlas (or any external MongoDB) configured via `MONGO_URI` in `.env`.

- **Backend API** on http://localhost:4000
- **Frontend Admin** on http://localhost:3000

### Docker (`pnpm docker:up`)

Uses a local MongoDB container. No `.env` needed — connection is configured in `docker-compose.yml`.

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
| `@kaipos/infra`          | AWS CDK stacks for staging and production deployment                  |

## Database

KaiPOS uses **MongoDB** with the native Node.js driver (`mongodb` package).

- **Local (pnpm dev)**: MongoDB Atlas or any external MongoDB via `MONGO_URI`
- **Local (Docker)**: MongoDB 7 via Docker Compose
- **Staging/Production**: MongoDB Atlas

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
- **Infrastructure**: AWS CDK v2 (API Gateway, Lambda, S3, CloudFront)
- **Monorepo**: pnpm workspaces + Turborepo
- **Linting**: ESLint 9 (flat config) + Prettier

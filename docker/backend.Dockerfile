FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./

# Copy package.json files for dependency resolution
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY apps/backend/ apps/backend/
COPY packages/shared/ packages/shared/
COPY packages/tsconfig/ packages/tsconfig/
COPY packages/eslint-config/ packages/eslint-config/

EXPOSE 4000

CMD ["pnpm", "--filter", "@kaipos/backend", "dev"]

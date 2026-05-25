FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./

# Copy package.json files for dependency resolution
COPY apps/frontend-pos/package.json apps/frontend-pos/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/app-runtime/package.json packages/app-runtime/
COPY packages/auth-pages/package.json packages/auth-pages/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY apps/frontend-pos/ apps/frontend-pos/
COPY packages/shared/ packages/shared/
COPY packages/ui/ packages/ui/
COPY packages/app-runtime/ packages/app-runtime/
COPY packages/auth-pages/ packages/auth-pages/
COPY packages/tsconfig/ packages/tsconfig/
COPY packages/eslint-config/ packages/eslint-config/

EXPOSE 3002

CMD ["pnpm", "--filter", "@kaipos/frontend-pos", "dev", "--host"]

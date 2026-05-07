#!/usr/bin/env bash
# One-command local bootstrap.
#
# Goal: a fresh `git clone && pnpm setup && pnpm dev` lands a new dev on a
# working stack — Mongo + MinIO up, schema applied, demo data seeded, and the
# admin login printed at the end. Idempotent: rerunning is safe.
#
# Strategy:
#   1. Pre-checks: Node >= 20 (matches .nvmrc) and a reachable Docker daemon.
#   2. Copy `.env.example` to `.env` if missing; warn the operator that the
#      stub `JWT_SECRET` is fine for local but must be changed for anything
#      shared.
#   3. `docker compose up -d --wait` to launch backend/frontend/mongo/minio
#      and block until each container's healthcheck reports ready. The Mongo
#      service in compose has no native healthcheck, so after `--wait` we
#      probe Mongo directly with a `mongosh ping` until it answers.
#   4. Run `db:setup` (idempotent collection/index/validator creation) then
#      `db:seed` (demo business + admin/cashier accounts). Both target the
#      Docker Mongo via the host-published port :27017.
#   5. Print the final URLs + login.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

color_red=$'\033[0;31m'
color_green=$'\033[0;32m'
color_yellow=$'\033[1;33m'
color_blue=$'\033[0;34m'
color_reset=$'\033[0m'

log()  { printf "%s==>%s %s\n" "$color_blue"   "$color_reset" "$*"; }
ok()   { printf "%s ok%s %s\n" "$color_green"  "$color_reset" "$*"; }
warn() { printf "%s !! %s %s\n" "$color_yellow" "$color_reset" "$*"; }
err()  { printf "%s ✖ %s %s\n" "$color_red"    "$color_reset" "$*" >&2; }

# ----------------------------------------------------------------------------
# 1. Pre-checks
# ----------------------------------------------------------------------------

log "Checking prerequisites"

if ! command -v node >/dev/null 2>&1; then
  err "Node.js is not installed. Install Node 20 (e.g. via nvm: \`nvm install 20 && nvm use\`)."
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 20 ]; then
  err "Node $(node -v) detected — KaiPOS requires Node 20+. Try \`nvm use\` (reads .nvmrc)."
  exit 1
fi
ok "Node $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  err "pnpm is not installed. Run \`corepack enable && corepack prepare pnpm@9 --activate\`."
  exit 1
fi
ok "pnpm $(pnpm -v)"

if ! command -v docker >/dev/null 2>&1; then
  err "Docker is not installed. Install Docker Desktop (or the engine + compose plugin)."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  err "Docker daemon is not reachable. Start Docker Desktop (or \`sudo systemctl start docker\`) and rerun."
  exit 1
fi
ok "Docker daemon reachable"

# ----------------------------------------------------------------------------
# 2. .env bootstrap
# ----------------------------------------------------------------------------

log "Ensuring .env exists"
if [ ! -f .env ]; then
  cp .env.example .env
  warn ".env created from .env.example — JWT_SECRET is the stub default."
  warn "    For a real environment, change it to a strong random value."
else
  ok ".env already present (left untouched)"
fi

# ----------------------------------------------------------------------------
# 3. Install workspace dependencies (idempotent)
# ----------------------------------------------------------------------------

log "Installing workspace dependencies (pnpm install)"
pnpm install --silent
ok "Dependencies up to date"

# ----------------------------------------------------------------------------
# 4. Bring up the Docker stack and wait for health
# ----------------------------------------------------------------------------

log "Starting Docker services (this may build images on first run)"
docker compose up -d --build --wait
ok "Containers up"

log "Waiting for MongoDB to accept connections"
mongo_ready=0
for _ in $(seq 1 30); do
  if docker compose exec -T mongo mongosh --quiet --eval 'db.adminCommand({ ping: 1 }).ok' \
      2>/dev/null | grep -q '^1$'; then
    mongo_ready=1
    break
  fi
  sleep 2
done

if [ "$mongo_ready" -ne 1 ]; then
  err "MongoDB did not become ready in 60s. Inspect with \`docker compose logs mongo\`."
  exit 1
fi
ok "MongoDB ready on localhost:27017"

# ----------------------------------------------------------------------------
# 5. DB schema + seed (idempotent; both ignore Atlas via env guards)
# ----------------------------------------------------------------------------

log "Applying schema (db:setup)"
pnpm --filter @kaipos/backend db:setup
ok "Collections, validators, and indexes ensured"

log "Seeding demo data (db:seed)"
pnpm --filter @kaipos/backend db:seed
ok "Demo data seeded"

# ----------------------------------------------------------------------------
# 6. Done — print the operator hand-off
# ----------------------------------------------------------------------------

cat <<EOF

${color_green}KaiPOS is ready.${color_reset}

  Backend (Docker):  http://localhost:4001
  Frontend (Docker): http://localhost:3001
  MinIO console:     http://localhost:9001  (login: kaipos / kaiposdev123)

  Login as admin:    admin@lacocinadekai.com / admin123

Next steps:
  • \`pnpm dev\`       run backend :4000 + frontend :3000 against the same Mongo
  • \`docker compose down\`  stop the Docker stack when you're done
  • \`pnpm e2e\`       run the Cypress suite against the frontend

EOF

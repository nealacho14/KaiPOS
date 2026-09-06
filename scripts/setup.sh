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

# Local-dev policy: MONGO_URI must point at Docker Mongo, never Atlas. Refuse
# early so we don't burn time on `docker compose up` / `pnpm install` only to
# fail at db:seed (which has its own anti-Atlas guard). Read .env directly —
# we don't want to source it (would clobber the operator's shell env).
mongo_uri_in_env="$(grep -E '^[[:space:]]*MONGO_URI=' .env 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
if [ -n "${mongo_uri_in_env:-}" ] && printf '%s' "$mongo_uri_in_env" | grep -q '^mongodb+srv://'; then
  err "Tu .env tiene MONGO_URI=mongodb+srv://... (Atlas)."
  err "KaiPOS local-dev corre contra Docker Mongo, no Atlas."
  err ""
  err "Cambia esa línea en .env a:"
  err "    MONGO_URI=mongodb://localhost:27017/kaipos"
  err ""
  err "Si necesitabas guardar la URI de Atlas para algo, copiala a un archivo"
  err "aparte (.env.atlas, 1Password, etc.) — y rotala si la commiteaste."
  exit 1
fi
ok "MONGO_URI is local (no Atlas SRV URI in .env)"

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

  Login as admin:    admin@mura.co / admin123

Next steps:
  • \`pnpm dev\`       run backend :4000 + frontend :3000 against the same Mongo
  • \`docker compose down\`  stop the Docker stack when you're done
  • \`pnpm e2e\`       run the Cypress suite against the frontend

EOF

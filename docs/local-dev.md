# Local development

Two ways to run locally — both load `.env` from the repo root.

## `pnpm setup` (one-shot bootstrap)

Implemented as `scripts/setup.sh`. Pre-checks Node 20 and a reachable Docker
daemon, copies `.env.example` → `.env` if missing, brings the Docker stack up
with `docker compose up -d --wait`, waits for Mongo to answer a ping, then
runs `db:setup` and `db:seed`. Idempotent — safe to rerun. After it finishes,
`pnpm dev` (or `pnpm docker:up`) gives you a working stack signed in as
`admin@lacocinadekai.com` / `admin123`.

## `pnpm dev` (Docker Mongo)

Backend on `:4000`, frontend on `:3000`. Uses `MONGO_URI` from `.env`
(default `mongodb://localhost:27017/kaipos`, served by the `mongo` container
from `pnpm docker:up`). The backend refuses `mongodb+srv://` URIs at
startup — Atlas is reserved for Lambda in AWS prod, reached via Secrets
Manager. Vite proxies `/api` to the local backend.

## `pnpm docker:up` (containerized + local Mongo + MinIO)

Backend on `:4001`, frontend admin on `:3001`. Compose file at `docker-compose.yml`.

The POS app runs on `:3002` under `/pos/` (Vite `base`), so `pnpm dev` serves it
at <http://localhost:3002/pos/>. Its service worker only exists in a build —
use `pnpm --filter @kaipos/frontend-pos build && … preview` to exercise the PWA.

## `pnpm e2e` (Cypress)

Headless Cypress run against the URL in `CYPRESS_BASE_URL` (default
`http://localhost:3000`). Equivalent to
`pnpm --filter @kaipos/e2e cy:run`. See `apps/e2e/README.md` for the
required env vars and the staging seed contract used by the role/tenant
suites.

### MinIO (local S3-compatible storage)

`pnpm docker:up` starts MinIO so product image uploads work locally. The backend only ever **presigns** PUT URLs — it never uploads itself — so the endpoint inside the container is `http://localhost:9000` and the browser on the host opens the signed URL directly.

- **S3 API:** `http://localhost:9000` (path-style; bucket in the URL path).
- **Console UI:** `http://localhost:9001` — login `kaipos` / `kaiposdev123`.
- **Bucket:** `kaipos-assets-dev`, created automatically by the `minio-init` one-shot service with `anonymous download` policy so `<img src>` works against the raw object URL.
- **Credentials:** root user passed via `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`; the backend reuses them through `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
- **Persistence:** stored in the `minio_data` Docker volume. Wipe with `docker compose down -v` for a clean bucket.

## Environment variables

- `MONGO_URI` — MongoDB connection string. Loaded from root `.env` for `pnpm dev`. **Must point at a local Mongo** — the backend rejects `mongodb+srv://` (Atlas) when `MONGO_SECRET_ARN` is unset. For Docker, set in `docker-compose.yml` (the `environment:` block overrides `.env`). **Not used in AWS prod.**
- `MONGO_SECRET_ARN` — ARN of the Secrets Manager secret holding the Atlas URI. Injected by CDK into the Lambda only in AWS prod. Never set locally. Its presence is also the "we're in Lambda" signal that bypasses the local anti-Atlas guard; `db:seed`/`db:seed-cypress` refuse to run when it's set.
- `JWT_SECRET` — HMAC secret for signing access tokens. Loaded from root `.env` in local dev and Docker. In AWS prod replaced by `JWT_SECRET_ARN` (Secrets Manager).
- `CLOUDFRONT_SECRET` — Shared secret for CloudFront origin verification. Injected by CDK into the Lambda in AWS prod. Not set locally (middleware skips the check).
- `ASSETS_BUCKET_NAME` — S3 bucket receiving pre-signed PUTs from `POST /api/products/upload-url` (keys scoped to `products/<branchId>/<uuid>.<ext>`). Injected by CDK from `AssetsStack` in AWS prod; set to `kaipos-assets-dev` in `docker-compose.yml`. If unset (e.g. `pnpm dev` without extra config), the upload endpoint returns 503 `ASSETS_NOT_CONFIGURED` instead of calling AWS. The presign accepts JPEG/PNG/WebP up to 10 MB (`MAX_UPLOAD_SIZE_BYTES` in `@kaipos/shared/schemas/products`); the admin compresses images client-side to WebP (~1 MB, 1600px) via `apps/frontend-admin/src/lib/upload-image.ts` before requesting the URL.
- `ASSETS_CDN_DOMAIN` — CloudFront domain fronting the assets bucket. Used to compute the `publicUrl` returned alongside the pre-signed URL. Injected by CDK in AWS prod; unset locally (the service falls back to the signed URL's host — `localhost:9000` in Docker, the S3 hostname otherwise).
- `S3_ENDPOINT` — Custom S3 API endpoint. When set, the backend's S3 client uses it with `forcePathStyle: true` (needed for MinIO). Set to `http://localhost:9000` in `docker-compose.yml`. Unset in AWS prod (SDK uses the default AWS endpoint).
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` — Standard AWS SDK credentials. In Docker these point at MinIO (`kaipos` / `kaiposdev123` / `us-east-1`). In AWS prod they come from the Lambda execution role (IAM), not env vars.

Root `.env` is loaded by the backend dev script using `DOTENV_CONFIG_PATH=../../.env`. In Docker, the same `.env` is loaded via Compose's `env_file:` directive on the backend service.

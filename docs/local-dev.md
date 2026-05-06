# Local development

Two ways to run locally — both load `.env` from the repo root.

## `pnpm dev` (Atlas / external Mongo)

Backend on `:4000`, frontend on `:3000`. Uses `MONGO_URI` from `.env`. Vite proxies `/api` to the local backend.

## `pnpm docker:up` (containerized + local Mongo + MinIO)

Backend on `:4001`, frontend on `:3001`. Compose file at `docker-compose.yml`.

### MinIO (local S3-compatible storage)

`pnpm docker:up` starts MinIO so product image uploads work locally. The backend only ever **presigns** PUT URLs — it never uploads itself — so the endpoint inside the container is `http://localhost:9000` and the browser on the host opens the signed URL directly.

- **S3 API:** `http://localhost:9000` (path-style; bucket in the URL path).
- **Console UI:** `http://localhost:9001` — login `kaipos` / `kaiposdev123`.
- **Bucket:** `kaipos-assets-dev`, created automatically by the `minio-init` one-shot service with `anonymous download` policy so `<img src>` works against the raw object URL.
- **Credentials:** root user passed via `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`; the backend reuses them through `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
- **Persistence:** stored in the `minio_data` Docker volume. Wipe with `docker compose down -v` for a clean bucket.

## Environment variables

- `MONGO_URI` — MongoDB connection string. Loaded from root `.env` for `pnpm dev`. For Docker, set in `docker-compose.yml` (the `environment:` block overrides `.env`). **Not used in AWS prod.**
- `MONGO_SECRET_ARN` — ARN of the Secrets Manager secret holding the Atlas URI. Injected by CDK into the Lambda only in AWS prod. Never set locally. Also used as a signal by `db:seed` to refuse execution.
- `JWT_SECRET` — HMAC secret for signing access tokens. Loaded from root `.env` in local dev and Docker. In AWS prod replaced by `JWT_SECRET_ARN` (Secrets Manager).
- `CLOUDFRONT_SECRET` — Shared secret for CloudFront origin verification. Injected by CDK into the Lambda in AWS prod. Not set locally (middleware skips the check).
- `ASSETS_BUCKET_NAME` — S3 bucket receiving pre-signed PUTs from `POST /api/products/upload-url` (keys scoped to `products/<branchId>/<uuid>.<ext>`). Injected by CDK from `AssetsStack` in AWS prod; set to `kaipos-assets-dev` in `docker-compose.yml`. If unset (e.g. `pnpm dev` without extra config), the upload endpoint returns 503 `ASSETS_NOT_CONFIGURED` instead of calling AWS.
- `ASSETS_CDN_DOMAIN` — CloudFront domain fronting the assets bucket. Used to compute the `publicUrl` returned alongside the pre-signed URL. Injected by CDK in AWS prod; unset locally (the service falls back to the signed URL's host — `localhost:9000` in Docker, the S3 hostname otherwise).
- `S3_ENDPOINT` — Custom S3 API endpoint. When set, the backend's S3 client uses it with `forcePathStyle: true` (needed for MinIO). Set to `http://localhost:9000` in `docker-compose.yml`. Unset in AWS prod (SDK uses the default AWS endpoint).
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` — Standard AWS SDK credentials. In Docker these point at MinIO (`kaipos` / `kaiposdev123` / `us-east-1`). In AWS prod they come from the Lambda execution role (IAM), not env vars.

Root `.env` is loaded by the backend dev script using `DOTENV_CONFIG_PATH=../../.env`. In Docker, the same `.env` is loaded via Compose's `env_file:` directive on the backend service.

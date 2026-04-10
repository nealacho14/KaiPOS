# KaiPOS Infrastructure

This document explains the AWS infrastructure that hosts the production
deployment of KaiPOS: what exists, why it exists, how the pieces fit
together, and what the trade-offs are.

Complementary docs:

- [`infra/DEPLOYMENT.md`](../infra/DEPLOYMENT.md) — step-by-step deployment
  runbook (bootstrap, secret, allowlist, verify, rollback).
- [`README.md`](../README.md) — repo overview and local development.
- [`CLAUDE.md`](../CLAUDE.md) — guidance for AI agents working in the repo.

---

## Environments

KaiPOS has two "environments", but only one of them lives in AWS.

| Environment     | Where it runs   | How to start it                | Purpose                                                                                               |
| --------------- | --------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **dev (local)** | Your laptop     | `pnpm dev` or `pnpm docker:up` | Day-to-day development. Uses MongoDB Atlas via `.env` (pnpm dev) or a local Mongo container (Docker). |
| **prod (AWS)**  | AWS `us-east-1` | `pnpm deploy:prod`             | The deployed public application. Uses MongoDB Atlas with the URI stored in AWS Secrets Manager.       |

There is **no staging environment** and no VPC. This is a deliberate
simplification to keep the monthly cost under $1 USD and the mental model
small. Adding stages or a VPC later is additive — none of the current stacks
would need to be rewritten.

---

## High-level diagram

```
                              Internet
                                 │
                                 ▼
        ┌────────────────────────────────────────────┐
        │  CloudFront distribution                   │
        │  d2ox9z3gewx7lu.cloudfront.net             │
        │                                            │
        │  default behavior  →  S3 (SPA)             │
        │  /api/*            →  API Gateway          │
        └────────────────────────────────────────────┘
                 │                       │
                 ▼                       ▼
        ┌──────────────────┐    ┌─────────────────────┐
        │ S3: frontend     │    │ API Gateway HTTP    │
        │ kaipos-frontend- │    │ (no CORS, public)   │
        │ prod             │    └──────────┬──────────┘
        │ (private, OAI)   │               │
        └──────────────────┘               ▼
                                 ┌──────────────────────┐
                                 │ Lambda               │
                                 │ kaipos-prod-api-     │
                                 │ HealthFunction       │
                                 │                      │
                                 │ Node.js 20, no VPC   │
                                 │ logRetention: 30d    │
                                 └──────────┬───────────┘
                                            │
                           ┌────────────────┼────────────────┐
                           ▼                ▼                ▼
                  ┌────────────────┐ ┌────────────┐ ┌──────────────────┐
                  │ Secrets Manager│ │ S3: assets │ │ MongoDB Atlas    │
                  │ kaipos/prod/   │ │ kaipos-    │ │ (external to AWS)│
                  │ mongo-uri      │ │ assets-prod│ │                  │
                  │                │ │ (private,  │ │ IP allowlist:    │
                  │ (KMS encrypted)│ │  versioned)│ │ 0.0.0.0/0        │
                  └────────────────┘ └────────────┘ └──────────────────┘
```

---

## The four CDK stacks

All four live in `infra/lib/`, are instantiated by `infra/bin/infra.ts`,
and share a `StageConfig` from `infra/lib/config.ts`. Every stack is
prefixed `kaipos-prod-*`.

### 1. `kaipos-prod-secrets` — `infra/lib/secrets-stack.ts`

Creates a single AWS Secrets Manager secret:

- **Name**: `kaipos/prod/mongo-uri`
- **Content**: the MongoDB Atlas connection string (set out-of-band with
  `aws secretsmanager put-secret-value`).
- **Encryption**: AWS-managed KMS key (free).
- **Removal policy**: `RETAIN` — destroying the stack does **not** delete
  the secret.

Why it exists: so the Atlas URI never appears in source, in environment
variables, or in CloudFormation templates. The Lambda reads it at cold
start via IAM. Rotating the password means updating this secret; no
redeploy is required.

Exports: `mongoSecret: ISecret` (consumed by `ApiStack`).

### 2. `kaipos-prod-assets` — `infra/lib/assets-stack.ts`

A single private S3 bucket for user/app assets:

- **Name**: `kaipos-assets-prod`
- **Access**: `BlockPublicAccess.BLOCK_ALL` — no public URLs, no ACLs.
- **Encryption**: `S3_MANAGED` (SSE-S3).
- **Versioning**: enabled.
- **TLS**: `enforceSSL: true` — rejects plain HTTP requests.
- **Removal policy**: `RETAIN`.

Why it exists: the SPA and the backend need a place to store files
(receipts, product images, exports) that isn't the database. Nothing
uses it yet, but the Lambda already has `grantReadWrite` on it.

Exports: `assetsBucket: IBucket` (consumed by `ApiStack`).

### 3. `kaipos-prod-api` — `infra/lib/api-stack.ts`

The backend: an API Gateway HTTP API in front of one Lambda (today just
`/api/health`; more to come).

Lambda:

- **Runtime**: Node.js 20.
- **Memory**: 1024 MB (from `config.lambdaMemory`).
- **Timeout**: 30s.
- **Code**: `apps/backend/dist/health.js` (bundled by tsup; see
  [Backend bundling](#backend-bundling) below).
- **No VPC**. Egress goes directly to the internet (and thus to Atlas).
- **Log retention**: 30 days (`RetentionDays.ONE_MONTH`).
- **Environment**:
  - `NODE_ENV=prod`
  - `MONGO_SECRET_ARN=<secret arn>` (the Lambda uses this to resolve the
    URI at cold start; the URI itself never lives here)
  - `ASSETS_BUCKET_NAME=kaipos-assets-prod`
- **IAM grants**: `secretsmanager:GetSecretValue` on the Mongo secret,
  `s3:GetObject`/`s3:PutObject` on the assets bucket.

API Gateway:

- **Type**: HTTP API (v2) — cheaper and simpler than REST API.
- **CORS**: **none**. The SPA reaches the API through CloudFront
  (same-origin), so no preflight is ever needed. The raw API Gateway URL
  is still technically reachable from anywhere, but no browser code uses
  it.
- **Routes**: `GET /api/health` → `HealthFunction`.

Exports: `httpApi: HttpApi` (consumed by `FrontendStack` to build the
`/api/*` proxy behavior).

### 4. `kaipos-prod-frontend` — `infra/lib/frontend-stack.ts`

S3 + CloudFront serving the React SPA, with a second behavior that proxies
`/api/*` to the API Gateway.

S3 bucket (`kaipos-frontend-prod`):

- `BlockPublicAccess.BLOCK_ALL`, SSE-S3, `enforceSSL`, `RETAIN`.
- Access via a CloudFront Origin Access Identity (OAI) — the bucket is
  not reachable directly; only CloudFront can read it.

CloudFront distribution:

- **Price class**: `PRICE_CLASS_100` (US, Canada, Europe) — cheapest tier
  that covers the expected audience.
- **Default behavior** → S3 bucket via OAI, cache policy
  `CACHING_OPTIMIZED`, HTTPS only, SPA fallback (404 → `/index.html`
  with HTTP 200) for client-side routing.
- **`/api/*` behavior** → `HttpOrigin` targeting
  `<apiId>.execute-api.us-east-1.amazonaws.com`:
  - `CACHING_DISABLED` (APIs aren't cacheable).
  - `ALL_VIEWER_EXCEPT_HOST_HEADER` origin request policy (forwards
    everything except `Host`, which API Gateway rejects if it doesn't
    match its own domain).
  - `ALLOW_ALL` methods (GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD).
- **Frontend deployment**: `BucketDeployment` uploads
  `apps/frontend-admin/dist/` into the S3 bucket at deploy time and
  automatically invalidates CloudFront (`/*`).

The `CloudFront → API Gateway` wiring is the reason the SPA can use
relative `fetch("/api/health")` in both dev (Vite proxy) and prod
(CloudFront behavior) with the exact same code.

---

## Request flow (production)

1. **User opens `https://d2ox9z3gewx7lu.cloudfront.net/`** in a browser.
   CloudFront serves `index.html` + JS from the S3 origin. React mounts.
2. **The SPA calls `fetch("/api/health")`** — a **relative** URL.
3. CloudFront matches the `/api/*` behavior, forwards the request to
   `ksbfoj0u90.execute-api.us-east-1.amazonaws.com/api/health` over
   HTTPS, stripping the `Host` header.
4. API Gateway routes `GET /api/health` to the Lambda.
5. **Cold start only** — the Lambda runtime loads `health.js`. The bundle
   includes `mongodb`, `@kaipos/shared`, and the Secrets Manager client.
   The first call to `getClient()` fetches the URI from Secrets Manager,
   caches it in module scope, then opens a MongoDB connection pool to
   Atlas and reuses it across invocations.
6. The handler runs `db.command({ ping: 1 })` against Atlas and returns
   a JSON response.
7. API Gateway proxies the response back through CloudFront to the
   browser. No CORS headers are involved because the whole round trip
   is same-origin.

Subsequent requests skip steps 5 and most of step 6 — the Lambda
instance is reused and the Mongo pool stays warm.

---

## Security posture

What's protected, what isn't, and what the trade-offs are.

### ✅ Secrets never leave Secrets Manager

- `MONGO_URI` only exists in `kaipos/prod/mongo-uri`, encrypted with an
  AWS-managed KMS key.
- CloudFormation templates contain only the secret's ARN, never the
  value. We verified this at synth time with a grep for `mongodb+srv`
  in `infra/cdk.out/`.
- The Lambda reads the secret at cold start via IAM (`GetSecretValue`);
  no other principal in the account has that grant.
- To rotate: update the secret, next cold start picks it up.

### ✅ S3 buckets are fully private

- `kaipos-frontend-prod` is only readable by the CloudFront OAI.
- `kaipos-assets-prod` is only readable/writable by the Lambda's IAM role.
- Both buckets have `BlockPublicAccess.BLOCK_ALL`, SSE-S3 encryption,
  and `enforceSSL: true` (plain HTTP is rejected).

### ✅ Git hygiene

- `.gitignore` excludes `.env` and `.env.*` (only `.env.example` is
  tracked). No real Atlas URI has ever been committed.
- `cdk.context.json` is regenerated by CDK on demand and should not be
  manually edited.

### ⚠️ Atlas IP allowlist is `0.0.0.0/0`

The Lambda has no static outbound IP (it runs outside a VPC, in AWS's
shared Lambda IP pool). To keep the Lambda reachable to Atlas without
paying for a NAT Gateway, the allowlist is fully open. Security of the
database therefore depends entirely on:

- The strength of the Atlas database user password (long, generated,
  stored only in Secrets Manager).
- The fact that the password never appears anywhere outside Secrets
  Manager (not in source, not in env vars, not in logs).

**Mitigation path if this becomes unacceptable:** introduce a VPC with a
NAT Gateway (cost +$33/month) and tighten the Atlas allowlist to that
NAT's EIP. Or use MongoDB Atlas PrivateLink (requires an Atlas M10+
cluster). Both are strictly additive — no code would change, only the
`infra/lib/` stacks.

### ⚠️ API Gateway URL is publicly reachable

`https://ksbfoj0u90.execute-api.us-east-1.amazonaws.com/api/health`
works from anywhere. The browser never sees it (the SPA only uses
relative URLs), but anyone who guesses or discovers the URL can hit it
directly.

Today this is fine because `/api/health` doesn't return sensitive data.
**Before adding any endpoint that does**, add one of:

1. A shared-secret header in the CloudFront `/api/*` behavior
   (`customOriginHeaders`) that the Lambda validates on every request.
   Zero extra cost, ~10 lines of code.
2. Proper request authentication — JWT via Cognito, Clerk, Auth0, or a
   custom Lambda authorizer.

### ⚠️ IAM user with `AdministratorAccess`

The `kaipos-deployer` IAM user has full admin to deploy with CDK.
Mitigations:

- Access keys live only on the developer's machine
  (`~/.aws/credentials`), never in git.
- MFA is enabled on the root account.
- Eventual fix: migrate to IAM Identity Center (AWS SSO) or shrink the
  policy to what CDK actually needs.

---

## Cost breakdown

Expected monthly cost at low traffic (hobby / POC usage), region
`us-east-1`:

| Resource                       | Cost      | Notes                                             |
| ------------------------------ | --------- | ------------------------------------------------- |
| Lambda                         | $0        | 1M requests + 400k GB-seconds/month free forever. |
| API Gateway HTTP API           | $0        | 1M requests/month free in year 1; $1/M after.     |
| S3 (frontend + assets)         | ~$0.01    | A few hundred KB total.                           |
| CloudFront (`PRICE_CLASS_100`) | $0        | 1 TB/month + 10M requests/month free.             |
| Secrets Manager                | **$0.40** | Fixed: $0.40/secret/month. Only fixed cost.       |
| CloudWatch Logs                | ~$0.10    | Low volume + 30-day retention.                    |
| KMS (AWS-managed keys)         | $0        | AWS-managed keys are free.                        |
| VPC / NAT Gateway              | $0        | **Not provisioned.**                              |
| Route 53 / ACM                 | $0        | Not configured (placeholder in `config.ts`).      |

**Total: ~$0.50 – $1.00 USD per month** while inside the free tier.

Costs that would grow: CloudFront egress (past 1 TB/mo), S3 storage
(past a few GB of assets), CloudWatch Logs ingest (if logging becomes
verbose), and Atlas (M0 is free; M10 is ~$57/mo and billed separately).

**MongoDB Atlas is billed outside AWS.** KaiPOS currently uses the free
M0 tier, so Atlas also costs $0.

To catch runaway costs early, create a budget alert in AWS Billing →
Budgets for ~$5/month.

---

## Backend bundling

The Lambda runs ESM code bundled by `tsup` (see
`apps/backend/tsup.config.ts`). A few details matter:

1. **Output format**: `esm` — matches Node 20's module system.
2. **`noExternal: [/^(?!@aws-sdk\/).*/]`** — bundles everything
   (including `@kaipos/shared` and `mongodb`) into the Lambda zip, but
   leaves `@aws-sdk/*` external because the Node 20 Lambda runtime
   provides it.
3. **`dist/package.json` emit**: a post-build `node -e ...` step writes
   `{"type":"module"}` into `dist/` so Lambda treats `health.js` as ESM.
   Without this, Lambda assumes CJS and crashes on the first `import`.
4. **`createRequire` banner**: `mongodb` uses `require("timers")` for
   some internals. When bundled as ESM, esbuild can't resolve dynamic
   `require` calls. The banner injects
   `const require = createRequire(import.meta.url)` at the top of the
   bundle, which makes the dynamic requires work again.

These four points together are why the Lambda finally boots and why
any new Lambda added to this repo should copy the same `tsup.config.ts`.

---

## Local development vs AWS prod

The backend is designed so the **same code path** works in both modes,
with the only difference being where the Mongo URI comes from.

`apps/backend/src/db/client.ts`:

```ts
if (process.env.MONGO_SECRET_ARN) {
  // AWS prod: read from Secrets Manager
  uri = await secretsManager.send(new GetSecretValueCommand(...));
} else {
  // Local dev: read from .env / docker-compose
  uri = process.env.MONGO_URI || "mongodb://localhost:27017/kaipos";
}
```

The frontend uses the same trick with a different mechanism: a relative
`fetch("/api/health")` works in both modes because:

- **Local (`pnpm dev`)**: Vite's dev server proxies `/api` to the
  backend at `localhost:4000`.
- **Local (Docker)**: the Vite dev server inside the frontend container
  proxies `/api` to `http://backend:4001` (configured via `VITE_API_URL`
  in `docker-compose.yml`).
- **AWS prod**: CloudFront proxies `/api/*` to API Gateway via an
  additional behavior.

No build-time environment variables are needed to target AWS. The prod
bundle is identical to the dev bundle.

---

## How to change things

Common changes and how to apply them safely:

### Rotate the Mongo password

```bash
# Update in Atlas, then:
aws secretsmanager put-secret-value \
  --secret-id kaipos/prod/mongo-uri \
  --secret-string '<new uri>'
# Next Lambda cold start uses it. No redeploy.
```

### Add a new Lambda function

1. Create `apps/backend/src/functions/<name>.ts`.
2. `pnpm --filter @kaipos/backend build` will pick it up automatically
   (tsup uses `src/functions/**/*.ts` as entry).
3. In `infra/lib/api-stack.ts`, add a new `lambda.Function` construct
   and `httpApi.addRoutes({ path: "/api/<name>", ... })`.
4. `pnpm deploy:prod:api`.

### Add a new CloudFront path pattern

Edit `additionalBehaviors` in `infra/lib/frontend-stack.ts`.
Deploy with `pnpm deploy:prod:frontend`. CloudFront propagation takes a
few minutes.

### Tear everything down

```bash
pnpm --filter @kaipos/infra destroy:prod
```

The buckets and the secret have `RETAIN` removal policies, so they
survive. Delete them manually in the console if you really want a
clean slate.

---

## Open questions / future work

- **Shared-secret header** for CloudFront → API Gateway before adding
  endpoints with real data.
- **Real auth** (Cognito / Clerk / Auth0) before multi-user features.
- **Route 53 + ACM custom domain** — the slot exists in
  `config.ts` (`domainName?: string`), just never wired.
- **Atlas PrivateLink or VPC + NAT** if `0.0.0.0/0` becomes
  unacceptable.
- **CI/CD** (GitHub Actions) that runs `pnpm deploy:prod` on pushes to
  `main`. Today deploys are manual from a developer's machine.
- **Budget alert** in AWS Billing.

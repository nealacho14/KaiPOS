# KaiPOS Infrastructure Deployment

Single AWS environment: **`prod`**. Local development (`dev`) runs via `pnpm dev` or
`pnpm docker:up` at the repo root and does **not** use this CDK stack.

## Stacks

- `kaipos-prod-secrets` — Secrets Manager secret `kaipos/prod/mongo-uri` (empty on create, populated out-of-band).
- `kaipos-prod-assets` — Private versioned S3 bucket `kaipos-assets-prod`.
- `kaipos-prod-api` — API Gateway HTTP API + Lambda for backend functions. Lambda runs **outside any VPC** and connects to MongoDB Atlas directly over the public internet (protected by Atlas IP allowlist). This keeps monthly cost near zero by avoiding a NAT Gateway (~$33/month).
- `kaipos-prod-frontend` — S3 + CloudFront for the admin SPA.

## Prerequisites

- AWS CLI v2 configured with credentials for the target account.
- `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` (or AWS profile) in the environment.
- Node.js 20, pnpm installed.
- A MongoDB Atlas cluster for prod (connection string ready).

## First-time setup

1. **Install and build**
   ```bash
   pnpm install
   pnpm --filter @kaipos/backend build
   pnpm --filter @kaipos/frontend-admin build
   ```

2. **CDK bootstrap (once per account/region)**
   ```bash
   pnpm --filter @kaipos/infra cdk bootstrap
   ```

3. **Synth and review**
   ```bash
   pnpm --filter @kaipos/infra synth:prod
   ```
   Sanity-check: the generated template under `infra/cdk.out/` must **not** contain the
   Atlas connection string. Only `MONGO_SECRET_ARN` should appear.

4. **Deploy**
   ```bash
   pnpm --filter @kaipos/infra deploy:prod
   ```
   Note the outputs: `ApiUrl`, `DistributionUrl`, `MongoSecretArn`, `VpcId`, `AssetsBucketName`.

5. **Populate the Mongo secret**
   The secret is created empty so the Atlas URI never touches source or CloudFormation.
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id kaipos/prod/mongo-uri \
     --secret-string 'mongodb+srv://USER:PASS@CLUSTER/DB?retryWrites=true&w=majority'
   ```

6. **Allowlist Lambda egress in Atlas**
   Lambda outside a VPC uses AWS's shared public IP pool, so a single static IP
   is not available. Options:
   - **Quickest:** allow `0.0.0.0/0` in Atlas and rely on the Atlas DB user
     credentials (stored in the Secrets Manager URI) as the only access control.
   - **More restrictive:** allow the [AWS us-east-1 Lambda IP ranges](https://docs.aws.amazon.com/vpc/latest/userguide/aws-ip-ranges.html)
     (updated periodically).
   - **Most restrictive (costs money):** re-introduce a VPC + NAT Gateway or use
     Atlas PrivateLink. See "Next steps" below.

## Verify

```bash
curl "$(aws cloudformation describe-stacks --stack-name kaipos-prod-api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)api/health"
```
Expect HTTP 200 with `"database": "connected"`.

## Redeploy

```bash
pnpm --filter @kaipos/backend build
pnpm --filter @kaipos/frontend-admin build
pnpm --filter @kaipos/infra diff:prod   # review
pnpm --filter @kaipos/infra deploy:prod
```

## Rotate the Mongo secret

```bash
aws secretsmanager put-secret-value \
  --secret-id kaipos/prod/mongo-uri \
  --secret-string '<new-uri>'
```
Next Lambda cold start picks it up. To force immediately, update the function env or
redeploy.

## Rollback

- **Application rollback:** redeploy the previous git commit.
- **Full teardown (destructive):**
  ```bash
  pnpm --filter @kaipos/infra destroy:prod
  ```
  Note: `removalPolicy = RETAIN` on the buckets and secret; destroy will leave them
  behind on purpose. Delete them manually if you truly want a clean slate.

## Next steps (not in scope for KAI-2)

- Route53 hosted zone + ACM cert → wire `config.domainName` and CloudFront/API aliases.
- VPC + NAT Gateway (or Atlas PrivateLink) to pin Lambda egress to a fixed IP
  once cost is less important than tighter network isolation.
- CI/CD pipeline for auto-deploy on merge to `main`.

#!/usr/bin/env bash
# Two-phase prod deploy.
#
# The frontend needs the `wss://...` URL of the WebSocket API baked into its
# bundle at build time (Vite embeds `VITE_WS_ENDPOINT` into the JS). The URL
# only exists *after* `kaipos-prod-websocket` is deployed, so we deploy
# everything except the frontend first, then read the stack output, then
# rebuild + deploy the frontend.
#
# Requires the AWS CLI on PATH (CI provides it; local callers need it too).

set -euo pipefail

STAGE="prod"
WS_STACK="kaipos-${STAGE}-websocket"
WS_OUTPUT_KEY="WebSocketEndpoint"

echo "==> Phase 1/2: backend build + backend-side stacks"
pnpm --filter @kaipos/backend build

# Deploying `kaipos-prod-api` also deploys its deps (secrets, assets,
# websocket) via CDK's implicit dependency resolution. `kaipos-prod-github-oidc`
# isn't a dep so include it explicitly.
pnpm --filter @kaipos/infra cdk deploy \
  kaipos-${STAGE}-github-oidc \
  kaipos-${STAGE}-api \
  -c stage=${STAGE} \
  --require-approval never

echo "==> Reading ${WS_OUTPUT_KEY} from ${WS_STACK}"
VITE_WS_ENDPOINT="$(aws cloudformation describe-stacks \
  --stack-name "${WS_STACK}" \
  --query "Stacks[0].Outputs[?OutputKey=='${WS_OUTPUT_KEY}'].OutputValue" \
  --output text)"

if [[ -z "${VITE_WS_ENDPOINT}" || "${VITE_WS_ENDPOINT}" == "None" ]]; then
  echo "ERROR: ${WS_OUTPUT_KEY} not found in ${WS_STACK} outputs" >&2
  exit 1
fi

echo "    VITE_WS_ENDPOINT=${VITE_WS_ENDPOINT}"

echo "==> Phase 2/2: frontend build (with WS endpoint) + frontend stack"
VITE_WS_ENDPOINT="${VITE_WS_ENDPOINT}" pnpm --filter @kaipos/frontend-admin build
pnpm --filter @kaipos/infra cdk deploy \
  kaipos-${STAGE}-frontend \
  -c stage=${STAGE} \
  --require-approval never

echo "==> Deploy complete."

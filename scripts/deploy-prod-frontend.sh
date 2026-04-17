#!/usr/bin/env bash
# Frontend-only deploy. Reads the WS endpoint from CloudFormation so the Vite
# build embeds `VITE_WS_ENDPOINT` into the bundle — skip this step and the
# debug page (#/debug/ws) starts with an empty endpoint field.

set -euo pipefail

STAGE="prod"
WS_STACK="kaipos-${STAGE}-websocket"
WS_OUTPUT_KEY="WebSocketEndpoint"

echo "==> Reading ${WS_OUTPUT_KEY} from ${WS_STACK}"
VITE_WS_ENDPOINT="$(aws cloudformation describe-stacks \
  --stack-name "${WS_STACK}" \
  --query "Stacks[0].Outputs[?OutputKey=='${WS_OUTPUT_KEY}'].OutputValue" \
  --output text)"

if [[ -z "${VITE_WS_ENDPOINT}" || "${VITE_WS_ENDPOINT}" == "None" ]]; then
  echo "ERROR: ${WS_OUTPUT_KEY} not found in ${WS_STACK} outputs. Deploy the websocket stack first." >&2
  exit 1
fi

echo "    VITE_WS_ENDPOINT=${VITE_WS_ENDPOINT}"

VITE_WS_ENDPOINT="${VITE_WS_ENDPOINT}" pnpm --filter @kaipos/frontend-admin build
pnpm --filter @kaipos/infra cdk deploy \
  kaipos-${STAGE}-frontend \
  -c stage=${STAGE} \
  --require-approval never

echo "==> Frontend deploy complete."

import * as cdk from 'aws-cdk-lib';

export type Stage = 'prod';

export interface StageConfig {
  stage: Stage;
  /** Memory (MB) for the HTTP API Lambda (Hono + Mongo + SES). */
  lambdaMemoryApi: number;
  /** Memory (MB) for ws-connect — JWT verify + DDB BatchWrite. */
  lambdaMemoryWsConnect: number;
  /** Memory (MB) for ws-disconnect — DDB Query + BatchWrite delete only. */
  lambdaMemoryWsDisconnect: number;
  /** Memory (MB) for ws-default — DDB + PostToConnection. */
  lambdaMemoryWsDefault: number;
  /**
   * WebSocket stage throttling (requests/second + burst), applied to all
   * routes ($connect/$disconnect/$default). Hard cap on WS Lambda invocations
   * so a client-side loop cannot run away with cost or starve the HTTP API
   * of account concurrency (2026-05-06 incident: one looping tab drove
   * ~6,000 ws-default invocations/min and 503'd the HTTP API).
   */
  wsThrottleRateLimit: number;
  wsThrottleBurstLimit: number;
  /** Reserved concurrency for ws-connect — also an upper bound on parallel handshakes. */
  lambdaConcurrencyWsConnect: number;
  /** Reserved concurrency for ws-disconnect. */
  lambdaConcurrencyWsDisconnect: number;
  /** Reserved concurrency for ws-default — bounds subscribe/ping fan-in. */
  lambdaConcurrencyWsDefault: number;
  removalPolicy: cdk.RemovalPolicy;
  autoDeleteObjects: boolean;
  domainName?: string;
  /** Shared secret for CloudFront → API Gateway origin verification. */
  cloudfrontSecret: string;
  /** Verified SES sender email for transactional emails (password reset, etc.). */
  sesSenderEmail: string;
  /** Base URL for password reset links (frontend URL). */
  passwordResetBaseUrl: string;
  /** Email subscribed to the SNS alerts topic. */
  alertsEmail: string;
}

export function getStageConfig(rawStage: string | undefined): StageConfig {
  if (rawStage !== 'prod') {
    throw new Error(
      `Invalid stage "${rawStage ?? ''}". Only "prod" is supported in AWS IaC. ` +
        `Local development runs via "pnpm dev" or "pnpm docker:up".`,
    );
  }

  return {
    stage: 'prod',
    // Sized per-function: api carries DB + business logic; ws-* are
    // thin DDB/PostToConnection handlers and don't need 1 GB.
    lambdaMemoryApi: 1024,
    lambdaMemoryWsConnect: 512,
    lambdaMemoryWsDisconnect: 256,
    lambdaMemoryWsDefault: 512,
    // Legit peak with <10 users (full reconnect storm after a deploy) is
    // ~10 connects + ~30 subscribes within a couple of seconds; steady state
    // is <1 rps. The incident ran at ~100 rps from a single tab.
    wsThrottleRateLimit: 20,
    wsThrottleBurstLimit: 50,
    // At 20 rps and ~100 ms handler duration the real WS concurrency is ~2;
    // these reservations cap worst-case spend and guarantee WS traffic can
    // never exhaust the account pool the api Lambda draws from.
    lambdaConcurrencyWsConnect: 5,
    lambdaConcurrencyWsDisconnect: 2,
    lambdaConcurrencyWsDefault: 5,
    removalPolicy: cdk.RemovalPolicy.RETAIN,
    autoDeleteObjects: false,
    // Placeholder — set when Route53 hosted zone + ACM cert are ready.
    domainName: undefined,
    // Shared secret attached by CloudFront as a custom origin header and verified
    // by the Lambda middleware. Not a credential — just prevents direct API Gateway
    // access bypassing CloudFront. Rotate by changing this value and redeploying.
    cloudfrontSecret: 'kaipos-cf-origin-a7f3e9b1c4d2',
    sesSenderEmail: 'noreply@kaipos.com',
    // Placeholder — update when a custom domain is configured for the frontend.
    passwordResetBaseUrl: 'https://kaipos.com',
    alertsEmail: 'kelvin.hernandezc30@gmail.com',
  };
}

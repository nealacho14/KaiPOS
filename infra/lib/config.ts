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

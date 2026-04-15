import * as cdk from 'aws-cdk-lib';

export type Stage = 'prod';

export interface StageConfig {
  stage: Stage;
  lambdaMemory: number;
  removalPolicy: cdk.RemovalPolicy;
  autoDeleteObjects: boolean;
  domainName?: string;
  /** Shared secret for CloudFront → API Gateway origin verification. */
  cloudfrontSecret: string;
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
    lambdaMemory: 1024,
    removalPolicy: cdk.RemovalPolicy.RETAIN,
    autoDeleteObjects: false,
    // Placeholder — set when Route53 hosted zone + ACM cert are ready.
    domainName: undefined,
    // Shared secret attached by CloudFront as a custom origin header and verified
    // by the Lambda middleware. Not a credential — just prevents direct API Gateway
    // access bypassing CloudFront. Rotate by changing this value and redeploying.
    cloudfrontSecret: 'kaipos-cf-origin-a7f3e9b1c4d2',
  };
}

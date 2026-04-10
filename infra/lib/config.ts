import * as cdk from 'aws-cdk-lib';

export type Stage = 'prod';

export interface StageConfig {
  stage: Stage;
  lambdaMemory: number;
  removalPolicy: cdk.RemovalPolicy;
  autoDeleteObjects: boolean;
  domainName?: string;
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
  };
}

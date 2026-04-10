import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { StageConfig } from './config.js';

interface AssetsStackProps extends cdk.StackProps {
  config: StageConfig;
}

export class AssetsStack extends cdk.Stack {
  readonly assetsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: AssetsStackProps) {
    super(scope, id, props);

    const { config } = props;

    this.assetsBucket = new s3.Bucket(this, 'AssetsBucket', {
      bucketName: `kaipos-assets-${config.stage}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: config.removalPolicy,
      autoDeleteObjects: config.autoDeleteObjects,
      enforceSSL: true,
    });

    new cdk.CfnOutput(this, 'AssetsBucketName', { value: this.assetsBucket.bucketName });
  }
}

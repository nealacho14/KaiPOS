import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { StageConfig } from './config.js';

interface ApiStackProps extends cdk.StackProps {
  config: StageConfig;
  mongoSecret: secretsmanager.ISecret;
  jwtSecret: secretsmanager.ISecret;
  assetsBucket: s3.IBucket;
}

export class ApiStack extends cdk.Stack {
  readonly httpApi: apigw.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config, mongoSecret, jwtSecret, assetsBucket } = props;

    // Lambda runs outside any VPC and reaches MongoDB Atlas directly over the
    // public internet. Atlas access is restricted via its own IP allowlist.
    // This avoids NAT Gateway costs (~$33/month fixed).
    const apiFunction = new lambda.Function(this, 'ApiFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'api.handler',
      code: lambda.Code.fromAsset('../apps/backend/dist'),
      memorySize: config.lambdaMemory,
      timeout: cdk.Duration.seconds(30),
      // Bound log cost and limit exposure of any data that lands in logs.
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        NODE_ENV: config.stage,
        MONGO_SECRET_ARN: mongoSecret.secretArn,
        JWT_SECRET_ARN: jwtSecret.secretArn,
        ASSETS_BUCKET_NAME: assetsBucket.bucketName,
        CLOUDFRONT_SECRET: config.cloudfrontSecret,
      },
    });

    mongoSecret.grantRead(apiFunction);
    jwtSecret.grantRead(apiFunction);
    assetsBucket.grantReadWrite(apiFunction);

    // No corsPreflight: the API is fronted by CloudFront (same origin as the
    // SPA), so browser requests never need CORS. The API Gateway URL is still
    // reachable directly, but the frontend never uses it.
    this.httpApi = new apigw.HttpApi(this, 'HttpApi', {
      apiName: `kaipos-api-${config.stage}`,
    });

    const apiIntegration = new integrations.HttpLambdaIntegration('ApiIntegration', apiFunction);

    this.httpApi.addRoutes({
      path: '/api/{proxy+}',
      methods: [apigw.HttpMethod.ANY],
      integration: apiIntegration,
    });

    this.httpApi.addRoutes({
      path: '/api',
      methods: [apigw.HttpMethod.ANY],
      integration: apiIntegration,
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.httpApi.url || '',
      description: 'API Gateway URL (direct; frontend should use CloudFront)',
    });
  }
}

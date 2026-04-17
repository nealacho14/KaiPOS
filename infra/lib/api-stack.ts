import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';
import type { StageConfig } from './config.js';

interface ApiStackProps extends cdk.StackProps {
  config: StageConfig;
  mongoSecret: secretsmanager.ISecret;
  jwtSecret: secretsmanager.ISecret;
  assetsBucket: s3.IBucket;
  webSocketStage: apigw.WebSocketStage;
  connectionsTable: dynamodb.ITable;
}

export class ApiStack extends cdk.Stack {
  readonly httpApi: apigw.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config, mongoSecret, jwtSecret, assetsBucket, webSocketStage, connectionsTable } =
      props;

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
        SES_SENDER_EMAIL: config.sesSenderEmail,
        PASSWORD_RESET_BASE_URL: config.passwordResetBaseUrl,
        WS_API_ENDPOINT: webSocketStage.callbackUrl,
        CONNECTIONS_TABLE_NAME: connectionsTable.tableName,
      },
    });

    mongoSecret.grantRead(apiFunction);
    jwtSecret.grantRead(apiFunction);
    assetsBucket.grantReadWrite(apiFunction);

    // Allow sending password-reset emails via SES
    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: ['*'],
      }),
    );

    // Publish real-time events to WebSocket clients. The API Lambda does not
    // accept WS traffic itself — it fan-outs by querying the connections table
    // (GSI1) and DM'ing each live connection via ManageConnections.
    webSocketStage.grantManagementApiAccess(apiFunction);

    // Narrow DDB grants: the API Lambda only needs to read the channel-index
    // and delete stale rows detected via GoneException — no writes.
    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:Query', 'dynamodb:DeleteItem'],
        resources: [connectionsTable.tableArn, `${connectionsTable.tableArn}/index/*`],
      }),
    );

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

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import type { StageConfig } from './config.js';

interface WebSocketStackProps extends cdk.StackProps {
  config: StageConfig;
  jwtSecret: secretsmanager.ISecret;
}

export class WebSocketStack extends cdk.Stack {
  readonly webSocketApi: apigw.WebSocketApi;
  readonly webSocketStage: apigw.WebSocketStage;
  readonly connectionsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: WebSocketStackProps) {
    super(scope, id, props);

    const { config, jwtSecret } = props;

    // Connections table. PK=connectionId, SK=channel so a single connection can
    // carry multiple rows (one per channel) and fan-out is a GSI query by channel.
    // TTL (2h, refreshed on each subscribe) purges orphaned rows from abrupt
    // disconnects that miss $disconnect.
    this.connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      tableName: `kaipos-ws-connections-${config.stage}`,
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'channel', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      // Connection state is ephemeral — fine to blow away with the stack.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Fan-out index: query all connections subscribed to a channel.
    this.connectionsTable.addGlobalSecondaryIndex({
      indexName: 'channel-index',
      partitionKey: { name: 'channel', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ['userId'],
    });

    // WS handlers don't use MongoDB — only the api Lambda does. They also
    // don't enforce the `x-origin-verify` shared secret: the WSS endpoint
    // bypasses CloudFront (clients connect directly to API Gateway) and
    // browsers cannot set custom headers on `new WebSocket(...)`, so there
    // is no code path that could deliver the header. Handshake security
    // relies on the signed JWT + TLS.
    const baseEnvironment: Record<string, string> = {
      NODE_ENV: config.stage,
      JWT_SECRET_ARN: jwtSecret.secretArn,
      CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
    };

    const lambdaCode = lambda.Code.fromAsset('../apps/backend/dist');

    const wsConnectFn = new lambda.Function(this, 'WsConnectFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'ws-connect.handler',
      code: lambdaCode,
      memorySize: config.lambdaMemory,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: { ...baseEnvironment },
    });

    const wsDisconnectFn = new lambda.Function(this, 'WsDisconnectFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'ws-disconnect.handler',
      code: lambdaCode,
      memorySize: config.lambdaMemory,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: { ...baseEnvironment },
    });

    const wsDefaultFn = new lambda.Function(this, 'WsDefaultFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'ws-default.handler',
      code: lambdaCode,
      memorySize: config.lambdaMemory,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: { ...baseEnvironment },
    });

    this.connectionsTable.grantReadWriteData(wsConnectFn);
    this.connectionsTable.grantReadWriteData(wsDisconnectFn);
    this.connectionsTable.grantReadWriteData(wsDefaultFn);

    // Only handlers that verify JWTs need the secret. $disconnect is triggered
    // by API Gateway without a token.
    jwtSecret.grantRead(wsConnectFn);
    jwtSecret.grantRead(wsDefaultFn);

    this.webSocketApi = new apigw.WebSocketApi(this, 'WebSocketApi', {
      apiName: `kaipos-ws-${config.stage}`,
      connectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('ConnectIntegration', wsConnectFn),
      },
      disconnectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          wsDisconnectFn,
        ),
      },
      defaultRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('DefaultIntegration', wsDefaultFn),
      },
    });

    this.webSocketStage = new apigw.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName: config.stage,
      autoDeploy: true,
    });

    // Default handler replies to pings/acks via PostToConnection, which requires
    // execute-api:ManageConnections against this stage's ARN.
    this.webSocketStage.grantManagementApiAccess(wsDefaultFn);

    // Inject the management endpoint so the default handler can DM the caller.
    // callbackUrl is the HTTPS management URL (wss://... is the client-facing URL).
    // Only $default and the api Lambda (see api-stack) PostToConnection; $connect
    // and $disconnect never talk back to clients.
    const managementEndpoint = this.webSocketStage.callbackUrl;
    wsDefaultFn.addEnvironment('WS_API_ENDPOINT', managementEndpoint);

    new cdk.CfnOutput(this, 'WebSocketEndpoint', {
      value: `${this.webSocketApi.apiEndpoint}/${this.webSocketStage.stageName}`,
      description: 'WebSocket endpoint URL (wss://) — clients connect here',
    });

    new cdk.CfnOutput(this, 'WebSocketManagementEndpoint', {
      value: managementEndpoint,
      description: 'WebSocket management API endpoint (PostToConnection)',
    });

    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value: this.connectionsTable.tableName,
      description: 'DynamoDB table tracking active WebSocket connections',
    });
  }
}

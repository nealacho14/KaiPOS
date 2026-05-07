import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subs from 'aws-cdk-lib/aws-sns-subscriptions';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import type * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import type { Construct } from 'constructs';
import type { StageConfig } from './config.js';

interface MonitoringStackProps extends cdk.StackProps {
  config: StageConfig;
  httpApi: apigw.HttpApi;
  apiFunction: lambda.Function;
  wsConnectFn: lambda.Function;
  wsDisconnectFn: lambda.Function;
  wsDefaultFn: lambda.Function;
  apiAccessLogGroup: logs.ILogGroup;
}

const METRIC_NAMESPACE = 'kaipos/observability';

export class MonitoringStack extends cdk.Stack {
  readonly alertsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { config, httpApi, apiFunction, wsConnectFn, wsDisconnectFn, wsDefaultFn } = props;

    this.alertsTopic = new sns.Topic(this, 'AlertsTopic', {
      topicName: `kaipos-${config.stage}-alerts`,
      displayName: `KaiPOS ${config.stage} alerts`,
    });
    this.alertsTopic.addSubscription(new sns_subs.EmailSubscription(config.alertsEmail));

    const alarmAction = new cw_actions.SnsAction(this.alertsTopic);

    // Metric filters live on the api Lambda's auto-provisioned log group. The
    // log group is created lazily by Lambda on first invoke, but CDK exposes
    // it as a property so referencing it here forces the construct.
    const apiLogGroup = apiFunction.logGroup;

    new logs.MetricFilter(this, 'MongoConnectionErrorsFilter', {
      logGroup: apiLogGroup,
      metricNamespace: METRIC_NAMESPACE,
      metricName: 'MongoConnectionErrors',
      filterPattern: logs.FilterPattern.all(
        logs.FilterPattern.numberValue('$.level', '=', 50),
        logs.FilterPattern.stringValue('$.msg', '=', 'MongoDB connection error'),
      ),
      metricValue: '1',
      defaultValue: 0,
    });

    new logs.MetricFilter(this, 'AuthFailuresFilter', {
      logGroup: apiLogGroup,
      metricNamespace: METRIC_NAMESPACE,
      metricName: 'AuthFailures',
      filterPattern: logs.FilterPattern.numberValue('$.statusCode', '=', 401),
      metricValue: '1',
      defaultValue: 0,
    });

    new logs.MetricFilter(this, 'SlowRequestsFilter', {
      logGroup: apiLogGroup,
      metricNamespace: METRIC_NAMESPACE,
      metricName: 'SlowRequests',
      filterPattern: logs.FilterPattern.numberValue('$.durationMs', '>', 3000),
      metricValue: '1',
      defaultValue: 0,
    });

    // ---- HTTP API alarms (2)

    new cloudwatch.Alarm(this, 'Api5xxHigh', {
      alarmName: `kaipos-${config.stage}-api-5xx-high`,
      alarmDescription: 'API Gateway server-side errors (5xx) > 5 in 5 min',
      metric: httpApi.metricServerError({
        period: cdk.Duration.minutes(5),
        statistic: 'sum',
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    new cloudwatch.Alarm(this, 'ApiLatencyHighP95', {
      alarmName: `kaipos-${config.stage}-api-latency-p95-high`,
      alarmDescription: 'API Gateway p95 latency > 3000 ms in 5 min',
      metric: httpApi.metricLatency({
        period: cdk.Duration.minutes(5),
        statistic: 'p95',
      }),
      threshold: 3000,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // ---- Lambda alarms (4)
    //
    // The plan caps total alarms at 10 (free-tier). Keeping every Lambda
    // function on its own Errors+Throttles alarm would land at 12, so WS
    // functions are aggregated via a single MathExpression while the api
    // Lambda keeps its own pair (it carries the bulk of traffic and we want
    // a clear signal when it is the failing component).

    new cloudwatch.Alarm(this, 'ApiFunctionErrors', {
      alarmName: `kaipos-${config.stage}-api-fn-errors`,
      alarmDescription: 'API Lambda Errors > 3 in 5 min',
      metric: apiFunction.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'sum',
      }),
      threshold: 3,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    new cloudwatch.Alarm(this, 'ApiFunctionThrottles', {
      alarmName: `kaipos-${config.stage}-api-fn-throttles`,
      alarmDescription: 'API Lambda Throttles > 0 in 1 min',
      metric: apiFunction.metricThrottles({
        period: cdk.Duration.minutes(1),
        statistic: 'sum',
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    const wsErrorsExpression = new cloudwatch.MathExpression({
      expression: 'connect + disconnect + def',
      usingMetrics: {
        connect: wsConnectFn.metricErrors({
          period: cdk.Duration.minutes(5),
          statistic: 'sum',
        }),
        disconnect: wsDisconnectFn.metricErrors({
          period: cdk.Duration.minutes(5),
          statistic: 'sum',
        }),
        def: wsDefaultFn.metricErrors({
          period: cdk.Duration.minutes(5),
          statistic: 'sum',
        }),
      },
      label: 'WebSocket Lambda Errors (sum)',
      period: cdk.Duration.minutes(5),
    });

    new cloudwatch.Alarm(this, 'WsLambdaErrorsHigh', {
      alarmName: `kaipos-${config.stage}-ws-fn-errors`,
      alarmDescription: 'WS Lambda Errors (connect + disconnect + default) > 3 in 5 min',
      metric: wsErrorsExpression,
      threshold: 3,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    const wsThrottlesExpression = new cloudwatch.MathExpression({
      expression: 'connect + disconnect + def',
      usingMetrics: {
        connect: wsConnectFn.metricThrottles({
          period: cdk.Duration.minutes(1),
          statistic: 'sum',
        }),
        disconnect: wsDisconnectFn.metricThrottles({
          period: cdk.Duration.minutes(1),
          statistic: 'sum',
        }),
        def: wsDefaultFn.metricThrottles({
          period: cdk.Duration.minutes(1),
          statistic: 'sum',
        }),
      },
      label: 'WebSocket Lambda Throttles (sum)',
      period: cdk.Duration.minutes(1),
    });

    new cloudwatch.Alarm(this, 'WsLambdaThrottlesHigh', {
      alarmName: `kaipos-${config.stage}-ws-fn-throttles`,
      alarmDescription: 'WS Lambda Throttles (any function) > 0 in 1 min',
      metric: wsThrottlesExpression,
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // ---- Metric-filter alarms (2)

    new cloudwatch.Alarm(this, 'MongoConnectionErrorsHigh', {
      alarmName: `kaipos-${config.stage}-mongo-connection-errors`,
      alarmDescription: 'MongoDB connection errors logged > 5 in 5 min',
      metric: new cloudwatch.Metric({
        namespace: METRIC_NAMESPACE,
        metricName: 'MongoConnectionErrors',
        period: cdk.Duration.minutes(5),
        statistic: 'sum',
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    new cloudwatch.Alarm(this, 'SlowRequestsHigh', {
      alarmName: `kaipos-${config.stage}-slow-requests`,
      alarmDescription: 'Requests with durationMs > 3000 logged > 10 in 5 min',
      metric: new cloudwatch.Metric({
        namespace: METRIC_NAMESPACE,
        metricName: 'SlowRequests',
        period: cdk.Duration.minutes(5),
        statistic: 'sum',
      }),
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    new cdk.CfnOutput(this, 'AlertsTopicArn', {
      value: this.alertsTopic.topicArn,
      description: 'SNS topic for KaiPOS observability alerts',
    });
  }
}

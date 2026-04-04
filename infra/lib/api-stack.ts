import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type { Construct } from "constructs";

interface ApiStackProps extends cdk.StackProps {
  stage: string;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isProd = stage === "prod";

    const healthFunction = new lambda.Function(this, "HealthFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "health.handler",
      code: lambda.Code.fromAsset("../apps/backend/dist"),
      memorySize: isProd ? 1024 : 512,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_ENV: stage,
        MONGO_URI: process.env.MONGO_URI || "",
      },
    });

    const httpApi = new apigw.HttpApi(this, "HttpApi", {
      apiName: `kaipos-api-${stage}`,
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigw.CorsHttpMethod.ANY],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    httpApi.addRoutes({
      path: "/api/health",
      methods: [apigw.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("HealthIntegration", healthFunction),
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: httpApi.url || "",
      description: "API Gateway URL",
    });
  }
}

import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import type * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import type { Construct } from "constructs";
import type { StageConfig } from "./config.js";

interface FrontendStackProps extends cdk.StackProps {
  config: StageConfig;
  httpApi: apigw.HttpApi;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { config, httpApi } = props;

    const bucket = new s3.Bucket(this, "FrontendBucket", {
      bucketName: `kaipos-frontend-${config.stage}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: config.removalPolicy,
      autoDeleteObjects: config.autoDeleteObjects,
    });

    const oai = new cloudfront.OriginAccessIdentity(this, "OAI");
    bucket.grantRead(oai);

    // The API Gateway URL is `https://<apiId>.execute-api.<region>.amazonaws.com/`.
    // CloudFront needs only the host, without scheme or path.
    const apiDomain = `${httpApi.apiId}.execute-api.${cdk.Stack.of(this).region}.amazonaws.com`;

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket, { originAccessIdentity: oai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        // Proxy `/api/*` to API Gateway so the SPA can use relative URLs.
        // Same-origin means no CORS, and the API Gateway URL is never exposed
        // to the browser.
        "/api/*": {
          origin: new origins.HttpOrigin(apiDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    new s3deploy.BucketDeployment(this, "DeployFrontend", {
      sources: [s3deploy.Source.asset("../apps/frontend-admin/dist")],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ["/*"],
    });

    new cdk.CfnOutput(this, "DistributionUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "CloudFront distribution URL (frontend + /api proxy)",
    });
  }
}

import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import type { Construct } from 'constructs';
import type { StageConfig } from './config.js';

interface FrontendStackProps extends cdk.StackProps {
  config: StageConfig;
  httpApi: apigw.HttpApi;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { config, httpApi } = props;

    const bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `kaipos-frontend-${config.stage}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: config.removalPolicy,
      autoDeleteObjects: config.autoDeleteObjects,
    });

    const oai = new cloudfront.OriginAccessIdentity(this, 'OAI');
    bucket.grantRead(oai);

    // The API Gateway URL is `https://<apiId>.execute-api.<region>.amazonaws.com/`.
    // CloudFront needs only the host, without scheme or path.
    const apiDomain = `${httpApi.apiId}.execute-api.${cdk.Stack.of(this).region}.amazonaws.com`;

    // SPA fallback as a CloudFront Function attached only to the frontend
    // behavior. A previous implementation used distribution-level
    // `errorResponses` to rewrite 404 -> /index.html, but that applied to
    // every behavior — including `/api/*`, where it masked real 4xx Lambda
    // responses as `200 text/html`. Per-behavior viewer-request rewrite is
    // the only way to get SPA deep-link routing without poisoning the API.
    // The handler lives in `./spa-router.js` so it can be linted/edited as
    // normal JavaScript instead of a string blob.
    const spaRouter = new cloudfront.Function(this, 'SpaRouter', {
      code: cloudfront.FunctionCode.fromFile({
        filePath: path.join(import.meta.dirname, 'spa-router.js'),
      }),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket, { originAccessIdentity: oai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            function: spaRouter,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        // Proxy `/api/*` to API Gateway so the SPA can use relative URLs.
        // Same-origin means no CORS, and the API Gateway URL is never exposed
        // to the browser. Crucially, this behavior does NOT attach the SPA
        // router function — Lambda 4xx must propagate as JSON to the client.
        '/api/*': {
          origin: new origins.HttpOrigin(apiDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            customHeaders: {
              'x-origin-verify': config.cloudfrontSecret,
            },
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset('../apps/frontend-admin/dist')],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL (frontend + /api proxy)',
    });
  }
}

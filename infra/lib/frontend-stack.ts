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

    // Admin bucket — served as the default behavior at `/`.
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

    // POS bucket — served at `/pos/*` via its own behavior + CloudFront
    // Function. Kept as a second bucket (not a prefix on the admin bucket)
    // so the two apps can be deployed independently without the
    // `BucketDeployment` prune step wiping the other app's assets.
    const posBucket = new s3.Bucket(this, 'FrontendPosBucket', {
      bucketName: `kaipos-frontend-pos-${config.stage}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: config.removalPolicy,
      autoDeleteObjects: config.autoDeleteObjects,
    });
    const posOai = new cloudfront.OriginAccessIdentity(this, 'PosOAI');
    posBucket.grantRead(posOai);

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

    // POS-specific SPA router: rewrites extension-less URIs to
    // `/pos/index.html`. It must NOT rewrite to a URI the admin behavior also
    // produces — the cache key is the rewritten URI (behavior/origin are not
    // part of it), so both apps sharing `/index.html` poisons each other's
    // cache. The POS bucket stores objects under a `pos/` prefix (see
    // `destinationKeyPrefix` below) so viewer URIs map 1:1 to S3 keys.
    const posSpaRouter = new cloudfront.Function(this, 'PosSpaRouter', {
      code: cloudfront.FunctionCode.fromFile({
        filePath: path.join(import.meta.dirname, 'spa-router-pos.js'),
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
        // POS app at `/pos/*`. The CloudFront Function rewrites no-extension
        // URIs to /pos/index.html; the bucket keys carry the same prefix.
        '/pos/*': {
          origin: new origins.S3Origin(posBucket, { originAccessIdentity: posOai }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          functionAssociations: [
            {
              function: posSpaRouter,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
      },
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // Each app uploads in two passes so its files get the right `Cache-Control`.
    //
    // Without an origin header, `CACHING_OPTIMIZED` applies its 86400 s default
    // TTL to *everything*, `index.html` included. The deployment invalidation
    // flushes the edge, but browsers keep the old `index.html` for up to a day
    // — and it references hashed assets that still exist in S3, so returning
    // users silently run yesterday's build. A service worker makes this worse:
    // `sw.js` is how every future update is delivered, so a stale copy is
    // effectively unrecallable for its cache lifetime.
    //
    // `no-cache` (not `no-store`) still permits caching; it only forces
    // revalidation, so the common case stays a cheap 304.
    //
    // `prune: false` is mandatory on all four. Prune deletes destination
    // objects absent from the source and ignores include/exclude when working
    // that out, so a pruning shell pass would wipe `assets/`. The cost is that
    // superseded hashed assets accumulate; they are content-addressed and
    // therefore harmless, and expiring them while an older cached `index.html`
    // may still reference them would be worse.
    const IMMUTABLE = s3deploy.CacheControl.fromString('public, max-age=31536000, immutable');
    const REVALIDATE = s3deploy.CacheControl.fromString('no-cache');

    new s3deploy.BucketDeployment(this, 'DeployFrontendAssets', {
      sources: [s3deploy.Source.asset('../apps/frontend-admin/dist')],
      destinationBucket: bucket,
      exclude: ['*'],
      include: ['assets/*'],
      cacheControl: [IMMUTABLE],
      prune: false,
    });

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset('../apps/frontend-admin/dist')],
      destinationBucket: bucket,
      exclude: ['assets/*'],
      cacheControl: [REVALIDATE],
      prune: false,
      distribution,
      distributionPaths: ['/*'],
    });

    new s3deploy.BucketDeployment(this, 'DeployFrontendPosAssets', {
      sources: [s3deploy.Source.asset('../apps/frontend-pos/dist')],
      destinationBucket: posBucket,
      destinationKeyPrefix: 'pos/',
      exclude: ['*'],
      include: ['assets/*'],
      cacheControl: [IMMUTABLE],
      prune: false,
    });

    new s3deploy.BucketDeployment(this, 'DeployFrontendPos', {
      sources: [s3deploy.Source.asset('../apps/frontend-pos/dist')],
      destinationBucket: posBucket,
      destinationKeyPrefix: 'pos/',
      exclude: ['assets/*'],
      cacheControl: [REVALIDATE],
      prune: false,
      distribution,
      distributionPaths: ['/pos/*'],
    });

    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL (admin frontend + /api proxy)',
    });

    new cdk.CfnOutput(this, 'PosUrl', {
      value: `https://${distribution.distributionDomainName}/pos/`,
      description: 'POS frontend served under /pos/* on the same distribution',
    });
  }
}

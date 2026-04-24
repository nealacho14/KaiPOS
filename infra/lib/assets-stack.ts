import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import type { Construct } from 'constructs';
import type { StageConfig } from './config.js';

interface AssetsStackProps extends cdk.StackProps {
  config: StageConfig;
}

export class AssetsStack extends cdk.Stack {
  readonly assetsBucket: s3.Bucket;
  readonly cdnDomain: string;

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
      cors: [
        {
          // Browser uploads go directly to S3 via pre-signed PUTs issued by the
          // API Lambda. The signature is the real access control; CORS only
          // limits which origins the browser will forward the PUT from.
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: [
            'https://*.cloudfront.net',
            'http://localhost:3000',
            'http://localhost:3001',
          ],
          allowedHeaders: ['*'],
          maxAge: 300,
        },
      ],
    });

    const oai = new cloudfront.OriginAccessIdentity(this, 'AssetsOAI');
    this.assetsBucket.grantRead(oai);

    const distribution = new cloudfront.Distribution(this, 'AssetsDistribution', {
      // Default behavior is a placeholder — the distribution is only expected to
      // serve content under /products/*. Any other path hits the S3 origin with
      // no matching key and receives a 403 back, which is the intended behavior.
      defaultBehavior: {
        origin: new origins.S3Origin(this.assetsBucket, { originAccessIdentity: oai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/products/*': {
          origin: new origins.S3Origin(this.assetsBucket, { originAccessIdentity: oai }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    this.cdnDomain = distribution.distributionDomainName;

    new cdk.CfnOutput(this, 'AssetsBucketName', { value: this.assetsBucket.bucketName });
    new cdk.CfnOutput(this, 'AssetsCdnDomain', { value: this.cdnDomain });
  }
}

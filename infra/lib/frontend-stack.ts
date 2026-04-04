import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import type { Construct } from "constructs";

interface FrontendStackProps extends cdk.StackProps {
  stage: string;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isProd = stage === "prod";

    const bucket = new s3.Bucket(this, "FrontendBucket", {
      bucketName: `kaipos-frontend-${stage}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    const oai = new cloudfront.OriginAccessIdentity(this, "OAI");
    bucket.grantRead(oai);

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket, { originAccessIdentity: oai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
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
      priceClass: isProd
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : cloudfront.PriceClass.PRICE_CLASS_100,
    });

    new s3deploy.BucketDeployment(this, "DeployFrontend", {
      sources: [s3deploy.Source.asset("../apps/frontend-admin/dist")],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ["/*"],
    });

    new cdk.CfnOutput(this, "DistributionUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "CloudFront distribution URL",
    });
  }
}

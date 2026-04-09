import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { StageConfig } from "./config.js";

interface SecretsStackProps extends cdk.StackProps {
  config: StageConfig;
}

export class SecretsStack extends cdk.Stack {
  readonly mongoSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    const { config } = props;

    // The actual MONGO_URI value is set out-of-band via:
    //   aws secretsmanager put-secret-value --secret-id kaipos/<stage>/mongo-uri --secret-string "<atlas-uri>"
    // so the Atlas connection string never ends up in the CloudFormation template or git.
    this.mongoSecret = new secretsmanager.Secret(this, "MongoUriSecret", {
      secretName: `kaipos/${config.stage}/mongo-uri`,
      description: `MongoDB Atlas connection string for kaiPOS ${config.stage}`,
      removalPolicy: config.removalPolicy,
    });

    new cdk.CfnOutput(this, "MongoSecretArn", { value: this.mongoSecret.secretArn });
  }
}

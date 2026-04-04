import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as docdb from "aws-cdk-lib/aws-docdb";
import type { Construct } from "constructs";

interface DatabaseStackProps extends cdk.StackProps {
  stage: string;
}

export class DatabaseStack extends cdk.Stack {
  public readonly mongoUri: string;
  public readonly vpc: ec2.IVpc;
  public readonly securityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isProd = stage === "prod";

    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: isProd ? 3 : 2,
      natGateways: isProd ? 2 : 1,
    });

    this.securityGroup = new ec2.SecurityGroup(this, "DocDbSg", {
      vpc: this.vpc,
      description: "Security group for DocumentDB",
      allowAllOutbound: false,
    });

    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(27017),
      "Allow MongoDB connections from VPC",
    );

    const cluster = new docdb.DatabaseCluster(this, "DocDbCluster", {
      masterUser: {
        username: "kaiposadmin",
      },
      instanceType: isProd
        ? ec2.InstanceType.of(ec2.InstanceClass.R6G, ec2.InstanceSize.LARGE)
        : ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      instances: isProd ? 3 : 1,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroup: this.securityGroup,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProd,
      storageEncrypted: true,
      backup: {
        retention: cdk.Duration.days(isProd ? 35 : 7),
      },
    });

    this.mongoUri = `mongodb://${cluster.clusterEndpoint.hostname}:${cluster.clusterEndpoint.port}`;

    new cdk.CfnOutput(this, "ClusterEndpoint", {
      value: cluster.clusterEndpoint.hostname,
      description: "DocumentDB cluster endpoint",
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import type { StageConfig } from './config.js';

interface GithubOidcStackProps extends cdk.StackProps {
  config: StageConfig;
  githubRepo: string; // e.g. "nealacho14/KaiPOS"
}

export class GithubOidcStack extends cdk.Stack {
  readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const { githubRepo } = props;

    const oidcProvider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    this.deployRole = new iam.Role(this, 'GithubActionsDeployRole', {
      roleName: 'kaipos-github-deploy',
      assumedBy: new iam.WebIdentityPrincipal(oidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:${githubRepo}:*`,
        },
      }),
      maxSessionDuration: cdk.Duration.hours(1),
      description: 'Role assumed by GitHub Actions to deploy KaiPOS via CDK',
    });

    // CDK deploy needs broad permissions. Scope down once stable.
    this.deployRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', { value: this.deployRole.roleArn });
  }
}

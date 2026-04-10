#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ApiStack } from '../lib/api-stack.js';
import { FrontendStack } from '../lib/frontend-stack.js';
import { SecretsStack } from '../lib/secrets-stack.js';
import { AssetsStack } from '../lib/assets-stack.js';
import { getStageConfig } from '../lib/config.js';

const app = new cdk.App();

const rawStage = app.node.tryGetContext('stage') as string | undefined;
const config = getStageConfig(rawStage);
const prefix = `kaipos-${config.stage}`;

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

cdk.Tags.of(app).add('Project', 'kaipos');
cdk.Tags.of(app).add('Stage', config.stage);

const secrets = new SecretsStack(app, `${prefix}-secrets`, { env, config });
const assets = new AssetsStack(app, `${prefix}-assets`, { env, config });

const api = new ApiStack(app, `${prefix}-api`, {
  env,
  config,
  mongoSecret: secrets.mongoSecret,
  assetsBucket: assets.assetsBucket,
});

new FrontendStack(app, `${prefix}-frontend`, {
  env,
  config,
  httpApi: api.httpApi,
});

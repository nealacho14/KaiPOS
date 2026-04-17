#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ApiStack } from '../lib/api-stack.js';
import { FrontendStack } from '../lib/frontend-stack.js';
import { GithubOidcStack } from '../lib/github-oidc-stack.js';
import { SecretsStack } from '../lib/secrets-stack.js';
import { AssetsStack } from '../lib/assets-stack.js';
import { WebSocketStack } from '../lib/websocket-stack.js';
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

new GithubOidcStack(app, `${prefix}-github-oidc`, {
  env,
  config,
  githubRepo: 'nealacho14/KaiPOS',
});

const secrets = new SecretsStack(app, `${prefix}-secrets`, { env, config });
const assets = new AssetsStack(app, `${prefix}-assets`, { env, config });

const api = new ApiStack(app, `${prefix}-api`, {
  env,
  config,
  mongoSecret: secrets.mongoSecret,
  jwtSecret: secrets.jwtSecret,
  assetsBucket: assets.assetsBucket,
});

new WebSocketStack(app, `${prefix}-websocket`, {
  env,
  config,
  mongoSecret: secrets.mongoSecret,
  jwtSecret: secrets.jwtSecret,
});

new FrontendStack(app, `${prefix}-frontend`, {
  env,
  config,
  httpApi: api.httpApi,
});

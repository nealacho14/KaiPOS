#!/usr/bin/env node
import "source-map-support/register.js";
import * as cdk from "aws-cdk-lib";
import { ApiStack } from "../lib/api-stack.js";
import { FrontendStack } from "../lib/frontend-stack.js";
import { DatabaseStack } from "../lib/database-stack.js";

const app = new cdk.App();

const stage = app.node.tryGetContext("stage") || "staging";
const prefix = `kaipos-${stage}`;

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

const databaseStack = new DatabaseStack(app, `${prefix}-database`, {
  env,
  stage,
});

new ApiStack(app, `${prefix}-api`, {
  env,
  stage,
  mongoUri: databaseStack.mongoUri,
});

new FrontendStack(app, `${prefix}-frontend`, {
  env,
  stage,
});

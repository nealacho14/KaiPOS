#!/usr/bin/env node
import "source-map-support/register.js";
import * as cdk from "aws-cdk-lib";
import { ApiStack } from "../lib/api-stack.js";
import { FrontendStack } from "../lib/frontend-stack.js";

const app = new cdk.App();

const stage = app.node.tryGetContext("stage") || "staging";
const prefix = `kaipos-${stage}`;

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

new ApiStack(app, `${prefix}-api`, {
  env,
  stage,
});

new FrontendStack(app, `${prefix}-frontend`, {
  env,
  stage,
});

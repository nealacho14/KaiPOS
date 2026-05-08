import { MongoClient, type Db } from 'mongodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from '../lib/logger.js';

let client: MongoClient | null = null;
let db: Db | null = null;
let cachedUri: string | null = null;

async function resolveMongoUri(): Promise<string> {
  if (cachedUri) return cachedUri;

  const secretArn = process.env.MONGO_SECRET_ARN;
  if (secretArn) {
    const sm = new SecretsManagerClient({});
    const res = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
    if (!res.SecretString) {
      throw new Error(`Secret ${secretArn} has no SecretString value`);
    }
    cachedUri = res.SecretString;
    return cachedUri;
  }

  // Local path. The non-Lambda environment is Docker-only by policy: if a
  // dev's .env points at Atlas, refuse loudly instead of silently writing
  // demo/test data into a shared cluster. The Lambda path above already
  // returned, so any Atlas SRV URI we see here came from a local .env.
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/kaipos';
  if (uri.startsWith('mongodb+srv://')) {
    throw new Error(
      'Local backend refuses to connect to Atlas (mongodb+srv://). ' +
        'KaiPOS local dev runs against Docker Mongo only — set ' +
        'MONGO_URI=mongodb://localhost:27017/kaipos and start the stack with ' +
        '`pnpm docker:up` (or `pnpm setup` for first-time bootstrap). ' +
        'Atlas connections live exclusively in Lambda via MONGO_SECRET_ARN.',
    );
  }
  cachedUri = uri;
  return cachedUri;
}

export async function getClient(): Promise<MongoClient> {
  if (!client) {
    const uri = await resolveMongoUri();
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      // Don't pin a warm socket open while the Lambda container is idle.
      // The pool ramps up on demand under real traffic.
      minPoolSize: 0,
      maxIdleTimeMS: 30000,
      // Fail fast if Atlas is unreachable (IP allowlist drift, DNS issue):
      // 5s is enough on a healthy network and avoids burning 10s of Lambda
      // duration before surfacing the error.
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    try {
      await client.connect();
      logger.info('MongoDB connected successfully');
    } catch (error) {
      client = null;
      logger.error({ err: error }, 'MongoDB connection error');
      throw error;
    }
  }
  return client;
}

export async function getDb(): Promise<Db> {
  if (!db) {
    const mongoClient = await getClient();
    db = mongoClient.db();
  }
  return db;
}

export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

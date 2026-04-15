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

  cachedUri = process.env.MONGO_URI || 'mongodb://localhost:27017/kaipos';
  return cachedUri;
}

export async function getClient(): Promise<MongoClient> {
  if (!client) {
    const uri = await resolveMongoUri();
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
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

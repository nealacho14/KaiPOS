import { MongoClient, type Db } from "mongodb";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/kaipos";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getClient(): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(MONGO_URI, {
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
    });
    await client.connect();
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

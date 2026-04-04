import { MongoClient, type Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/kaipos";
const DB_NAME = process.env.DB_NAME || "kaipos";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getClient(): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(MONGODB_URI, {
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
    db = mongoClient.db(DB_NAME);
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

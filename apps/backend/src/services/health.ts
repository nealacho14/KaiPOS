import { API_VERSION } from '@kaipos/shared';
import { getClient } from '../db/client.js';

export interface HealthStatus {
  service: string;
  version: string;
  database: string;
  databaseError?: string;
  timestamp: string;
}

export async function checkHealth(): Promise<HealthStatus> {
  let database = 'disconnected';
  let databaseError: string | undefined;

  try {
    const client = await getClient();
    await client.db().command({ ping: 1 });
    database = 'connected';
  } catch (error) {
    database = 'error';
    databaseError = error instanceof Error ? error.message : String(error);
  }

  return {
    service: 'kaipos-api',
    version: API_VERSION,
    database,
    ...(databaseError && { databaseError }),
    timestamp: new Date().toISOString(),
  };
}

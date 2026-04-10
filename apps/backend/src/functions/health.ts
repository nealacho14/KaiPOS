import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { API_VERSION } from '@kaipos/shared';
import { getClient } from '../db/client.js';

export const handler: APIGatewayProxyHandlerV2 = async () => {
  let dbStatus = 'disconnected';

  try {
    const client = await getClient();
    await client.db().command({ ping: 1 });
    dbStatus = 'connected';
  } catch {
    dbStatus = 'error';
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      data: {
        service: 'kaipos-api',
        version: API_VERSION,
        database: dbStatus,
        timestamp: new Date().toISOString(),
      },
    }),
  };
};

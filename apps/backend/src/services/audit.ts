import type { AuditAction } from '@kaipos/shared/types';
import { getAuditLogsCollection } from '../db/collections.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger({ module: 'audit' });

interface AuditEvent {
  businessId?: string;
  userId?: string;
  action: AuditAction;
  target: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event. Fire-and-forget — never blocks the caller.
 */
export function logAuditEvent(event: AuditEvent): void {
  const write = async () => {
    const collection = await getAuditLogsCollection();
    await collection.insertOne({
      _id: crypto.randomUUID(),
      ...event,
      createdAt: new Date(),
    });
  };

  write().catch((err) => {
    log.error({ err, event }, 'Failed to write audit log');
  });
}

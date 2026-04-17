import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logAuditEvent } from './audit.js';

const { mockAuditLogsCollection, mockLog } = vi.hoisted(() => ({
  mockAuditLogsCollection: { insertOne: vi.fn() },
  mockLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../db/collections.js', () => ({
  getAuditLogsCollection: () => Promise.resolve(mockAuditLogsCollection),
}));

vi.mock('../lib/logger.js', () => ({
  createLogger: () => mockLog,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('audit service', () => {
  describe('logAuditEvent', () => {
    it('returns void synchronously (fire-and-forget)', () => {
      mockAuditLogsCollection.insertOne.mockResolvedValue({});

      // Must return undefined synchronously — callers must not await it.
      const result = logAuditEvent({ action: 'login', target: 'user@example.com' });

      expect(result).toBeUndefined();
    });

    it('inserts the event fields into the auditLogs collection', async () => {
      mockAuditLogsCollection.insertOne.mockResolvedValue({});

      logAuditEvent({
        action: 'login',
        target: 'user@example.com',
        userId: 'user-1',
        businessId: 'biz-1',
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        metadata: { extra: 'data' },
      });

      // Allow the internal async write() to complete.
      await vi.waitFor(() => {
        expect(mockAuditLogsCollection.insertOne).toHaveBeenCalledOnce();
      });

      const insertArg = mockAuditLogsCollection.insertOne.mock.calls[0][0];
      expect(insertArg.action).toBe('login');
      expect(insertArg.target).toBe('user@example.com');
      expect(insertArg.userId).toBe('user-1');
      expect(insertArg.businessId).toBe('biz-1');
      expect(insertArg.ip).toBe('127.0.0.1');
      expect(insertArg.userAgent).toBe('Mozilla/5.0');
      expect(insertArg.metadata).toEqual({ extra: 'data' });
    });

    it('auto-generates _id and createdAt on each event', async () => {
      mockAuditLogsCollection.insertOne.mockResolvedValue({});

      logAuditEvent({ action: 'logout', target: 'user-1' });

      await vi.waitFor(() => {
        expect(mockAuditLogsCollection.insertOne).toHaveBeenCalledOnce();
      });

      const insertArg = mockAuditLogsCollection.insertOne.mock.calls[0][0];
      // _id should be a UUID string — not provided by the caller.
      expect(typeof insertArg._id).toBe('string');
      expect(insertArg._id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      // createdAt should be a recent Date.
      expect(insertArg.createdAt).toBeInstanceOf(Date);
      expect(insertArg.createdAt.getTime()).toBeCloseTo(Date.now(), -3);
    });

    it('does NOT throw when the DB insert fails (fire-and-forget silences errors)', async () => {
      mockAuditLogsCollection.insertOne.mockRejectedValue(new Error('DB connection lost'));

      // The function itself must not throw — errors are swallowed internally.
      expect(() => logAuditEvent({ action: 'register', target: 'new@example.com' })).not.toThrow();

      // Wait for the promise rejection to be handled internally.
      await vi.waitFor(() => {
        expect(mockLog.error).toHaveBeenCalledOnce();
      });
    });

    it('logs the error via Pino when DB insert fails', async () => {
      const dbError = new Error('timeout');
      mockAuditLogsCollection.insertOne.mockRejectedValue(dbError);

      logAuditEvent({ action: 'password_reset_request', target: 'user@example.com' });

      await vi.waitFor(() => {
        expect(mockLog.error).toHaveBeenCalledWith(
          expect.objectContaining({ err: dbError }),
          expect.stringContaining('Failed to write audit log'),
        );
      });
    });
  });
});

/**
 * auth.audit.test.ts
 *
 * Supplements auth.test.ts with tests for the audit logging and SES email
 * integrations added to the auth service. The 20 original auth tests cover
 * correctness of the core auth flows; these tests verify the side-effects
 * (audit events and password-reset emails) for each operation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User, RefreshToken, PasswordResetToken } from '@kaipos/shared/types';

// --- Mock collections ---

const mockUsersCollection = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
};

const mockRefreshTokensCollection = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  deleteOne: vi.fn(),
  deleteMany: vi.fn(),
};

const mockLoginAttemptsCollection = {
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  deleteOne: vi.fn(),
};

const mockPasswordResetTokensCollection = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
};

vi.mock('../db/collections.js', () => ({
  getUsersCollection: () => Promise.resolve(mockUsersCollection),
  getRefreshTokensCollection: () => Promise.resolve(mockRefreshTokensCollection),
  getLoginAttemptsCollection: () => Promise.resolve(mockLoginAttemptsCollection),
  getPasswordResetTokensCollection: () => Promise.resolve(mockPasswordResetTokensCollection),
}));

vi.mock('../lib/password.js', () => ({
  hashPassword: vi.fn((plain: string) => Promise.resolve(`hashed_${plain}`)),
  verifyPassword: vi.fn((plain: string, hash: string) =>
    Promise.resolve(hash === `hashed_${plain}`),
  ),
}));

vi.mock('../lib/jwt.js', () => ({
  signAccessToken: vi.fn(() => Promise.resolve('mock-access-token')),
  generateRefreshToken: vi.fn(() => 'mock-refresh-token'),
}));

vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// --- Mocks for the new integrations under test ---

const mockLogAuditEvent = vi.fn();
const mockSendPasswordResetEmail = vi.fn();

vi.mock('./audit.js', () => ({
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}));

vi.mock('../lib/ses.js', () => ({
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
}));

import { login, register, refresh, logout, forgotPassword, resetPassword } from './auth.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const now = new Date('2025-01-01T00:00:00Z');

const adminUser: User = {
  _id: 'admin-1',
  businessId: 'biz-1',
  email: 'admin@test.com',
  name: 'Admin',
  passwordHash: 'hashed_admin123',
  role: 'admin',
  branchIds: ['branch-1'],
  isActive: true,
  createdAt: now,
  updatedAt: now,
  createdBy: 'system',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: SES send resolves successfully so it never blocks audit assertions.
  mockSendPasswordResetEmail.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Audit + SES integration tests
// ---------------------------------------------------------------------------

describe('auth service — audit and email side-effects', () => {
  describe('login', () => {
    it('calls logAuditEvent with action "login" on successful login', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue(adminUser);
      mockRefreshTokensCollection.insertOne.mockResolvedValue({});
      mockLoginAttemptsCollection.deleteOne.mockResolvedValue({});

      await login('admin@test.com', 'admin123');

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'login',
          target: 'admin@test.com',
          userId: 'admin-1',
          businessId: 'biz-1',
        }),
      );
    });

    it('calls logAuditEvent with action "login_failed" on wrong password', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue(adminUser);
      mockLoginAttemptsCollection.findOneAndUpdate.mockResolvedValue({ attempts: 1 });

      await expect(login('admin@test.com', 'wrong')).rejects.toThrow();

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'login_failed', target: 'admin@test.com' }),
      );
    });

    it('calls logAuditEvent with action "login_failed" when account is deactivated', async () => {
      const inactiveUser = { ...adminUser, isActive: false };
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue(inactiveUser);

      await expect(login('admin@test.com', 'admin123')).rejects.toThrow('Account is deactivated');

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'login_failed',
          target: 'admin@test.com',
          metadata: { reason: 'deactivated' },
        }),
      );
    });

    it('calls logAuditEvent with action "login_failed" when user does not exist', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue(null);
      mockLoginAttemptsCollection.findOneAndUpdate.mockResolvedValue({ attempts: 1 });

      await expect(login('ghost@test.com', 'pass')).rejects.toThrow();

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'login_failed', target: 'ghost@test.com' }),
      );
    });
  });

  describe('register', () => {
    it('calls logAuditEvent with action "register" after creating a user', async () => {
      const adminPayload = { userId: 'admin-1', businessId: 'biz-1', role: 'admin' as const };
      mockUsersCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.insertOne.mockResolvedValue({});

      await register(adminPayload, {
        email: 'new@test.com',
        password: 'password123',
        name: 'New User',
        role: 'cashier',
        branchIds: ['branch-1'],
      });

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'register',
          target: 'new@test.com',
          userId: 'admin-1',
          businessId: 'biz-1',
        }),
      );
    });

    it('includes registeredUserId and role in audit metadata', async () => {
      const adminPayload = { userId: 'admin-1', businessId: 'biz-1', role: 'admin' as const };
      mockUsersCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.insertOne.mockResolvedValue({});

      await register(adminPayload, {
        email: 'new@test.com',
        password: 'password123',
        name: 'New User',
        role: 'cashier',
      });

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ role: 'cashier' }),
        }),
      );
    });
  });

  describe('logout', () => {
    it('calls logAuditEvent with action "logout" when token exists', async () => {
      const storedToken: RefreshToken = {
        _id: 'rt-1',
        userId: 'admin-1',
        token: 'some-token',
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: now,
      };
      mockRefreshTokensCollection.findOne.mockResolvedValue(storedToken);
      mockRefreshTokensCollection.deleteOne.mockResolvedValue({});

      await logout('some-token');

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'logout', userId: 'admin-1' }),
      );
    });

    it('does NOT call logAuditEvent when the token does not exist', async () => {
      mockRefreshTokensCollection.findOne.mockResolvedValue(null);
      mockRefreshTokensCollection.deleteOne.mockResolvedValue({});

      await logout('nonexistent-token');

      expect(mockLogAuditEvent).not.toHaveBeenCalled();
    });
  });

  describe('refresh (token rotation)', () => {
    it('calls logAuditEvent with action "token_refresh" on successful rotation', async () => {
      const storedToken: RefreshToken = {
        _id: 'rt-1',
        userId: 'admin-1',
        token: 'valid-refresh',
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: now,
      };
      mockRefreshTokensCollection.findOne.mockResolvedValue(storedToken);
      mockRefreshTokensCollection.deleteOne.mockResolvedValue({});
      mockRefreshTokensCollection.insertOne.mockResolvedValue({});
      mockUsersCollection.findOne.mockResolvedValue(adminUser);

      await refresh('valid-refresh');

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'token_refresh',
          target: 'admin@test.com',
          userId: 'admin-1',
          businessId: 'biz-1',
        }),
      );
    });
  });

  describe('forgotPassword', () => {
    it('calls sendPasswordResetEmail with the recipient email and generated token', async () => {
      mockUsersCollection.findOne.mockResolvedValue(adminUser);
      mockPasswordResetTokensCollection.insertOne.mockResolvedValue({});

      await forgotPassword('admin@test.com');

      expect(mockSendPasswordResetEmail).toHaveBeenCalledOnce();
      const [calledEmail, calledToken] = mockSendPasswordResetEmail.mock.calls[0];
      expect(calledEmail).toBe('admin@test.com');
      // The token is a UUID generated by crypto.randomUUID().
      expect(calledToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('does NOT call sendPasswordResetEmail for an unknown email', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);

      await forgotPassword('unknown@test.com');

      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('calls logAuditEvent with action "password_reset_request"', async () => {
      mockUsersCollection.findOne.mockResolvedValue(adminUser);
      mockPasswordResetTokensCollection.insertOne.mockResolvedValue({});

      await forgotPassword('admin@test.com');

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'password_reset_request',
          target: 'admin@test.com',
          userId: 'admin-1',
          businessId: 'biz-1',
        }),
      );
    });

    it('sendPasswordResetEmail receives the same token that was stored in the DB', async () => {
      mockUsersCollection.findOne.mockResolvedValue(adminUser);
      mockPasswordResetTokensCollection.insertOne.mockResolvedValue({});

      await forgotPassword('admin@test.com');

      // The token stored in the DB and the token emailed must match.
      const storedToken = mockPasswordResetTokensCollection.insertOne.mock.calls[0][0].token;
      const emailedToken = mockSendPasswordResetEmail.mock.calls[0][1];
      expect(emailedToken).toBe(storedToken);
    });
  });

  describe('resetPassword', () => {
    const validResetToken: PasswordResetToken = {
      _id: 'prt-1',
      userId: 'admin-1',
      token: 'reset-token-123',
      expiresAt: new Date(Date.now() + 3_600_000),
      createdAt: now,
      usedAt: null,
    };

    it('calls logAuditEvent with action "password_reset_complete" on success', async () => {
      mockPasswordResetTokensCollection.findOne.mockResolvedValue(validResetToken);
      mockUsersCollection.updateOne.mockResolvedValue({});
      mockPasswordResetTokensCollection.updateOne.mockResolvedValue({});
      mockRefreshTokensCollection.deleteMany.mockResolvedValue({});

      await resetPassword('reset-token-123', 'newpassword');

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'password_reset_complete',
          target: 'admin-1',
          userId: 'admin-1',
        }),
      );
    });
  });
});

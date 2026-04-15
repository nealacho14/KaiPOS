import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User, RefreshToken, LoginAttempt, PasswordResetToken } from '@kaipos/shared/types';

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

import { login, register, refresh, logout, forgotPassword, resetPassword } from './auth.js';

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
});

describe('auth service', () => {
  describe('login', () => {
    it('returns tokens and user on valid credentials', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue(adminUser);
      mockRefreshTokensCollection.insertOne.mockResolvedValue({});
      mockLoginAttemptsCollection.deleteOne.mockResolvedValue({});

      const result = await login('admin@test.com', 'admin123');

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.user.email).toBe('admin@test.com');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('throws UnauthorizedError on wrong password', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue(adminUser);
      mockLoginAttemptsCollection.findOneAndUpdate.mockResolvedValue({ attempts: 1 });

      await expect(login('admin@test.com', 'wrong')).rejects.toThrow('Invalid email or password');
    });

    it('throws UnauthorizedError for non-existent user', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue(null);
      mockLoginAttemptsCollection.findOneAndUpdate.mockResolvedValue({ attempts: 1 });

      await expect(login('noone@test.com', 'pass')).rejects.toThrow('Invalid email or password');
    });

    it('throws on locked account', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue({
        email: 'admin@test.com',
        attempts: 5,
        lockedUntil: new Date(Date.now() + 60_000),
      } satisfies Partial<LoginAttempt> as LoginAttempt);

      await expect(login('admin@test.com', 'admin123')).rejects.toThrow(
        'Account temporarily locked',
      );
    });

    it('throws UnauthorizedError for inactive user', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue({ ...adminUser, isActive: false });
      mockLoginAttemptsCollection.updateOne.mockResolvedValue({});

      // verifyPassword will pass, but isActive check should catch it
      // Need to mock verifyPassword to return true for this specific case
      const { verifyPassword } = await import('../lib/password.js');
      vi.mocked(verifyPassword).mockResolvedValueOnce(true);

      await expect(login('admin@test.com', 'admin123')).rejects.toThrow('Account is deactivated');
    });

    it('resets login attempts on successful login', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue(adminUser);
      mockRefreshTokensCollection.insertOne.mockResolvedValue({});
      mockLoginAttemptsCollection.deleteOne.mockResolvedValue({});

      await login('admin@test.com', 'admin123');

      expect(mockLoginAttemptsCollection.deleteOne).toHaveBeenCalledWith({
        email: 'admin@test.com',
      });
    });
  });

  describe('register', () => {
    const adminPayload = { userId: 'admin-1', businessId: 'biz-1', role: 'admin' as const };

    it('creates a user when called by admin', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.insertOne.mockResolvedValue({});

      const result = await register(adminPayload, {
        email: 'new@test.com',
        password: 'password123',
        name: 'New User',
        role: 'cashier',
        branchIds: ['branch-1'],
      });

      expect(result.email).toBe('new@test.com');
      expect(result.role).toBe('cashier');
      expect(result.businessId).toBe('biz-1');
      expect(result).not.toHaveProperty('passwordHash');
      expect(mockUsersCollection.insertOne).toHaveBeenCalledOnce();
    });

    it('throws ForbiddenError for non-admin caller', async () => {
      const cashierPayload = { userId: 'user-2', businessId: 'biz-1', role: 'cashier' as const };

      await expect(
        register(cashierPayload, {
          email: 'new@test.com',
          password: 'password123',
          name: 'New',
          role: 'cashier',
        }),
      ).rejects.toThrow('Only admins can register new users');
    });

    it('throws on duplicate email', async () => {
      mockUsersCollection.findOne.mockResolvedValue(adminUser);

      await expect(
        register(adminPayload, {
          email: 'admin@test.com',
          password: 'password123',
          name: 'Dup',
          role: 'cashier',
        }),
      ).rejects.toThrow('A user with this email already exists');
    });
  });

  describe('refresh', () => {
    it('rotates tokens on valid refresh token', async () => {
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

      const result = await refresh('valid-refresh');

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(mockRefreshTokensCollection.deleteOne).toHaveBeenCalledWith({ _id: 'rt-1' });
    });

    it('throws on invalid refresh token', async () => {
      mockRefreshTokensCollection.findOne.mockResolvedValue(null);

      await expect(refresh('bad-token')).rejects.toThrow('Invalid refresh token');
    });

    it('throws on expired refresh token', async () => {
      mockRefreshTokensCollection.findOne.mockResolvedValue({
        _id: 'rt-1',
        userId: 'admin-1',
        token: 'expired-token',
        expiresAt: new Date(Date.now() - 1000),
        createdAt: now,
      } satisfies RefreshToken);
      mockRefreshTokensCollection.deleteOne.mockResolvedValue({});

      await expect(refresh('expired-token')).rejects.toThrow('Refresh token expired');
    });

    it('throws if user is deactivated', async () => {
      mockRefreshTokensCollection.findOne.mockResolvedValue({
        _id: 'rt-1',
        userId: 'admin-1',
        token: 'valid',
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: now,
      } satisfies RefreshToken);
      mockRefreshTokensCollection.deleteOne.mockResolvedValue({});
      mockUsersCollection.findOne.mockResolvedValue({ ...adminUser, isActive: false });

      await expect(refresh('valid')).rejects.toThrow('User not found or deactivated');
    });
  });

  describe('logout', () => {
    it('deletes the refresh token', async () => {
      mockRefreshTokensCollection.deleteOne.mockResolvedValue({});

      await logout('some-token');

      expect(mockRefreshTokensCollection.deleteOne).toHaveBeenCalledWith({ token: 'some-token' });
    });
  });

  describe('forgotPassword', () => {
    it('creates a reset token for existing user', async () => {
      mockUsersCollection.findOne.mockResolvedValue(adminUser);
      mockPasswordResetTokensCollection.insertOne.mockResolvedValue({});

      await forgotPassword('admin@test.com');

      expect(mockPasswordResetTokensCollection.insertOne).toHaveBeenCalledOnce();
      const insertArg = mockPasswordResetTokensCollection.insertOne.mock.calls[0][0];
      expect(insertArg.userId).toBe('admin-1');
      expect(insertArg.usedAt).toBeNull();
    });

    it('does not throw for unknown email (anti-enumeration)', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);

      await expect(forgotPassword('unknown@test.com')).resolves.toBeUndefined();
      expect(mockPasswordResetTokensCollection.insertOne).not.toHaveBeenCalled();
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

    it('resets password and invalidates all sessions', async () => {
      mockPasswordResetTokensCollection.findOne.mockResolvedValue(validResetToken);
      mockUsersCollection.updateOne.mockResolvedValue({});
      mockPasswordResetTokensCollection.updateOne.mockResolvedValue({});
      mockRefreshTokensCollection.deleteMany.mockResolvedValue({});

      await resetPassword('reset-token-123', 'newpassword');

      expect(mockUsersCollection.updateOne).toHaveBeenCalledWith(
        { _id: 'admin-1' },
        expect.objectContaining({
          $set: expect.objectContaining({ passwordHash: 'hashed_newpassword' }),
        }),
      );
      expect(mockPasswordResetTokensCollection.updateOne).toHaveBeenCalledWith(
        { _id: 'prt-1' },
        { $set: expect.objectContaining({ usedAt: expect.any(Date) }) },
      );
      expect(mockRefreshTokensCollection.deleteMany).toHaveBeenCalledWith({ userId: 'admin-1' });
    });

    it('throws on invalid token', async () => {
      mockPasswordResetTokensCollection.findOne.mockResolvedValue(null);

      await expect(resetPassword('bad', 'newpass123')).rejects.toThrow(
        'Invalid or expired reset token',
      );
    });

    it('throws on expired token', async () => {
      mockPasswordResetTokensCollection.findOne.mockResolvedValue({
        ...validResetToken,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(resetPassword('reset-token-123', 'newpass123')).rejects.toThrow(
        'Reset token has expired',
      );
    });

    it('throws on already-used token', async () => {
      mockPasswordResetTokensCollection.findOne.mockResolvedValue({
        ...validResetToken,
        usedAt: new Date(),
      });

      await expect(resetPassword('reset-token-123', 'newpass123')).rejects.toThrow(
        'Reset token has already been used',
      );
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User, RefreshToken, LoginAttempt, PasswordResetToken } from '@kaipos/shared/types';
import { login, refresh, logout, forgotPassword, resetPassword } from './auth.js';

const {
  mockUsersCollection,
  mockBusinessesCollection,
  mockRefreshTokensCollection,
  mockLoginAttemptsCollection,
  mockPasswordResetTokensCollection,
} = vi.hoisted(() => ({
  mockUsersCollection: {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
  },
  mockBusinessesCollection: {
    findOne: vi.fn(),
  },
  mockRefreshTokensCollection: {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
  },
  mockLoginAttemptsCollection: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
  },
  mockPasswordResetTokensCollection: {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('../db/collections.js', () => ({
  getUsersCollection: () => Promise.resolve(mockUsersCollection),
  getBusinessesCollection: () => Promise.resolve(mockBusinessesCollection),
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
  // Default: tenant users always resolve a business. Tests that need to
  // exercise the orphan path override this mock.
  mockBusinessesCollection.findOne.mockResolvedValue({
    _id: 'biz-1',
    name: 'Acme',
    slug: 'acme',
    currency: 'DOP',
  });
});

describe('auth service', () => {
  describe('login', () => {
    it('returns tokens, user and business on valid credentials', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue(adminUser);
      mockRefreshTokensCollection.insertOne.mockResolvedValue({});
      mockLoginAttemptsCollection.deleteOne.mockResolvedValue({});
      mockBusinessesCollection.findOne.mockResolvedValue({
        _id: 'biz-1',
        name: 'Acme',
        slug: 'acme',
        currency: 'DOP',
      });

      const result = await login('admin@test.com', 'admin123');

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.user.email).toBe('admin@test.com');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.business).toEqual({
        _id: 'biz-1',
        name: 'Acme',
        slug: 'acme',
        currency: 'DOP',
      });
    });

    it('returns business=null for super_admin', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue({ ...adminUser, businessId: '*' });
      mockRefreshTokensCollection.insertOne.mockResolvedValue({});
      mockLoginAttemptsCollection.deleteOne.mockResolvedValue({});

      const result = await login('admin@test.com', 'admin123');

      expect(result.business).toBeNull();
      expect(mockBusinessesCollection.findOne).not.toHaveBeenCalled();
    });

    it('throws BUSINESS_NOT_FOUND when a tenant user has an orphaned businessId', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue(adminUser);
      mockRefreshTokensCollection.insertOne.mockResolvedValue({});
      mockLoginAttemptsCollection.deleteOne.mockResolvedValue({});
      mockBusinessesCollection.findOne.mockResolvedValue(null);

      await expect(login('admin@test.com', 'admin123')).rejects.toMatchObject({
        statusCode: 404,
        code: 'BUSINESS_NOT_FOUND',
      });
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

    it('includes branchIds in the access token payload when the user has any', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue(adminUser);
      mockRefreshTokensCollection.insertOne.mockResolvedValue({});
      mockLoginAttemptsCollection.deleteOne.mockResolvedValue({});

      await login('admin@test.com', 'admin123');

      const { signAccessToken } = await import('../lib/jwt.js');
      expect(signAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          role: 'admin',
          branchIds: ['branch-1'],
        }),
      );
    });

    it('omits branchIds when the user has none', async () => {
      const userWithoutBranches: User = { ...adminUser };
      delete userWithoutBranches.branchIds;
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue(userWithoutBranches);
      mockRefreshTokensCollection.insertOne.mockResolvedValue({});
      mockLoginAttemptsCollection.deleteOne.mockResolvedValue({});

      await login('admin@test.com', 'admin123');

      const { signAccessToken } = await import('../lib/jwt.js');
      const payload = vi.mocked(signAccessToken).mock.calls.at(-1)?.[0];
      expect(payload).not.toHaveProperty('branchIds');
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

    it('uses 7-day refresh-token TTL by default', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue(adminUser);
      mockRefreshTokensCollection.insertOne.mockResolvedValue({});
      mockLoginAttemptsCollection.deleteOne.mockResolvedValue({});

      const before = Date.now();
      await login('admin@test.com', 'admin123');
      const after = Date.now();

      const inserted = mockRefreshTokensCollection.insertOne.mock.calls[0][0];
      const ms = (inserted.expiresAt as Date).getTime();
      expect(ms).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000);
      expect(ms).toBeLessThanOrEqual(after + 7 * 24 * 60 * 60 * 1000);
    });

    it('extends refresh-token TTL to 30 days when rememberMe is true', async () => {
      mockLoginAttemptsCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.findOne.mockResolvedValue(adminUser);
      mockRefreshTokensCollection.insertOne.mockResolvedValue({});
      mockLoginAttemptsCollection.deleteOne.mockResolvedValue({});

      const before = Date.now();
      await login('admin@test.com', 'admin123', true);
      const after = Date.now();

      const inserted = mockRefreshTokensCollection.insertOne.mock.calls[0][0];
      const ms = (inserted.expiresAt as Date).getTime();
      expect(ms).toBeGreaterThanOrEqual(before + 30 * 24 * 60 * 60 * 1000);
      expect(ms).toBeLessThanOrEqual(after + 30 * 24 * 60 * 60 * 1000);
      // Persisted on the document so rotation can carry it forward.
      expect(inserted.rememberMe).toBe(true);
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

    it('preserves the 30-day TTL across rotation for a rememberMe session', async () => {
      // Regression: rotation used to re-issue at the fixed 7-day default, so a
      // "mantener sesión 30 días" login silently decayed to 7 days on the first
      // token refresh (i.e. within ~15 minutes of logging in).
      const storedToken: RefreshToken = {
        _id: 'rt-remember',
        userId: 'admin-1',
        token: 'valid-refresh',
        expiresAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
        createdAt: now,
        rememberMe: true,
      };

      mockRefreshTokensCollection.findOne.mockResolvedValue(storedToken);
      mockRefreshTokensCollection.deleteOne.mockResolvedValue({});
      mockRefreshTokensCollection.insertOne.mockResolvedValue({});
      mockUsersCollection.findOne.mockResolvedValue(adminUser);

      const before = Date.now();
      await refresh('valid-refresh');
      const after = Date.now();

      const inserted = mockRefreshTokensCollection.insertOne.mock.calls[0][0];
      const ms = (inserted.expiresAt as Date).getTime();
      expect(ms).toBeGreaterThanOrEqual(before + 30 * 24 * 60 * 60 * 1000);
      expect(ms).toBeLessThanOrEqual(after + 30 * 24 * 60 * 60 * 1000);
      // The flag must survive so the *next* rotation keeps the window too.
      expect(inserted.rememberMe).toBe(true);
    });

    it('rotates a non-rememberMe session at the 7-day default', async () => {
      const storedToken: RefreshToken = {
        _id: 'rt-plain',
        userId: 'admin-1',
        token: 'valid-refresh',
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: now,
      };

      mockRefreshTokensCollection.findOne.mockResolvedValue(storedToken);
      mockRefreshTokensCollection.deleteOne.mockResolvedValue({});
      mockRefreshTokensCollection.insertOne.mockResolvedValue({});
      mockUsersCollection.findOne.mockResolvedValue(adminUser);

      const before = Date.now();
      await refresh('valid-refresh');
      const after = Date.now();

      const inserted = mockRefreshTokensCollection.insertOne.mock.calls[0][0];
      const ms = (inserted.expiresAt as Date).getTime();
      expect(ms).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000);
      expect(ms).toBeLessThanOrEqual(after + 7 * 24 * 60 * 60 * 1000);
      expect(inserted.rememberMe).toBe(false);
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

import type { TokenPayload, User } from '@kaipos/shared/types';
import {
  getUsersCollection,
  getRefreshTokensCollection,
  getLoginAttemptsCollection,
  getPasswordResetTokensCollection,
} from '../db/collections.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signAccessToken, generateRefreshToken } from '../lib/jwt.js';
import {
  REFRESH_TOKEN_TTL_DAYS,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MINUTES,
  PASSWORD_RESET_TTL_HOURS,
} from '../lib/auth-config.js';
import { UnauthorizedError, ForbiddenError, AppError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger({ module: 'auth-service' });

type SafeUser = Omit<User, 'passwordHash'>;

function stripPasswordHash(user: User): SafeUser {
  const { passwordHash: _, ...safe } = user;
  return safe;
}

export async function login(
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string; user: SafeUser }> {
  const loginAttempts = await getLoginAttemptsCollection();

  // Check rate limiting
  const attempt = await loginAttempts.findOne({ email });
  if (attempt?.lockedUntil && attempt.lockedUntil > new Date()) {
    throw new AppError(
      'Account temporarily locked due to too many failed login attempts',
      429,
      'ACCOUNT_LOCKED',
    );
  }

  const users = await getUsersCollection();
  const user = await users.findOne({ email });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    // Increment failed attempts
    await loginAttempts.updateOne(
      { email },
      {
        $inc: { attempts: 1 },
        $set: {
          lastAttemptAt: new Date(),
          lockedUntil:
            (attempt?.attempts ?? 0) + 1 >= MAX_LOGIN_ATTEMPTS
              ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
              : null,
        },
      },
      { upsert: true },
    );
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Account is deactivated');
  }

  // Reset login attempts on success
  await loginAttempts.deleteOne({ email });

  const payload: TokenPayload = {
    userId: user._id,
    businessId: user.businessId,
    role: user.role,
  };

  const accessToken = await signAccessToken(payload);
  const refreshToken = generateRefreshToken();

  // Store refresh token
  const refreshTokens = await getRefreshTokensCollection();
  await refreshTokens.insertOne({
    _id: crypto.randomUUID(),
    userId: user._id,
    token: refreshToken,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  });

  return { accessToken, refreshToken, user: stripPasswordHash(user) };
}

export async function register(
  adminUser: TokenPayload,
  data: {
    email: string;
    password: string;
    name: string;
    role: User['role'];
    branchIds?: string[];
  },
): Promise<SafeUser> {
  if (adminUser.role !== 'admin') {
    throw new ForbiddenError('Only admins can register new users');
  }

  const users = await getUsersCollection();

  // Check for duplicate email within the business
  const existing = await users.findOne({ email: data.email, businessId: adminUser.businessId });
  if (existing) {
    throw new AppError('A user with this email already exists', 409, 'DUPLICATE_EMAIL');
  }

  const now = new Date();
  const newUser: User = {
    _id: crypto.randomUUID(),
    businessId: adminUser.businessId,
    email: data.email,
    name: data.name,
    passwordHash: await hashPassword(data.password),
    role: data.role,
    branchIds: data.branchIds,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: adminUser.userId,
  };

  await users.insertOne(newUser);
  log.info({ userId: newUser._id, email: newUser.email }, 'User registered');

  return stripPasswordHash(newUser);
}

export async function refresh(
  refreshTokenValue: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const refreshTokens = await getRefreshTokensCollection();

  const stored = await refreshTokens.findOne({ token: refreshTokenValue });
  if (!stored) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (stored.expiresAt < new Date()) {
    await refreshTokens.deleteOne({ _id: stored._id });
    throw new UnauthorizedError('Refresh token expired');
  }

  // Look up the user to get current role/business
  const users = await getUsersCollection();
  const user = await users.findOne({ _id: stored.userId });
  if (!user || !user.isActive) {
    await refreshTokens.deleteOne({ _id: stored._id });
    throw new UnauthorizedError('User not found or deactivated');
  }

  // Rotate: delete old, issue new
  await refreshTokens.deleteOne({ _id: stored._id });

  const payload: TokenPayload = {
    userId: user._id,
    businessId: user.businessId,
    role: user.role,
  };

  const newAccessToken = await signAccessToken(payload);
  const newRefreshToken = generateRefreshToken();

  await refreshTokens.insertOne({
    _id: crypto.randomUUID(),
    userId: user._id,
    token: newRefreshToken,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshTokenValue: string): Promise<void> {
  const refreshTokens = await getRefreshTokensCollection();
  await refreshTokens.deleteOne({ token: refreshTokenValue });
}

export async function forgotPassword(email: string): Promise<void> {
  const users = await getUsersCollection();
  const user = await users.findOne({ email });

  // Always return success to prevent email enumeration
  if (!user) {
    log.info({ email }, 'Password reset requested for unknown email');
    return;
  }

  const token = crypto.randomUUID();
  const passwordResetTokens = await getPasswordResetTokensCollection();

  await passwordResetTokens.insertOne({
    _id: crypto.randomUUID(),
    userId: user._id,
    token,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000),
    createdAt: new Date(),
    usedAt: null,
  });

  // TODO: Send email via SES. For now, log the token.
  log.info({ userId: user._id, resetToken: token }, 'Password reset token generated');
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const passwordResetTokens = await getPasswordResetTokensCollection();

  const stored = await passwordResetTokens.findOne({ token });
  if (!stored) {
    throw new AppError('Invalid or expired reset token', 400, 'INVALID_RESET_TOKEN');
  }

  if (stored.expiresAt < new Date()) {
    throw new AppError('Reset token has expired', 400, 'EXPIRED_RESET_TOKEN');
  }

  if (stored.usedAt) {
    throw new AppError('Reset token has already been used', 400, 'USED_RESET_TOKEN');
  }

  const users = await getUsersCollection();
  const passwordHash = await hashPassword(newPassword);

  await users.updateOne({ _id: stored.userId }, { $set: { passwordHash, updatedAt: new Date() } });

  // Mark token as used
  await passwordResetTokens.updateOne({ _id: stored._id }, { $set: { usedAt: new Date() } });

  // Invalidate all refresh tokens to force re-login
  const refreshTokens = await getRefreshTokensCollection();
  await refreshTokens.deleteMany({ userId: stored.userId });

  log.info({ userId: stored.userId }, 'Password reset completed, all sessions invalidated');
}

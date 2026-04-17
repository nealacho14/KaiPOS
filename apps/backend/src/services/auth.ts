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
import { UnauthorizedError, AppError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import { sendPasswordResetEmail } from '../lib/ses.js';
import { logAuditEvent } from './audit.js';

const log = createLogger({ module: 'auth-service' });

type SafeUser = Omit<User, 'passwordHash'>;

function stripPasswordHash(user: User): SafeUser {
  const { passwordHash: _, ...safe } = user;
  return safe;
}

/**
 * Defensive cast for `user._id`. The codebase convention is UUID strings
 * (see `crypto.randomUUID()` on every insert), but records created
 * out-of-band — e.g. manual Atlas inserts — can end up with a Mongo
 * `ObjectId`. Downstream `$jsonSchema` validators require `createdBy`,
 * `userId`, etc. to be `string`, and a serialized ObjectId in a JWT
 * payload produces channel names like `user:[object Object]`. Calling
 * `String()` is a no-op for strings and returns the 24-char hex form for
 * ObjectIds.
 */
function idToString(id: unknown): string {
  return typeof id === 'string' ? id : String(id);
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
    // Atomically increment and check threshold using the post-update value
    const updated = await loginAttempts.findOneAndUpdate(
      { email },
      {
        // Convention: every collection uses a UUID-string `_id` (enforced by
        // the `$jsonSchema` validator). On upsert, Mongo would otherwise
        // auto-generate an ObjectId and fail validation.
        $setOnInsert: { _id: crypto.randomUUID() },
        $inc: { attempts: 1 },
        $set: { lastAttemptAt: new Date() },
      },
      { upsert: true, returnDocument: 'after' },
    );

    // Lock if threshold reached (uses the actual post-increment value)
    if (updated && updated.attempts >= MAX_LOGIN_ATTEMPTS) {
      await loginAttempts.updateOne(
        { email },
        { $set: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000) } },
      );
    }

    logAuditEvent({ action: 'login_failed', target: email });
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) {
    logAuditEvent({ action: 'login_failed', target: email, metadata: { reason: 'deactivated' } });
    throw new UnauthorizedError('Account is deactivated');
  }

  // Reset login attempts on success
  await loginAttempts.deleteOne({ email });

  const userId = idToString(user._id);
  const payload: TokenPayload = {
    userId,
    businessId: user.businessId,
    role: user.role,
    ...(user.branchIds !== undefined ? { branchIds: user.branchIds } : {}),
  };

  const accessToken = await signAccessToken(payload);
  const refreshToken = generateRefreshToken();

  // Store refresh token
  const refreshTokens = await getRefreshTokensCollection();
  await refreshTokens.insertOne({
    _id: crypto.randomUUID(),
    userId,
    token: refreshToken,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  });

  logAuditEvent({
    action: 'login',
    target: email,
    userId,
    businessId: user.businessId,
  });

  return { accessToken, refreshToken, user: stripPasswordHash(user) };
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

  const userId = idToString(user._id);
  const payload: TokenPayload = {
    userId,
    businessId: user.businessId,
    role: user.role,
    ...(user.branchIds !== undefined ? { branchIds: user.branchIds } : {}),
  };

  const newAccessToken = await signAccessToken(payload);
  const newRefreshToken = generateRefreshToken();

  await refreshTokens.insertOne({
    _id: crypto.randomUUID(),
    userId,
    token: newRefreshToken,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  });

  logAuditEvent({
    action: 'token_refresh',
    target: user.email,
    userId,
    businessId: user.businessId,
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshTokenValue: string): Promise<void> {
  const refreshTokens = await getRefreshTokensCollection();

  // Look up the token to get userId for the audit log before deleting
  const stored = await refreshTokens.findOne({ token: refreshTokenValue });
  await refreshTokens.deleteOne({ token: refreshTokenValue });

  if (stored) {
    logAuditEvent({ action: 'logout', target: stored.userId, userId: stored.userId });
  }
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
  const userId = idToString(user._id);

  await passwordResetTokens.insertOne({
    _id: crypto.randomUUID(),
    userId,
    token,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000),
    createdAt: new Date(),
    usedAt: null,
  });

  await sendPasswordResetEmail(email, token);

  logAuditEvent({
    action: 'password_reset_request',
    target: email,
    userId,
    businessId: user.businessId,
  });
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

  logAuditEvent({
    action: 'password_reset_complete',
    target: stored.userId,
    userId: stored.userId,
  });
}

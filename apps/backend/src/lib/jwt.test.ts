import { describe, it, expect, beforeEach } from 'vitest';
import type { TokenPayload } from '@kaipos/shared/types';
import { signAccessToken, verifyAccessToken, generateRefreshToken } from './jwt.js';

const testPayload: TokenPayload = {
  userId: 'user-1',
  businessId: 'biz-1',
  role: 'admin',
};

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret';
});

describe('jwt', () => {
  describe('signAccessToken + verifyAccessToken', () => {
    it('signs and verifies a token roundtrip', async () => {
      const token = await signAccessToken(testPayload);
      const decoded = await verifyAccessToken(token);

      expect(decoded.userId).toBe('user-1');
      expect(decoded.businessId).toBe('biz-1');
      expect(decoded.role).toBe('admin');
    });

    it('rejects a tampered token', async () => {
      const token = await signAccessToken(testPayload);
      const tampered = token.slice(0, -4) + 'XXXX';
      await expect(verifyAccessToken(tampered)).rejects.toThrow();
    });

    it('rejects a completely invalid token', async () => {
      await expect(verifyAccessToken('not-a-jwt')).rejects.toThrow();
    });
  });

  describe('generateRefreshToken', () => {
    it('returns a 64-char hex string', () => {
      const token = generateRefreshToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates unique tokens', () => {
      const t1 = generateRefreshToken();
      const t2 = generateRefreshToken();
      expect(t1).not.toBe(t2);
    });
  });
});

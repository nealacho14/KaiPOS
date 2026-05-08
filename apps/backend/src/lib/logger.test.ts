import { Writable } from 'node:stream';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function captureLogger(opts: pino.LoggerOptions) {
  const lines: string[] = [];
  const dest = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const log = pino(opts, dest);
  return { log, lines };
}

describe('logger', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.LOG_LEVEL;
  });

  describe('redact', () => {
    it('redacts top-level password', async () => {
      const { buildLoggerOptions } = await import('./logger.js');
      const { log, lines } = captureLogger(buildLoggerOptions());

      log.info({ password: 'super-secret' }, 'login attempt');

      const out = lines.join('');
      expect(out).toContain('"password":"[REDACTED]"');
      expect(out).not.toContain('super-secret');
    });

    it('redacts nested headers.authorization', async () => {
      const { buildLoggerOptions } = await import('./logger.js');
      const { log, lines } = captureLogger(buildLoggerOptions());

      log.info({ headers: { authorization: 'Bearer abc.def.ghi' } }, 'request');

      const out = lines.join('');
      expect(out).toContain('"authorization":"[REDACTED]"');
      expect(out).not.toContain('Bearer abc.def.ghi');
    });

    it('redacts passwordHash, token, accessToken, refreshToken, jwtSecret in nested objects', async () => {
      const { buildLoggerOptions } = await import('./logger.js');
      const { log, lines } = captureLogger(buildLoggerOptions());

      log.info(
        {
          user: {
            passwordHash: 'hash-value',
            token: 'tok-value',
            accessToken: 'access-value',
            refreshToken: 'refresh-value',
            jwtSecret: 'secret-value',
          },
        },
        'audit',
      );

      const out = lines.join('');
      expect(out).toContain('"passwordHash":"[REDACTED]"');
      expect(out).toContain('"token":"[REDACTED]"');
      expect(out).toContain('"accessToken":"[REDACTED]"');
      expect(out).toContain('"refreshToken":"[REDACTED]"');
      expect(out).toContain('"jwtSecret":"[REDACTED]"');
      for (const sensitive of [
        'hash-value',
        'tok-value',
        'access-value',
        'refresh-value',
        'secret-value',
      ]) {
        expect(out).not.toContain(sensitive);
      }
    });
  });

  describe('LOG_LEVEL', () => {
    it('uses LOG_LEVEL env var when set, overriding the production default', async () => {
      vi.stubEnv('LOG_LEVEL', 'debug');
      const { buildLoggerOptions } = await import('./logger.js');

      expect(buildLoggerOptions().level).toBe('debug');
    });

    it('falls back to "info" in production when LOG_LEVEL is unset', async () => {
      delete process.env.LOG_LEVEL;
      const { buildLoggerOptions } = await import('./logger.js');

      expect(buildLoggerOptions().level).toBe('info');
    });
  });
});

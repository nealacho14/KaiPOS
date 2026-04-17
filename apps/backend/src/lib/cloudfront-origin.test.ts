import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isCloudfrontOriginVerifyEnabled,
  verifyCloudfrontOriginHeader,
} from './cloudfront-origin.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isCloudfrontOriginVerifyEnabled', () => {
  it('returns false when CLOUDFRONT_SECRET is unset', () => {
    vi.stubEnv('CLOUDFRONT_SECRET', undefined);
    expect(isCloudfrontOriginVerifyEnabled()).toBe(false);
  });

  it('returns false when CLOUDFRONT_SECRET is empty', () => {
    vi.stubEnv('CLOUDFRONT_SECRET', '');
    expect(isCloudfrontOriginVerifyEnabled()).toBe(false);
  });

  it('returns true when CLOUDFRONT_SECRET is non-empty', () => {
    vi.stubEnv('CLOUDFRONT_SECRET', 'shh');
    expect(isCloudfrontOriginVerifyEnabled()).toBe(true);
  });
});

describe('verifyCloudfrontOriginHeader', () => {
  it('accepts any value (including undefined) when verification is disabled', () => {
    vi.stubEnv('CLOUDFRONT_SECRET', undefined);
    expect(verifyCloudfrontOriginHeader(undefined)).toBe(true);
    expect(verifyCloudfrontOriginHeader('anything')).toBe(true);
  });

  it('accepts an empty-string secret as disabled', () => {
    vi.stubEnv('CLOUDFRONT_SECRET', '');
    expect(verifyCloudfrontOriginHeader(undefined)).toBe(true);
    expect(verifyCloudfrontOriginHeader('anything')).toBe(true);
  });

  it('returns true when header matches the secret', () => {
    vi.stubEnv('CLOUDFRONT_SECRET', 'shh');
    expect(verifyCloudfrontOriginHeader('shh')).toBe(true);
  });

  it('returns false when header is missing while enabled', () => {
    vi.stubEnv('CLOUDFRONT_SECRET', 'shh');
    expect(verifyCloudfrontOriginHeader(undefined)).toBe(false);
  });

  it('returns false when header does not match', () => {
    vi.stubEnv('CLOUDFRONT_SECRET', 'shh');
    expect(verifyCloudfrontOriginHeader('wrong')).toBe(false);
  });
});

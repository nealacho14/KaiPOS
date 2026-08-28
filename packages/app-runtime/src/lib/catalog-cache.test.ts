import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCatalogCache } from './catalog-cache.js';
import { clearSession, setSelectedBusinessId, setSession } from './auth-storage.js';

const original = Reflect.getOwnPropertyDescriptor(globalThis, 'caches');

function stubCaches() {
  const del = vi.fn().mockResolvedValue(true);
  Object.defineProperty(globalThis, 'caches', {
    value: { delete: del },
    configurable: true,
    writable: true,
  });
  return del;
}

afterEach(() => {
  if (original) {
    Object.defineProperty(globalThis, 'caches', original);
  } else {
    Reflect.deleteProperty(globalThis, 'caches');
  }
  vi.restoreAllMocks();
});

describe('clearCatalogCache', () => {
  it('drops the catalog cache by name', () => {
    const del = stubCaches();

    clearCatalogCache();

    // Must match `CATALOG_CACHE` in apps/frontend-pos/pwa.config.ts.
    expect(del).toHaveBeenCalledWith('kaipos-catalog-v1');
  });

  it('is a no-op where CacheStorage is unavailable', () => {
    Reflect.deleteProperty(globalThis, 'caches');

    expect(() => clearCatalogCache()).not.toThrow();
  });

  it('swallows a rejected delete', async () => {
    Object.defineProperty(globalThis, 'caches', {
      value: { delete: vi.fn().mockRejectedValue(new Error('quota')) },
      configurable: true,
      writable: true,
    });

    expect(() => clearCatalogCache()).not.toThrow();
    await Promise.resolve();
  });
});

describe('catalog cache purging on identity change', () => {
  it('purges on logout, so a shared terminal does not leak the last catalog', () => {
    const del = stubCaches();

    clearSession();

    expect(del).toHaveBeenCalledWith('kaipos-catalog-v1');
  });

  it('purges when a super_admin switches business', () => {
    const del = stubCaches();

    setSelectedBusinessId('another-tenant');

    expect(del).toHaveBeenCalledWith('kaipos-catalog-v1');
  });

  it('does not purge on an ordinary session write', () => {
    const del = stubCaches();

    setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: {
        _id: 'u1',
        businessId: 'b1',
        email: 'a@b.com',
        name: 'A',
        role: 'cashier',
        isActive: true,
        branchIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
      },
    });

    expect(del).not.toHaveBeenCalled();
  });
});

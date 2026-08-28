/**
 * Name of the Workbox runtime cache holding catalog responses.
 * Must match `CATALOG_CACHE` in `apps/frontend-pos/pwa.config.ts`.
 */
const CATALOG_CACHE = 'kaipos-catalog-v1';

/**
 * Drops the cached catalog.
 *
 * Catalog requests carry an `Authorization` header, but the Cache API keys on
 * URL alone and the backend sends no `Vary: Authorization`. On a shared
 * terminal — the normal POS deployment — that means the next person to sign in
 * could be served the previous user's cached catalog, and a super_admin
 * switching business could be served the previous tenant's. Same-branch
 * colleagues seeing the same products is harmless; crossing a tenant boundary
 * is not.
 *
 * So this runs on logout and on business switch. It is deliberately
 * fire-and-forget and never throws: CacheStorage is absent in tests, in
 * private-mode browsers, and on any page served over plain HTTP.
 */
export function clearCatalogCache(): void {
  try {
    if (typeof caches === 'undefined') return;
    void caches.delete(CATALOG_CACHE).catch(() => {
      // Nothing actionable — a stale catalog is not worth surfacing an error.
    });
  } catch {
    // `caches` can throw on access in some hardened browser configurations.
  }
}

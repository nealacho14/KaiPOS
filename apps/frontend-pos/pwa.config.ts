import type { VitePWAOptions } from 'vite-plugin-pwa';

/** Runtime cache holding the last-seen catalog. Purged on identity change. */
export const CATALOG_CACHE = 'kaipos-catalog-v1';

/**
 * PWA configuration for the POS app, served under `/pos/` on the same
 * CloudFront origin as the admin SPA.
 *
 * Because the worker script itself is emitted at `/pos/sw.js`, its maximum
 * scope is `/pos/` — it physically cannot reach the admin app, and no
 * `Service-Worker-Allowed` header is needed. The reverse is not true, which is
 * why the admin config carries a `/pos` navigation denylist.
 *
 * `cacheId` differs from the admin app's for the same reason: one origin means
 * one CacheStorage, and identical Workbox cache names would collide.
 */
export const pwaOptions: Partial<VitePWAOptions> = {
  // A cashier must never have the app swap out mid-order, so updates wait for
  // an explicit confirmation.
  registerType: 'prompt',
  injectRegister: null,
  filename: 'sw.js',
  scope: '/pos/',
  includeAssets: ['icons/*.png'],
  manifest: {
    // Distinct from the admin app's `id`; two PWAs sharing one on the same
    // origin are treated as a single installable app.
    id: '/pos/',
    name: 'KaiPOS Punto de Venta',
    short_name: 'KaiPOS',
    description: 'Punto de venta KaiPOS: catálogo, órdenes y cobro en mostrador.',
    lang: 'es',
    dir: 'ltr',
    start_url: '/pos/',
    scope: '/pos/',
    display: 'standalone',
    // `any`, not `portrait`: the same install runs on a phone held upright and
    // on a counter tablet in landscape.
    orientation: 'any',
    theme_color: '#0B7A75',
    background_color: '#F7F7F5',
    icons: [
      { src: '/pos/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pos/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/pos/icons/maskable-icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  workbox: {
    // See the admin config: Workbox's defaults omit woff2, and the non-latin
    // subsets are never fetched by a Spanish UI.
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
    globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*'],
    // Must carry the `/pos/` prefix — the plugin does not infer it here, and
    // falling back to `/index.html` would serve the admin shell.
    navigateFallback: '/pos/index.html',
    navigateFallbackAllowlist: [/^\/pos\//],
    // Without this an offline `/api/*` call is answered with the SPA shell, so
    // the app parses HTML as JSON instead of surfacing a network error.
    navigateFallbackDenylist: [/^\/api\//],
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    skipWaiting: false,
    runtimeCaching: [
      {
        // Exact pathname equality, not a prefix match: `/api/products/:id`
        // feeds the edit form and must never be served stale.
        urlPattern: ({ url, request, sameOrigin }) =>
          Boolean(sameOrigin) &&
          request.method === 'GET' &&
          (url.pathname === '/api/products' || url.pathname === '/api/categories'),
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: CATALOG_CACHE,
          expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 },
          cacheableResponse: { statuses: [200] },
        },
      },
    ],
  },
};

import type { VitePWAOptions } from 'vite-plugin-pwa';

/**
 * PWA configuration for the admin app, served at the origin root.
 *
 * The admin and POS SPAs share one CloudFront origin, which makes two things
 * load-bearing here:
 *
 * 1. `navigateFallbackDenylist` must exclude `/pos`. This service worker is
 *    registered at scope `/`, so it controls `/pos/*` clients too — and a
 *    service worker intercepts *before* the network, so without the denylist a
 *    controlled client navigating to `/pos/` would be answered from the admin
 *    precache and never reach CloudFront. Visually this is indistinguishable
 *    from the cache-key collision fixed in 21aa3fa, and it would be
 *    misdiagnosed as one.
 *
 *    The pattern is `/^\/pos(\/|$)/`, not `/^\/pos\//`: bare `/pos` is handled
 *    by a 301 in `infra/lib/spa-router.js`, but that redirect lives at the edge
 *    and a service worker would short-circuit it.
 *
 * 2. `cacheId` must differ from the POS app's. Same origin means one shared
 *    CacheStorage, so identical Workbox cache names would have the two apps
 *    overwriting each other's precache — the same lesson as the CloudFront
 *    cache key, one layer up.
 */
export const pwaOptions: Partial<VitePWAOptions> = {
  // `prompt`, never `autoUpdate`: auto-updating calls skipWaiting and reloads
  // the page, which would discard a half-filled product form.
  registerType: 'prompt',
  // Registration happens from React (`src/pwa/PwaUpdater.tsx`) so the update
  // prompt can be wired to real UI.
  injectRegister: null,
  filename: 'sw.js',
  scope: '/',
  includeAssets: ['icons/*.png'],
  manifest: {
    // Distinct `id` per app is not cosmetic: two PWAs on one origin sharing an
    // id are treated as the same app, and only one of them can be installed.
    id: '/',
    name: 'KaiPOS Administración',
    short_name: 'KaiPOS Admin',
    description: 'Panel de administración de KaiPOS: catálogo, usuarios y sucursales.',
    lang: 'es',
    dir: 'ltr',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    // colors.primary[500] / the light surfaces.canvas in packages/ui.
    theme_color: '#0B7A75',
    background_color: '#F7F7F5',
    icons: [
      { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/maskable-icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  workbox: {
    // Workbox's default patterns omit `woff2`, which would silently drop the
    // self-hosted fonts from the precache and render the offline shell in a
    // system serif. The legacy `.woff` siblings are left out: every browser
    // that can run a service worker supports woff2.
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
    // Every font subset ships as its own file behind a `unicode-range`, so the
    // browser only ever fetches latin for a Spanish UI. Precaching the rest
    // would add ~200KB that is never used.
    globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/pos(\/|$)/, /^\/api\//],
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    // Paired with `registerType: 'prompt'` — the new worker waits until the
    // user accepts the update.
    skipWaiting: false,
  },
};

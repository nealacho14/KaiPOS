/**
 * Self-hosted webfonts, imported for side effects only.
 *
 * These used to be three `<link>` tags to fonts.googleapis.com in each app's
 * index.html. Self-hosting removes a render-blocking cross-origin stylesheet
 * from the critical path and — the reason it is mandatory here — makes the
 * fonts precacheable, so an offline or installed app does not fall back to a
 * system serif.
 *
 * Inter must be the *variable* build: `packages/ui/src/tokens/typography.ts`
 * uses weights 450, 550 and 650, which exist only on the `wght` axis. The
 * static build would silently round them and flatten the type scale.
 *
 * `wght.css` (not `index.css`) skips the optical-size axis we do not use.
 * Every subset is declared with a `unicode-range`, so browsers fetch only what
 * a page actually renders; the service worker precache is narrowed to the latin
 * subsets separately, in each app's Workbox `globIgnores`.
 */
import '@fontsource-variable/inter/wght.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';

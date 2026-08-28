/**
 * iOS safe-area insets, surfaced on the theme as `theme.safeArea`.
 *
 * These matter once the app is installed: with
 * `apple-mobile-web-app-status-bar-style: black-translucent` the web view runs
 * full-bleed, so a header pinned to the top would slide under the notch and a
 * bottom drawer under the home indicator.
 *
 * Each value carries a `0px` fallback, so they are inert in a normal browser
 * tab and on every non-notched device — safe to apply unconditionally.
 *
 * They live here rather than as hand-written `env()` strings in `sx` for the
 * same reason spacing does: apps should not write raw CSS values.
 */
export const safeArea = {
  top: 'env(safe-area-inset-top, 0px)',
  right: 'env(safe-area-inset-right, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)',
  left: 'env(safe-area-inset-left, 0px)',
} as const;

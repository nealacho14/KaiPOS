// Single source of truth for "are we running in the prod Lambda?" The CDK
// stack sets `NODE_ENV: config.stage` and `config.stage = 'prod'`, while the
// Node convention is `'production'` — accept both so a stricter `===` check
// in any one call-site doesn't silently fail open in prod (e.g. exposing
// dev-only endpoints behind CloudFront).
export const isProduction =
  process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod';

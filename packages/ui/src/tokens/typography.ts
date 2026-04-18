export const fontFamily = {
  sans: '"Inter", "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", "Roboto Mono", Menlo, Consolas, monospace',
} as const;

/**
 * Typographic scale used by `kaiPOSTheme`. Headings are absolute pixels for
 * deterministic rendering across surfaces. `body1/body2` turn on tabular-nums
 * + stylistic set 01 (alternate disambiguated zero/one/L) via
 * `font-feature-settings`. The `mono / money / moneyLg / moneyXl / orderId`
 * slots are custom variants declared via module augmentation.
 */
export const typeScale = {
  fontFamily: fontFamily.sans,
  htmlFontSize: 16,
  fontSize: 14,
  fontWeightLight: 400,
  fontWeightRegular: 450,
  fontWeightMedium: 550,
  fontWeightSemiBold: 600,
  fontWeightBold: 700,

  h1: {
    fontFamily: fontFamily.sans,
    fontSize: 44,
    lineHeight: 1.15,
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  h2: {
    fontFamily: fontFamily.sans,
    fontSize: 34,
    lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: '-0.015em',
  },
  h3: {
    fontFamily: fontFamily.sans,
    fontSize: 26,
    lineHeight: 1.25,
    fontWeight: 650,
    letterSpacing: '-0.01em',
  },
  h4: {
    fontFamily: fontFamily.sans,
    fontSize: 20,
    lineHeight: 1.3,
    fontWeight: 650,
    letterSpacing: '-0.005em',
  },
  h5: { fontFamily: fontFamily.sans, fontSize: 17, lineHeight: 1.35, fontWeight: 600 },
  h6: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    lineHeight: 1.4,
    fontWeight: 600,
    letterSpacing: '0.01em',
    textTransform: 'uppercase' as const,
  },

  subtitle1: { fontSize: 16, lineHeight: 1.5, fontWeight: 550 },
  subtitle2: { fontSize: 14, lineHeight: 1.45, fontWeight: 550 },

  body1: {
    fontSize: 15,
    lineHeight: 1.55,
    fontWeight: 450,
    fontFeatureSettings: '"cv11","ss01","tnum"',
  },
  body2: {
    fontSize: 13,
    lineHeight: 1.55,
    fontWeight: 450,
    fontFeatureSettings: '"cv11","ss01","tnum"',
  },

  button: {
    fontSize: 15,
    lineHeight: 1,
    fontWeight: 600,
    letterSpacing: '0.01em',
    textTransform: 'none' as const,
  },
  caption: { fontSize: 12, lineHeight: 1.4, fontWeight: 500, letterSpacing: '0.01em' },
  overline: {
    fontSize: 11,
    lineHeight: 1.3,
    fontWeight: 650,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },

  mono: {
    fontFamily: fontFamily.mono,
    fontSize: 14,
    lineHeight: 1.4,
    fontFeatureSettings: '"tnum","zero"',
  },
  money: {
    fontFamily: fontFamily.mono,
    fontSize: 16,
    lineHeight: 1.2,
    fontWeight: 600,
    fontFeatureSettings: '"tnum","zero"',
  },
  moneyLg: {
    fontFamily: fontFamily.mono,
    fontSize: 28,
    lineHeight: 1.1,
    fontWeight: 700,
    fontFeatureSettings: '"tnum","zero"',
    letterSpacing: '-0.01em',
  },
  moneyXl: {
    fontFamily: fontFamily.mono,
    fontSize: 44,
    lineHeight: 1.05,
    fontWeight: 700,
    fontFeatureSettings: '"tnum","zero"',
    letterSpacing: '-0.02em',
  },
  orderId: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    lineHeight: 1.2,
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
} as const;

/** Back-compat aliases for any remaining callers. */
export const fontSize = {
  xs: 12,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  '2xl': 26,
  '3xl': 34,
  '4xl': 44,
} as const;

export const fontWeight = {
  regular: 450,
  medium: 550,
  semibold: 600,
  bold: 700,
} as const;

export const lineHeight = {
  tight: 1.15,
  snug: 1.3,
  normal: 1.5,
  relaxed: 1.55,
} as const;

export const letterSpacing = {
  tighter: '-0.02em',
  tight: '-0.01em',
  normal: '0',
  wide: '0.01em',
  wider: '0.06em',
  widest: '0.08em',
} as const;

/**
 * MUI spacing unit is 4px. Call `theme.spacing(n)` for `n * 4px`. The named
 * scale below is here for places that want a raw token without going through
 * the theme (e.g. CSS-in-JS constants, storybook stories).
 *
 * Intentional scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96 — no 2, no 6.
 */
export const spacingUnit = 4;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

export { touch, touchTargets } from './touch.js';

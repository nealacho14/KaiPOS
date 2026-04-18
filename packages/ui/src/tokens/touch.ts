/**
 * Touch-target scale. `min` is the hard WCAG 2.5.5 floor.
 * Surfaced on the theme as `theme.posSize` via module augmentation.
 */
export const touch = {
  min: 48,
  pos: 56,
  kds: 64,
  desktop: 36,
  dense: 32,
} as const;

/** Back-compat name for legacy spacing imports. */
export const touchTargets = {
  minimum: touch.min,
  comfortable: touch.desktop,
  large: touch.pos,
  extraLarge: touch.kds,
} as const;

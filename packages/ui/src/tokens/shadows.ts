/**
 * Two-layer (ambient + directional) shadow scale. Focus ring is always brand
 * teal at 35% alpha. `inset` is used for pressed POS buttons.
 */
export const shadow = {
  none: 'none',
  xs: '0 1px 2px rgba(15,23,23,0.06), 0 1px 1px rgba(15,23,23,0.04)',
  sm: '0 2px 4px rgba(15,23,23,0.05), 0 2px 6px rgba(15,23,23,0.06)',
  md: '0 4px 8px rgba(15,23,23,0.06), 0 8px 16px rgba(15,23,23,0.08)',
  lg: '0 8px 16px rgba(15,23,23,0.08), 0 16px 32px rgba(15,23,23,0.10)',
  xl: '0 16px 32px rgba(15,23,23,0.10), 0 32px 64px rgba(15,23,23,0.14)',
  inset: 'inset 0 2px 4px rgba(15,23,23,0.08)',
  focus: '0 0 0 3px rgba(11,122,117,0.35)',
} as const;

/** Back-compat name for legacy imports. */
export const shadows = shadow;

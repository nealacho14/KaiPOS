/**
 * Border-radius scale from the kaiPOS design canon.
 *
 * - `xs` chips / tags
 * - `sm` small buttons, admin inputs
 * - `md` default cards, POS buttons (the theme's `shape.borderRadius`)
 * - `lg` modals, KDS order tickets
 * - `xl` marketing / online-store hero cards
 * - `pill` full-round badges, switches
 */
export const radius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

/** Back-compat name for legacy imports. */
export const borderRadius = radius;

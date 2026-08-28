import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

/**
 * The three layout modes kaiPOS designs for.
 *
 * - `phone`   — one column, the cart/sidebar collapses into a drawer.
 * - `tablet`  — iPad in portrait. Two panes, but narrower than desktop.
 * - `desktop` — laptops and iPad in landscape. Full two-pane layout.
 */
export type LayoutMode = 'phone' | 'tablet' | 'desktop';

/**
 * Minimum width for the tablet layout. Deliberately *not* a theme breakpoint:
 * `sm` (600) is too low — 600–719 is phone-in-landscape territory — and `md`
 * (960) is the desktop floor. 720 sits between them and admits a 768 px iPad.
 */
export const TABLET_MIN_WIDTH = 720;

/**
 * Minimum height for the tablet layout.
 *
 * Width alone is not enough to tell a tablet from a phone lying on its side: an
 * iPhone Pro Max in landscape is 932x430, which clears any sane width floor.
 * Handing it a two-pane layout would leave ~366 px of usable height under the
 * 64 px header. Requiring real vertical space is what separates the two.
 */
export const TABLET_MIN_HEIGHT = 600;

/**
 * Resolves the viewport to a named layout mode.
 *
 * Why this exists: every call site used to hand-roll the same two queries —
 * `up('md')` for "is desktop" and `down('sm')` for "is phone" — which left the
 * whole 600–959 band silently inheriting phone styling. A tablet in portrait is
 * 768 px wide, so the POS hid the cart in a drawer and the admin collapsed its
 * sidebar on a screen with room for both.
 *
 * Use this when the *component tree* differs between modes. For styling that
 * merely scales, prefer `sx` breakpoint objects — they are width-only, which is
 * fine for sizing but is exactly why they cannot express the height rule above.
 *
 * The theme breakpoints are untouched; this composes them.
 */
export function useLayoutMode(): LayoutMode {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const isTablet = useMediaQuery(
    `(min-width:${TABLET_MIN_WIDTH}px) and (min-height:${TABLET_MIN_HEIGHT}px)`,
  );

  if (isDesktop) return 'desktop';
  if (isTablet) return 'tablet';
  return 'phone';
}

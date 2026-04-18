import { createTheme, type Theme } from '@mui/material/styles';
import { radius } from '../tokens/radius.js';
import { shadow } from '../tokens/shadows.js';
import { spacingUnit } from '../tokens/spacing.js';
import { touch } from '../tokens/touch.js';
import { typeScale } from '../tokens/typography.js';
import { buildPalette } from './palette.js';
import { componentOverrides } from './componentOverrides.js';
import './augmentations.js';

/**
 * MUI's `shadows` array has 25 entries. The kaiPOS canon exposes 7 named
 * levels — we map them into the numeric array so legacy `elevation={n}`
 * usage still resolves to something sensible.
 */
const shadowsArray = [
  shadow.none,
  shadow.xs,
  shadow.xs,
  shadow.sm,
  shadow.sm,
  shadow.md,
  shadow.md,
  shadow.md,
  shadow.lg,
  shadow.lg,
  shadow.lg,
  shadow.lg,
  shadow.xl,
  shadow.xl,
  shadow.xl,
  shadow.xl,
  shadow.xl,
  shadow.xl,
  shadow.xl,
  shadow.xl,
  shadow.xl,
  shadow.xl,
  shadow.xl,
  shadow.xl,
  shadow.xl,
] as unknown as Theme['shadows'];

export const kaiPOSTheme = createTheme({
  cssVariables: {
    colorSchemeSelector: 'data-color-scheme',
  },
  colorSchemes: {
    light: { palette: buildPalette('light') },
    dark: { palette: buildPalette('dark') },
  },
  typography: typeScale,
  spacing: spacingUnit,
  shape: { borderRadius: radius.md },
  shadows: shadowsArray,
  breakpoints: {
    values: { xs: 0, sm: 600, md: 960, lg: 1280, xl: 1600 },
  },
  components: componentOverrides,

  // Custom tokens surfaced on theme.* for consumers — typed via augmentations.
  posSize: touch,
  radii: radius,
  shadowTokens: shadow,
});

export default kaiPOSTheme;

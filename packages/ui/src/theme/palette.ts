import { alpha, type PaletteMode, type PaletteOptions } from '@mui/material/styles';
import { brand } from '../tokens/colors.js';

/**
 * Builds the palette for a given color scheme. Emits MUI's built-in slots
 * (`primary`, `background`, `text`, `action`, …) plus the custom
 * `surfaces`, `textExt`, `kds`, `neutral` slots declared via module
 * augmentation. Called once per scheme by `kaiPOSTheme` and fed into
 * `colorSchemes: { light, dark }`.
 */
export function buildPalette(mode: PaletteMode): PaletteOptions {
  const isLight = mode === 'light';

  const surfaces = isLight
    ? {
        canvas: brand.slate[50],
        default: brand.slate[0],
        raised: brand.slate[0],
        sunken: brand.slate[100],
        overlay: '#FFFFFF',
        inverse: brand.slate[900],
        backdrop: alpha(brand.slate[900], 0.4),
      }
    : {
        canvas: brand.slate[950],
        default: brand.slate[900],
        raised: brand.slate[800],
        sunken: brand.slate[950],
        overlay: brand.slate[800],
        inverse: brand.slate[50],
        backdrop: alpha(brand.slate[950], 0.7),
      };

  const textExt = isLight
    ? {
        primary: brand.slate[900],
        secondary: brand.slate[600],
        tertiary: brand.slate[500],
        disabled: brand.slate[400],
        inverse: brand.slate[0],
      }
    : {
        primary: brand.slate[50],
        secondary: brand.slate[300],
        tertiary: brand.slate[400],
        disabled: brand.slate[500],
        inverse: brand.slate[900],
      };

  const divider = isLight ? alpha(brand.slate[900], 0.09) : alpha(brand.slate[50], 0.12);

  const kds = isLight
    ? {
        fired: brand.blue[500],
        cooking: brand.amber[400],
        ready: brand.green[500],
        overdue: brand.red[500],
        recalled: brand.slate[500],
        void: brand.slate[400],
      }
    : {
        fired: brand.blue[400],
        cooking: brand.amber[300],
        ready: brand.green[400],
        overdue: brand.red[400],
        recalled: brand.slate[400],
        void: brand.slate[500],
      };

  return {
    mode,

    primary: {
      main: brand.teal[500],
      light: brand.teal[400],
      dark: brand.teal[700],
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: brand.amber[400],
      light: brand.amber[300],
      dark: brand.amber[600],
      contrastText: '#1E1E1B',
    },
    error: {
      main: isLight ? brand.red[500] : brand.red[400],
      light: brand.red[400],
      dark: brand.red[700],
      contrastText: '#FFFFFF',
    },
    warning: {
      main: isLight ? brand.orange[500] : brand.orange[400],
      light: brand.orange[400],
      dark: brand.orange[600],
      contrastText: '#1E1E1B',
    },
    success: {
      main: isLight ? brand.green[500] : brand.green[400],
      light: brand.green[400],
      dark: brand.green[700],
      contrastText: '#FFFFFF',
    },
    info: {
      main: isLight ? brand.blue[500] : brand.blue[400],
      light: brand.blue[400],
      dark: brand.blue[700],
      contrastText: '#FFFFFF',
    },

    // Warm slate shows up in MUI's `grey` slot so legacy code (and MUI
    // internals that reach for `palette.grey[n]`) gets the canon neutrals.
    // The cast is because our scale has `0 / 750 / 950` that MUI's Color
    // type doesn't declare.
    grey: brand.slate as unknown as PaletteOptions['grey'],

    background: {
      default: surfaces.canvas,
      paper: surfaces.default,
    },
    text: {
      primary: textExt.primary,
      secondary: textExt.secondary,
      disabled: textExt.disabled,
      tertiary: textExt.tertiary,
      inverse: textExt.inverse,
    },
    divider,
    action: {
      active: isLight ? alpha(brand.slate[900], 0.7) : alpha(brand.slate[50], 0.8),
      hover: isLight ? alpha(brand.slate[900], 0.04) : alpha(brand.slate[50], 0.06),
      hoverOpacity: isLight ? 0.04 : 0.06,
      selected: isLight ? alpha(brand.teal[500], 0.08) : alpha(brand.teal[400], 0.16),
      selectedOpacity: isLight ? 0.08 : 0.16,
      disabled: isLight ? alpha(brand.slate[900], 0.26) : alpha(brand.slate[50], 0.3),
      disabledBackground: isLight ? alpha(brand.slate[900], 0.08) : alpha(brand.slate[50], 0.08),
      focus: alpha(brand.teal[500], 0.25),
      focusOpacity: 0.25,
    },

    neutral: {
      main: isLight ? brand.slate[600] : brand.slate[300],
      light: isLight ? brand.slate[400] : brand.slate[500],
      dark: isLight ? brand.slate[800] : brand.slate[100],
      contrastText: isLight ? '#FFFFFF' : brand.slate[900],
    },
    surfaces,
    textExt,
    kds,
  };
}

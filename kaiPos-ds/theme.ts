/**
 * kaiPOS — Material UI Theme
 * ----------------------------------------------------------------------------
 * A single createTheme() export that powers all six kaiPOS surfaces:
 *   1. POS Terminal (touch)
 *   2. Kitchen Display System — KDS (touch, high-contrast)
 *   3. Waiter mobile app
 *   4. Customer ordering PWA (QR)
 *   5. Admin dashboard (desktop)
 *   6. Online store
 *
 * Design principles
 *   • Touch-first: minimum 48px hit targets, 56/64 for primary POS actions
 *   • Clarity over decoration: flat surfaces, deliberate elevation, zero gradients
 *   • Numerically legible: tabular-nums everywhere money or counts appear
 *   • WCAG AA on every text/surface pairing (4.5:1 body, 3:1 large text)
 *   • Works in daylight windows AND a 3am dish-pit with splashed screens
 *
 * Usage
 *   import { kaiPosTheme } from './theme';
 *   const theme = kaiPosTheme('light');        // or 'dark'
 *   <ThemeProvider theme={theme}>…</ThemeProvider>
 *
 * Module augmentation is declared at the bottom so custom tokens
 * (theme.posSize, theme.surfaces, etc.) are strongly typed.
 */

import { createTheme, alpha, PaletteMode, Theme, ThemeOptions } from '@mui/material/styles';

// ---------------------------------------------------------------------------
// 1. PRIMITIVES — raw color / size values, not consumed by components directly
// ---------------------------------------------------------------------------

const brand = {
  // Primary: deep teal. Trust + hospitality. Reads distinct from fintech blue.
  teal: {
    50: '#E6F2F1',
    100: '#C2DFDD',
    200: '#8FC3BF',
    300: '#5CA6A1',
    400: '#2E8B85',
    500: '#0B7A75', // base
    600: '#086560',
    700: '#06504C',
    800: '#043B38',
    900: '#022623',
  },
  // Secondary: warm amber. CTAs, highlights, "fire" moments in KDS.
  amber: {
    50: '#FDF2E6',
    100: '#FADFC2',
    200: '#F4BC84',
    300: '#EE9F55',
    400: '#E8833A', // base
    500: '#D46F26',
    600: '#B0591C',
    700: '#8A4514',
    800: '#63310D',
    900: '#3E1E06',
  },
  // Neutrals: warm slate — not pure grey, leans 2° warm to match hospitality context
  slate: {
    0: '#FFFFFF',
    50: '#F7F7F5',
    100: '#EEEEEB',
    200: '#DEDEDA',
    300: '#C4C4BE',
    400: '#9A9A93',
    500: '#6E6E67',
    600: '#4E4E48',
    700: '#38383300', // will be overridden — placeholder
    750: '#2A2A26',
    800: '#1E1E1B',
    900: '#141412',
    950: '#0A0A09',
  },
  // Semantic — tuned to hit AA on both light + dark surfaces
  red: { 50: '#FDECEC', 400: '#E5484D', 500: '#CE2C31', 600: '#B22125', 700: '#8E1A1D' },
  orange: { 50: '#FEF0E6', 400: '#F76B15', 500: '#E25A05', 600: '#BB4A03' },
  green: { 50: '#E8F5EC', 400: '#2FA84F', 500: '#1F8A3D', 600: '#176B2F', 700: '#0F4F22' },
  blue: { 50: '#E8F1FC', 400: '#3B82F6', 500: '#2563EB', 600: '#1D4ED8', 700: '#1E40AF' },
};
// patch the warm-slate 700 (the 0-suffix above was intentional to catch typos)
brand.slate[700] = '#383833';

// Touch-target scale. min is hard floor for accessibility.
const touch = {
  min: 48, // absolute minimum (WCAG 2.5.5)
  pos: 56, // default POS Terminal button
  kds: 64, // KDS — gloved fingers, splashes, hurry
  desktop: 36, // Admin mouse/trackpad
  dense: 32, // Tables, chips inside tables
};

// ---------------------------------------------------------------------------
// 2. TYPOGRAPHY
//    Inter for UI (tabular numerics), JetBrains Mono for prices & order IDs.
//    Caller is responsible for loading these — we reference fallbacks.
// ---------------------------------------------------------------------------

const fontSans =
  '"Inter", "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const fontMono = '"JetBrains Mono", "SF Mono", "Roboto Mono", Menlo, Consolas, monospace';

// Perfect-fourth-ish scale, tuned so 14/16 are the workhorses and display
// sizes are big enough to read across a 15" POS terminal from arm's length.
const typeScale = {
  fontFamily: fontSans,
  fontFamilyMono: fontMono,
  // Base UI sizing — deliberately restrained; density matters in admin tables
  htmlFontSize: 16,
  fontSize: 14,
  fontWeightLight: 400,
  fontWeightRegular: 450, // Inter's 450 reads better on screens than 400
  fontWeightMedium: 550,
  fontWeightSemiBold: 600,
  fontWeightBold: 700,

  // Headings — numbers are px for determinism across surfaces
  h1: {
    fontFamily: fontSans,
    fontSize: 44,
    lineHeight: 1.15,
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  h2: {
    fontFamily: fontSans,
    fontSize: 34,
    lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: '-0.015em',
  },
  h3: {
    fontFamily: fontSans,
    fontSize: 26,
    lineHeight: 1.25,
    fontWeight: 650,
    letterSpacing: '-0.01em',
  },
  h4: {
    fontFamily: fontSans,
    fontSize: 20,
    lineHeight: 1.3,
    fontWeight: 650,
    letterSpacing: '-0.005em',
  },
  h5: { fontFamily: fontSans, fontSize: 17, lineHeight: 1.35, fontWeight: 600 },
  h6: {
    fontFamily: fontSans,
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

  // Custom — money & order numbers. Consumers read as theme.typography.mono
  mono: {
    fontFamily: fontMono,
    fontSize: 14,
    lineHeight: 1.4,
    fontFeatureSettings: '"tnum","zero"',
  },
  money: {
    fontFamily: fontMono,
    fontSize: 16,
    lineHeight: 1.2,
    fontWeight: 600,
    fontFeatureSettings: '"tnum","zero"',
  },
  moneyLg: {
    fontFamily: fontMono,
    fontSize: 28,
    lineHeight: 1.1,
    fontWeight: 700,
    fontFeatureSettings: '"tnum","zero"',
    letterSpacing: '-0.01em',
  },
  moneyXl: {
    fontFamily: fontMono,
    fontSize: 44,
    lineHeight: 1.05,
    fontWeight: 700,
    fontFeatureSettings: '"tnum","zero"',
    letterSpacing: '-0.02em',
  },
  orderId: {
    fontFamily: fontMono,
    fontSize: 13,
    lineHeight: 1.2,
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
};

// ---------------------------------------------------------------------------
// 3. SPACING, RADIUS, SHADOW
// ---------------------------------------------------------------------------

// MUI spacing unit = 4px. Call theme.spacing(n) for n*4px.
// Intentional scale: 4,8,12,16,20,24,32,40,48,64,80,96 — no 2px, no 6px.
const spacingUnit = 4;

const radius = {
  xs: 4, // chips, tags
  sm: 6, // small buttons, inputs on admin
  md: 10, // default cards, POS buttons
  lg: 14, // modals, KDS order tickets
  xl: 20, // marketing / online-store hero cards
  pill: 999,
};

// Shadows — soft, physically plausible. No colored shadows, no neon glow.
// Uses two-layer technique: ambient + directional.
const shadow = {
  none: 'none',
  xs: '0 1px 2px rgba(15,23,23,0.06), 0 1px 1px rgba(15,23,23,0.04)',
  sm: '0 2px 4px rgba(15,23,23,0.05), 0 2px 6px rgba(15,23,23,0.06)',
  md: '0 4px 8px rgba(15,23,23,0.06), 0 8px 16px rgba(15,23,23,0.08)',
  lg: '0 8px 16px rgba(15,23,23,0.08), 0 16px 32px rgba(15,23,23,0.10)',
  xl: '0 16px 32px rgba(15,23,23,0.10), 0 32px 64px rgba(15,23,23,0.14)',
  // Inset — used for pressed POS buttons
  inset: 'inset 0 2px 4px rgba(15,23,23,0.08)',
  // Focus ring — 3px, same on light + dark, always brand teal
  focus: `0 0 0 3px ${alpha(brand.teal[500], 0.35)}`,
};

// MUI wants a 25-entry array. We map our named scale to its numeric one.
const buildMuiShadowArray = (): Theme['shadows'] => {
  const s = [
    'none', // 0
    shadow.xs, // 1
    shadow.xs, // 2
    shadow.sm, // 3
    shadow.sm, // 4
    shadow.md, // 5
    shadow.md, // 6
    shadow.md, // 7
    shadow.lg, // 8
    shadow.lg, // 9
    shadow.lg, // 10
    shadow.lg, // 11
    shadow.xl, // 12
    shadow.xl, // 13
    shadow.xl, // 14
    shadow.xl, // 15
    shadow.xl, // 16
    shadow.xl, // 17
    shadow.xl, // 18
    shadow.xl, // 19
    shadow.xl, // 20
    shadow.xl, // 21
    shadow.xl, // 22
    shadow.xl, // 23
    shadow.xl, // 24
  ];
  return s as unknown as Theme['shadows'];
};

// ---------------------------------------------------------------------------
// 4. PALETTE BUILDERS — light + dark share semantic role names
// ---------------------------------------------------------------------------

const buildPalette = (mode: PaletteMode) => {
  const isLight = mode === 'light';

  // Surface stack — keep 5 explicit levels so components can compose depth
  // without relying on box-shadow alone (critical on touch screens where
  // ambient glare washes shadows out).
  const surfaces = isLight
    ? {
        canvas: brand.slate[50], // app background behind everything
        default: brand.slate[0], // cards, panels
        raised: brand.slate[0], // same as default but with shadow
        sunken: brand.slate[100], // table row hovers, inline wells
        overlay: '#FFFFFF', // modals, popovers
        inverse: brand.slate[900], // tooltips, snackbars on light mode
      }
    : {
        canvas: brand.slate[950],
        default: brand.slate[900],
        raised: brand.slate[800],
        sunken: brand.slate[950],
        overlay: brand.slate[800],
        inverse: brand.slate[50],
      };

  const divider = isLight ? alpha(brand.slate[900], 0.09) : alpha(brand.slate[50], 0.12);

  const text = isLight
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

    // MUI's built-in slots
    background: {
      default: surfaces.canvas,
      paper: surfaces.default,
    },
    text: {
      primary: text.primary,
      secondary: text.secondary,
      disabled: text.disabled,
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

    // Custom slots — typed via module augmentation below
    grey: brand.slate as unknown as Theme['palette']['grey'],
    neutral: {
      main: isLight ? brand.slate[600] : brand.slate[300],
      light: isLight ? brand.slate[400] : brand.slate[500],
      dark: isLight ? brand.slate[800] : brand.slate[100],
      contrastText: isLight ? '#FFFFFF' : brand.slate[900],
    },
    surfaces,
    textExt: text,

    // KDS-specific roles — order states get their own semantic color
    kds: isLight
      ? {
          fired: brand.blue[500], // just sent from POS
          cooking: brand.amber[400], // in progress
          ready: brand.green[500], // waiting for pickup
          overdue: brand.red[500], // past SLA — flashes
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
        },
  };
};

// ---------------------------------------------------------------------------
// 5. COMPONENT OVERRIDES — tuned per-surface density
// ---------------------------------------------------------------------------

const buildComponents = (mode: PaletteMode): ThemeOptions['components'] => {
  const isLight = mode === 'light';

  return {
    // ------- Global baseline ------------------------------------------------
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          colorScheme: mode,
        },
        'html, body': {
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'optimizeLegibility',
        },
        // Tabular numerics wherever money / quantities appear
        '.tabular, [data-tabular]': { fontVariantNumeric: 'tabular-nums' },
        // POS + KDS: disable text selection on non-input UI — prevents
        // accidental selection from palm touches
        '[data-touch-surface] *:not(input):not(textarea)': {
          userSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
        },
        // Remove iOS tap flash
        'button, a': { WebkitTapHighlightColor: 'transparent' },
      },
    },

    // ------- Buttons — THE critical POS component ---------------------------
    MuiButton: {
      defaultProps: {
        disableElevation: true,
        disableRipple: false,
      },
      styleOverrides: {
        root: ({ theme }) => ({
          fontWeight: 600,
          textTransform: 'none',
          borderRadius: radius.md,
          minHeight: touch.desktop,
          paddingInline: theme.spacing(4),
          transition: 'background-color 120ms ease, box-shadow 120ms ease, transform 80ms ease',
          '&:focus-visible': { boxShadow: shadow.focus },
          '&:active:not([disabled])': { transform: 'translateY(1px)' },
        }),
        // Size slots — used by MuiButton size='small' / default / 'large'
        sizeSmall: {
          minHeight: touch.dense,
          fontSize: 13,
          paddingInline: 12,
          borderRadius: radius.sm,
        },
        sizeMedium: {
          minHeight: touch.desktop,
          fontSize: 14,
        },
        sizeLarge: {
          minHeight: touch.min, // 48px — the touch baseline
          fontSize: 15,
          paddingInline: 20,
        },
        // Variants
        contained: ({ theme }) => ({
          boxShadow: shadow.xs,
          '&:hover': { boxShadow: shadow.sm },
          '&:active': { boxShadow: shadow.inset },
          '&.Mui-disabled': {
            backgroundColor: theme.palette.action.disabledBackground,
            color: theme.palette.action.disabled,
          },
        }),
        outlined: ({ theme }) => ({
          borderWidth: 1.5,
          '&:hover': { borderWidth: 1.5, backgroundColor: theme.palette.action.hover },
        }),
        text: {
          paddingInline: 12,
        },
      },
      variants: [
        // POS Terminal primary — 56px
        {
          props: { size: 'pos' as any },
          style: {
            minHeight: touch.pos,
            fontSize: 17,
            fontWeight: 650,
            paddingInline: 24,
            borderRadius: radius.md,
          },
        },
        // KDS — 64px, gloved-finger scale
        {
          props: { size: 'kds' as any },
          style: {
            minHeight: touch.kds,
            fontSize: 19,
            fontWeight: 650,
            paddingInline: 28,
            borderRadius: radius.lg,
          },
        },
        // Tile button — square grid buttons (menu items on POS)
        {
          props: { variant: 'tile' as any },
          style: ({ theme }: any) => ({
            minHeight: 96,
            borderRadius: radius.md,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: shadow.xs,
            textAlign: 'left',
            '&:hover': { boxShadow: shadow.sm, backgroundColor: theme.palette.action.hover },
            '&:active': { boxShadow: shadow.inset, transform: 'translateY(1px)' },
          }),
        },
        // Danger / void button — e.g. VOID ORDER on POS
        {
          props: { variant: 'danger' as any },
          style: ({ theme }: any) => ({
            backgroundColor: theme.palette.error.main,
            color: theme.palette.error.contrastText,
            '&:hover': { backgroundColor: theme.palette.error.dark },
          }),
        },
      ],
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: radius.sm,
          minWidth: touch.desktop,
          minHeight: touch.desktop,
          '&:focus-visible': { boxShadow: shadow.focus },
        },
        sizeSmall: { minWidth: touch.dense, minHeight: touch.dense },
        sizeLarge: { minWidth: touch.min, minHeight: touch.min },
      },
    },

    MuiButtonBase: {
      defaultProps: { disableRipple: false },
    },

    // ------- Cards ---------------------------------------------------------
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: radius.md,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: theme.palette.background.paper,
          backgroundImage: 'none',
          overflow: 'hidden',
        }),
      },
      variants: [
        {
          props: { variant: 'raised' as any },
          style: ({ theme }: any) => ({
            border: 'none',
            boxShadow: shadow.md,
            backgroundColor: theme.palette.background.paper,
          }),
        },
        // KDS order ticket
        {
          props: { variant: 'ticket' as any },
          style: ({ theme }: any) => ({
            borderRadius: radius.lg,
            border: `2px solid ${theme.palette.divider}`,
            boxShadow: shadow.sm,
            backgroundColor: theme.palette.background.paper,
          }),
        },
      ],
    },
    MuiCardHeader: {
      styleOverrides: {
        root: { padding: 20, paddingBottom: 12 },
        title: { fontSize: 17, fontWeight: 650, letterSpacing: '-0.005em' },
        subheader: { fontSize: 13, marginTop: 2 },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: { padding: 20, '&:last-child': { paddingBottom: 20 } },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' }, // MUI's dark-mode tint — off
        rounded: { borderRadius: radius.md },
      },
    },

    // ------- Inputs --------------------------------------------------------
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'medium' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: radius.sm,
          backgroundColor: theme.palette.background.paper,
          transition: 'box-shadow 120ms ease, border-color 120ms ease',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: theme.palette.divider,
            transition: 'border-color 120ms ease',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: isLight ? brand.slate[400] : brand.slate[500],
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: theme.palette.primary.main,
            borderWidth: 1.5,
          },
          '&.Mui-focused': { boxShadow: shadow.focus },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': {
            borderColor: theme.palette.error.main,
          },
        }),
        input: {
          paddingBlock: 12,
          paddingInline: 14,
          fontSize: 15,
          '&::placeholder': { opacity: 1, color: isLight ? brand.slate[400] : brand.slate[500] },
        },
        sizeSmall: {
          '& .MuiOutlinedInput-input': { paddingBlock: 8, paddingInline: 12, fontSize: 14 },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { fontSize: 14, fontWeight: 550 },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: { marginInline: 2, fontSize: 12, marginTop: 6 },
      },
    },

    // ------- Tables (admin dashboard) --------------------------------------
    MuiTable: {
      styleOverrides: {
        root: { borderCollapse: 'separate', borderSpacing: 0 },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: ({ theme }) => ({
          '& .MuiTableCell-root': {
            backgroundColor: isLight ? brand.slate[50] : brand.slate[800],
            color: theme.palette.text.secondary,
            fontSize: 11,
            fontWeight: 650,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            borderBottom: `1px solid ${theme.palette.divider}`,
            paddingBlock: 10,
          },
        }),
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderBottom: `1px solid ${theme.palette.divider}`,
          paddingBlock: 12,
          paddingInline: 16,
          fontSize: 14,
          color: theme.palette.text.primary,
        }),
        head: { paddingBlock: 10 },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: ({ theme }) => ({
          transition: 'background-color 100ms ease',
          '&:hover': { backgroundColor: theme.palette.action.hover },
          '&.Mui-selected': {
            backgroundColor: alpha(theme.palette.primary.main, isLight ? 0.06 : 0.14),
            '&:hover': { backgroundColor: alpha(theme.palette.primary.main, isLight ? 0.1 : 0.18) },
          },
          '&:last-of-type .MuiTableCell-root': { borderBottom: 'none' },
        }),
      },
    },

    // ------- Modals / Dialogs ---------------------------------------------
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: radius.lg,
          boxShadow: shadow.xl,
          border: isLight ? 'none' : `1px solid ${theme.palette.divider}`,
          backgroundImage: 'none',
        }),
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: 20,
          fontWeight: 650,
          letterSpacing: '-0.01em',
          padding: 24,
          paddingBottom: 12,
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: { padding: 24, paddingBlock: 12 },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: { padding: 20, gap: 8 },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: isLight ? alpha(brand.slate[900], 0.4) : alpha(brand.slate[950], 0.7),
          backdropFilter: 'blur(4px)',
        },
      },
    },

    // ------- Chips --------------------------------------------------------
    MuiChip: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: radius.xs,
          fontWeight: 600,
          fontSize: 12,
          height: 24,
          paddingInline: 2,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: isLight ? brand.slate[50] : brand.slate[800],
          color: theme.palette.text.secondary,
        }),
        sizeMedium: { height: 28, fontSize: 13 },
        label: { paddingInline: 10 },
        // Colored variants — soft tinted surfaces for readability on light bg
        colorPrimary: ({ theme }) => ({
          backgroundColor: alpha(theme.palette.primary.main, isLight ? 0.1 : 0.2),
          color: isLight ? theme.palette.primary.dark : theme.palette.primary.light,
          borderColor: alpha(theme.palette.primary.main, 0.25),
        }),
        colorSuccess: ({ theme }) => ({
          backgroundColor: alpha(theme.palette.success.main, isLight ? 0.12 : 0.2),
          color: isLight ? theme.palette.success.dark : theme.palette.success.light,
          borderColor: alpha(theme.palette.success.main, 0.25),
        }),
        colorError: ({ theme }) => ({
          backgroundColor: alpha(theme.palette.error.main, isLight ? 0.1 : 0.2),
          color: isLight ? theme.palette.error.dark : theme.palette.error.light,
          borderColor: alpha(theme.palette.error.main, 0.25),
        }),
        colorWarning: ({ theme }) => ({
          backgroundColor: alpha(theme.palette.warning.main, isLight ? 0.15 : 0.2),
          color: isLight ? theme.palette.warning.dark : theme.palette.warning.light,
          borderColor: alpha(theme.palette.warning.main, 0.3),
        }),
        colorInfo: ({ theme }) => ({
          backgroundColor: alpha(theme.palette.info.main, isLight ? 0.1 : 0.2),
          color: isLight ? theme.palette.info.dark : theme.palette.info.light,
          borderColor: alpha(theme.palette.info.main, 0.25),
        }),
      },
    },

    // ------- Tabs ---------------------------------------------------------
    MuiTabs: {
      styleOverrides: {
        root: ({ theme }) => ({
          minHeight: touch.desktop + 8,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }),
        indicator: ({ theme }) => ({
          height: 3,
          borderRadius: '3px 3px 0 0',
          backgroundColor: theme.palette.primary.main,
        }),
      },
    },
    MuiTab: {
      styleOverrides: {
        root: ({ theme }) => ({
          textTransform: 'none',
          fontWeight: 600,
          fontSize: 14,
          minHeight: touch.min,
          minWidth: 0,
          padding: '10px 16px',
          color: theme.palette.text.secondary,
          transition: 'color 120ms ease',
          '&:hover': { color: theme.palette.text.primary },
          '&.Mui-selected': { color: theme.palette.primary.main },
          '&:focus-visible': { boxShadow: shadow.focus, borderRadius: radius.sm },
        }),
      },
    },

    // ------- Sidebar navigation (Drawer + List) ---------------------------
    MuiDrawer: {
      styleOverrides: {
        paper: ({ theme }) => ({
          backgroundColor: isLight ? brand.slate[0] : brand.slate[900],
          borderRight: `1px solid ${theme.palette.divider}`,
          backgroundImage: 'none',
        }),
      },
    },
    MuiList: {
      styleOverrides: {
        root: { padding: 8 },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: radius.sm,
          minHeight: touch.min,
          paddingInline: 12,
          marginBlock: 2,
          color: theme.palette.text.secondary,
          gap: 12,
          transition: 'background-color 100ms ease, color 100ms ease',
          '&:hover': {
            backgroundColor: theme.palette.action.hover,
            color: theme.palette.text.primary,
          },
          '&.Mui-selected': {
            backgroundColor: alpha(theme.palette.primary.main, isLight ? 0.1 : 0.18),
            color: isLight ? theme.palette.primary.dark : theme.palette.primary.light,
            '& .MuiListItemIcon-root': {
              color: isLight ? theme.palette.primary.main : theme.palette.primary.light,
            },
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, isLight ? 0.14 : 0.22),
            },
          },
          '&:focus-visible': { boxShadow: shadow.focus },
        }),
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: ({ theme }) => ({
          minWidth: 0,
          marginRight: 0,
          color: theme.palette.text.tertiary ?? theme.palette.text.secondary,
        }),
      },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: { fontSize: 14, fontWeight: 550 },
        secondary: { fontSize: 12 },
      },
    },

    // ------- Snackbars / Alerts ------------------------------------------
    MuiSnackbar: {
      defaultProps: { autoHideDuration: 4000 },
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: radius.md,
          backgroundColor: theme.palette.surfaces?.inverse ?? brand.slate[900],
          color: theme.palette.text.inverse ?? '#FFF',
          fontSize: 14,
          fontWeight: 550,
          padding: '12px 16px',
          boxShadow: shadow.lg,
          minHeight: touch.min,
        }),
      },
    },
    MuiAlert: {
      defaultProps: { variant: 'standard' },
      styleOverrides: {
        root: {
          borderRadius: radius.md,
          padding: '12px 16px',
          fontSize: 14,
          alignItems: 'center',
          border: '1px solid transparent',
        },
        standardSuccess: ({ theme }) => ({
          backgroundColor: alpha(theme.palette.success.main, isLight ? 0.1 : 0.18),
          color: isLight ? theme.palette.success.dark : theme.palette.success.light,
          borderColor: alpha(theme.palette.success.main, 0.25),
          '& .MuiAlert-icon': { color: theme.palette.success.main },
        }),
        standardError: ({ theme }) => ({
          backgroundColor: alpha(theme.palette.error.main, isLight ? 0.1 : 0.18),
          color: isLight ? theme.palette.error.dark : theme.palette.error.light,
          borderColor: alpha(theme.palette.error.main, 0.25),
          '& .MuiAlert-icon': { color: theme.palette.error.main },
        }),
        standardWarning: ({ theme }) => ({
          backgroundColor: alpha(theme.palette.warning.main, isLight ? 0.14 : 0.2),
          color: isLight ? theme.palette.warning.dark : theme.palette.warning.light,
          borderColor: alpha(theme.palette.warning.main, 0.3),
          '& .MuiAlert-icon': { color: theme.palette.warning.main },
        }),
        standardInfo: ({ theme }) => ({
          backgroundColor: alpha(theme.palette.info.main, isLight ? 0.1 : 0.18),
          color: isLight ? theme.palette.info.dark : theme.palette.info.light,
          borderColor: alpha(theme.palette.info.main, 0.25),
          '& .MuiAlert-icon': { color: theme.palette.info.main },
        }),
      },
    },

    // ------- Miscellaneous touch niceties ---------------------------------
    MuiTooltip: {
      styleOverrides: {
        tooltip: ({ theme }) => ({
          backgroundColor: theme.palette.surfaces?.inverse ?? brand.slate[900],
          color: theme.palette.text.inverse ?? '#FFF',
          fontSize: 12,
          fontWeight: 550,
          borderRadius: radius.sm,
          padding: '6px 10px',
        }),
        arrow: ({ theme }) => ({
          color: theme.palette.surfaces?.inverse ?? brand.slate[900],
        }),
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: ({ theme }) => ({ borderColor: theme.palette.divider }),
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: { padding: 8 },
        switchBase: ({ theme }) => ({
          '&.Mui-checked': {
            color: theme.palette.primary.main,
            '& + .MuiSwitch-track': {
              backgroundColor: theme.palette.primary.main,
              opacity: 1,
            },
          },
        }),
        track: ({ theme }) => ({
          borderRadius: 22 / 2,
          backgroundColor: isLight ? brand.slate[300] : brand.slate[700],
          opacity: 1,
        }),
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: ({ theme }) => ({
          color: theme.palette.divider,
          '&.Mui-checked': { color: theme.palette.primary.main },
          '&:focus-visible': { boxShadow: shadow.focus, borderRadius: radius.xs },
        }),
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: ({ theme }) => ({
          height: 6,
          borderRadius: 3,
          backgroundColor: isLight ? brand.slate[100] : brand.slate[800],
        }),
        bar: { borderRadius: 3 },
      },
    },
  };
};

// ---------------------------------------------------------------------------
// 6. PUBLIC FACTORY
// ---------------------------------------------------------------------------

export const kaiPosTheme = (mode: PaletteMode = 'light'): Theme =>
  createTheme({
    palette: buildPalette(mode) as any,
    typography: typeScale as any,
    spacing: spacingUnit,
    shape: { borderRadius: radius.md },
    shadows: buildMuiShadowArray(),
    breakpoints: {
      values: {
        xs: 0, // phones (waiter, customer PWA)
        sm: 600, // large phones / small tablets
        md: 960, // POS Terminal portrait
        lg: 1280, // POS landscape, admin laptop
        xl: 1600, // admin 24"+, KDS
      },
    },
    components: buildComponents(mode),

    // Custom tokens surfaced on theme.* for consumers
    posSize: touch,
    radii: radius,
    shadowTokens: shadow,
  } as ThemeOptions);

export default kaiPosTheme;

// Named token exports — for places where createTheme is overkill
// (e.g. Storybook stories, email templates, native wrapper app)
export const tokens = {
  brand,
  touch,
  radius,
  shadow,
  typography: typeScale,
  spacing: spacingUnit,
};

// ---------------------------------------------------------------------------
// 7. TypeScript MODULE AUGMENTATION
// ---------------------------------------------------------------------------

declare module '@mui/material/styles' {
  interface Palette {
    neutral: Palette['primary'];
    surfaces: {
      canvas: string;
      default: string;
      raised: string;
      sunken: string;
      overlay: string;
      inverse: string;
    };
    textExt: {
      primary: string;
      secondary: string;
      tertiary: string;
      disabled: string;
      inverse: string;
    };
    kds: {
      fired: string;
      cooking: string;
      ready: string;
      overdue: string;
      recalled: string;
      void: string;
    };
  }
  interface PaletteOptions {
    neutral?: PaletteOptions['primary'];
    surfaces?: Palette['surfaces'];
    textExt?: Palette['textExt'];
    kds?: Palette['kds'];
  }
  interface TypeText {
    tertiary?: string;
    inverse?: string;
  }
  interface TypographyVariants {
    mono: React.CSSProperties;
    money: React.CSSProperties;
    moneyLg: React.CSSProperties;
    moneyXl: React.CSSProperties;
    orderId: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    mono?: React.CSSProperties;
    money?: React.CSSProperties;
    moneyLg?: React.CSSProperties;
    moneyXl?: React.CSSProperties;
    orderId?: React.CSSProperties;
  }
  interface Theme {
    posSize: typeof touch;
    radii: typeof radius;
    shadowTokens: typeof shadow;
  }
  interface ThemeOptions {
    posSize?: typeof touch;
    radii?: typeof radius;
    shadowTokens?: typeof shadow;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    mono: true;
    money: true;
    moneyLg: true;
    moneyXl: true;
    orderId: true;
  }
}

declare module '@mui/material/Button' {
  interface ButtonPropsSizeOverrides {
    pos: true;
    kds: true;
  }
  interface ButtonPropsVariantOverrides {
    tile: true;
    danger: true;
  }
}

declare module '@mui/material/Card' {
  interface CardPropsVariantOverrides {
    raised: true;
    ticket: true;
  }
}

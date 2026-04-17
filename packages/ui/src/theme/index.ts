import { createTheme, type ThemeOptions } from '@mui/material/styles';
import { colors } from '../tokens/colors.js';
import { borderRadius } from '../tokens/radius.js';
import { shadows } from '../tokens/shadows.js';
import { fontFamily } from '../tokens/typography.js';
import { componentOverrides } from './componentOverrides.js';

const typography: ThemeOptions['typography'] = {
  fontFamily: fontFamily.sans,
  h1: { fontWeight: 700, fontSize: '3rem', lineHeight: 1.2, letterSpacing: '-0.02em' },
  h2: { fontWeight: 700, fontSize: '2.25rem', lineHeight: 1.25, letterSpacing: '-0.01em' },
  h3: { fontWeight: 600, fontSize: '1.875rem', lineHeight: 1.3 },
  h4: { fontWeight: 600, fontSize: '1.5rem', lineHeight: 1.35 },
  h5: { fontWeight: 600, fontSize: '1.25rem', lineHeight: 1.4 },
  h6: { fontWeight: 600, fontSize: '1rem', lineHeight: 1.5 },
  body1: { fontSize: '1rem', lineHeight: 1.6 },
  body2: { fontSize: '0.875rem', lineHeight: 1.6 },
  subtitle1: { fontSize: '1rem', fontWeight: 500, lineHeight: 1.5 },
  subtitle2: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.5 },
  caption: { fontSize: '0.75rem', lineHeight: 1.5 },
  overline: {
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    lineHeight: 1.5,
  },
  button: {
    fontWeight: 600,
    fontSize: '0.875rem',
    textTransform: 'none',
    letterSpacing: '0.01em',
  },
};

const lightPalette = {
  primary: {
    ...colors.primary,
    main: colors.primary[500],
    light: colors.primary[400],
    dark: colors.primary[700],
    contrastText: '#FFFFFF',
  },
  secondary: {
    ...colors.secondary,
    main: colors.secondary[500],
    light: colors.secondary[300],
    dark: colors.secondary[800],
    contrastText: '#1A1A1A',
  },
  success: { ...colors.success, contrastText: '#FFFFFF' },
  warning: { ...colors.warning, contrastText: '#1A1A1A' },
  error: { ...colors.error, contrastText: '#FFFFFF' },
  info: { ...colors.info, contrastText: '#FFFFFF' },
  grey: colors.grey,
  background: {
    default: colors.background.light.default,
    paper: colors.background.light.paper,
  },
  text: colors.text.light,
  divider: colors.border.light,
};

const darkPalette = {
  primary: {
    ...colors.primary,
    main: colors.primary[400],
    light: colors.primary[300],
    dark: colors.primary[600],
    contrastText: '#0A0F14',
  },
  secondary: {
    ...colors.secondary,
    main: colors.secondary[300],
    light: colors.secondary[200],
    dark: colors.secondary[500],
    contrastText: '#1A1A1A',
  },
  success: { ...colors.success, contrastText: '#1A1A1A' },
  warning: { ...colors.warning, contrastText: '#1A1A1A' },
  error: { ...colors.error, contrastText: '#1A1A1A' },
  info: { ...colors.info, contrastText: '#1A1A1A' },
  grey: colors.grey,
  background: {
    default: colors.background.dark.default,
    paper: colors.background.dark.paper,
  },
  text: colors.text.dark,
  divider: colors.border.dark,
};

export const kaiPOSTheme = createTheme({
  cssVariables: {
    colorSchemeSelector: 'data-color-scheme',
  },
  colorSchemes: {
    light: { palette: lightPalette },
    dark: { palette: darkPalette },
  },
  typography,
  shape: { borderRadius: borderRadius.md },
  shadows: [
    'none',
    shadows.xs,
    shadows.sm,
    shadows.sm,
    shadows.md,
    shadows.md,
    shadows.md,
    shadows.md,
    shadows.lg,
    shadows.lg,
    shadows.lg,
    shadows.lg,
    shadows.lg,
    shadows.lg,
    shadows.lg,
    shadows.lg,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows['2xl'],
    shadows['2xl'],
  ],
  components: componentOverrides,
});

export default kaiPOSTheme;

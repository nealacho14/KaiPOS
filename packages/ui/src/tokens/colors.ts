/**
 * Brand primitives — raw color values for the kaiPOS design canon.
 *
 * - `teal` is the primary: deep teal, trust + hospitality. Distinct from fintech blue.
 * - `amber` is the secondary: warm amber, used for CTAs and "fire" moments in KDS.
 * - `slate` is a warm neutral (leans 2° warm) tuned for hospitality context.
 * - `red / orange / green / blue` are semantics tuned for WCAG AA on both schemes.
 */
export const brand = {
  teal: {
    50: '#E6F2F1',
    100: '#C2DFDD',
    200: '#8FC3BF',
    300: '#5CA6A1',
    400: '#2E8B85',
    500: '#0B7A75',
    600: '#086560',
    700: '#06504C',
    800: '#043B38',
    900: '#022623',
  },
  amber: {
    50: '#FDF2E6',
    100: '#FADFC2',
    200: '#F4BC84',
    300: '#EE9F55',
    400: '#E8833A',
    500: '#D46F26',
    600: '#B0591C',
    700: '#8A4514',
    800: '#63310D',
    900: '#3E1E06',
  },
  slate: {
    0: '#FFFFFF',
    50: '#F7F7F5',
    100: '#EEEEEB',
    200: '#DEDEDA',
    300: '#C4C4BE',
    400: '#9A9A93',
    500: '#6E6E67',
    600: '#4E4E48',
    700: '#383833',
    750: '#2A2A26',
    800: '#1E1E1B',
    900: '#141412',
    950: '#0A0A09',
  },
  red: { 50: '#FDECEC', 400: '#E5484D', 500: '#CE2C31', 600: '#B22125', 700: '#8E1A1D' },
  orange: { 50: '#FEF0E6', 400: '#F76B15', 500: '#E25A05', 600: '#BB4A03' },
  green: { 50: '#E8F5EC', 400: '#2FA84F', 500: '#1F8A3D', 600: '#176B2F', 700: '#0F4F22' },
  blue: { 50: '#E8F1FC', 400: '#3B82F6', 500: '#2563EB', 600: '#1D4ED8', 700: '#1E40AF' },
} as const;

/**
 * Legacy token surface consumed by existing components (`KaiPOSLogo`) and
 * older theme code. Derived from `brand` so there's a single source of truth:
 * primary ≡ teal, secondary ≡ amber, grey ≡ warm slate.
 */
export const colors = {
  primary: brand.teal,
  secondary: brand.amber,
  grey: brand.slate,
  success: { light: brand.green[400], main: brand.green[500], dark: brand.green[700] },
  warning: { light: brand.orange[400], main: brand.orange[500], dark: brand.orange[600] },
  error: { light: brand.red[400], main: brand.red[500], dark: brand.red[700] },
  info: { light: brand.blue[400], main: brand.blue[500], dark: brand.blue[700] },
  background: {
    light: { default: brand.slate[50], paper: brand.slate[0], elevated: brand.slate[0] },
    dark: { default: brand.slate[950], paper: brand.slate[900], elevated: brand.slate[800] },
  },
  text: {
    light: { primary: brand.slate[900], secondary: brand.slate[600], disabled: brand.slate[400] },
    dark: { primary: brand.slate[50], secondary: brand.slate[300], disabled: brand.slate[500] },
  },
  border: { light: 'rgba(20,20,18,0.09)', dark: 'rgba(247,247,245,0.12)' },
} as const;

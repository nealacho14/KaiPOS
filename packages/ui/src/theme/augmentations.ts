/**
 * Module augmentation for the kaiPOS theme. Extends MUI's palette, typography,
 * and component-prop types so consumers get autocomplete + type-safety on
 * custom tokens (`theme.posSize`, `theme.radii`, `<Button size="pos">`, etc.).
 */
import type { CSSProperties } from 'react';
import type { touch } from '../tokens/touch.js';
import type { radius } from '../tokens/radius.js';
import type { shadow } from '../tokens/shadows.js';

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
      backdrop: string;
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
    mono: CSSProperties;
    money: CSSProperties;
    moneyLg: CSSProperties;
    moneyXl: CSSProperties;
    orderId: CSSProperties;
  }
  interface TypographyVariantsOptions {
    mono?: CSSProperties;
    money?: CSSProperties;
    moneyLg?: CSSProperties;
    moneyXl?: CSSProperties;
    orderId?: CSSProperties;
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

// MUI v7's Card component inherits the `variant` prop from Paper — so the
// variants config in the theme is typed against `PaperPropsVariantOverrides`.
declare module '@mui/material/Paper' {
  interface PaperPropsVariantOverrides {
    raised: true;
    ticket: true;
  }
}

export {};

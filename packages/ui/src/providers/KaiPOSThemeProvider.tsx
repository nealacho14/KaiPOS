import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, type Theme } from '@mui/material/styles';
import { type ReactNode } from 'react';
import { kaiPOSTheme } from '../theme/index.js';

export interface KaiPOSThemeProviderProps {
  children: ReactNode;
  /**
   * Override the default theme. Useful for Storybook or tests.
   */
  theme?: Theme;
  /**
   * If true, skip rendering CssBaseline. Default false.
   */
  disableCssBaseline?: boolean;
}

export function KaiPOSThemeProvider({
  children,
  theme = kaiPOSTheme,
  disableCssBaseline = false,
}: KaiPOSThemeProviderProps) {
  return (
    <ThemeProvider theme={theme} defaultMode="system">
      {!disableCssBaseline && <CssBaseline />}
      {children}
    </ThemeProvider>
  );
}

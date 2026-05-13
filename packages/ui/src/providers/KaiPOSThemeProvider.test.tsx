import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createTheme } from '@mui/material/styles';
import { KaiPOSThemeProvider } from './KaiPOSThemeProvider.js';

describe('KaiPOSThemeProvider', () => {
  it('renders children inside the theme provider with CssBaseline by default', () => {
    render(
      <KaiPOSThemeProvider>
        <p>hello</p>
      </KaiPOSThemeProvider>,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('supports disabling CssBaseline', () => {
    render(
      <KaiPOSThemeProvider disableCssBaseline>
        <p>world</p>
      </KaiPOSThemeProvider>,
    );
    expect(screen.getByText('world')).toBeInTheDocument();
  });

  it('accepts a custom theme override (useful for stories/tests)', () => {
    const customTheme = createTheme({ cssVariables: true });
    render(
      <KaiPOSThemeProvider theme={customTheme} disableCssBaseline>
        <p>custom</p>
      </KaiPOSThemeProvider>,
    );
    expect(screen.getByText('custom')).toBeInTheDocument();
  });
});

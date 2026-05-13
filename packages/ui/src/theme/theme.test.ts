import { describe, expect, it } from 'vitest';
import { radius } from '../tokens/radius.js';
import { touch } from '../tokens/touch.js';
import { shadow } from '../tokens/shadows.js';
import { kaiPOSTheme } from './index.js';

describe('kaiPOSTheme', () => {
  it('exposes the kaiPOS custom token surfaces on the theme', () => {
    expect(kaiPOSTheme.posSize).toEqual(touch);
    expect(kaiPOSTheme.radii).toEqual(radius);
    expect(kaiPOSTheme.shadowTokens).toEqual(shadow);
  });

  it('uses radius.md as shape.borderRadius', () => {
    expect(kaiPOSTheme.shape.borderRadius).toBe(radius.md);
  });

  it('configures responsive breakpoints from xs..xl', () => {
    expect(kaiPOSTheme.breakpoints.values).toEqual({
      xs: 0,
      sm: 600,
      md: 960,
      lg: 1280,
      xl: 1600,
    });
  });

  it('emits a 25-entry shadows array mapping into kaiPOS named levels', () => {
    expect(kaiPOSTheme.shadows).toHaveLength(25);
    expect(kaiPOSTheme.shadows[0]).toBe(shadow.none);
    expect(kaiPOSTheme.shadows[1]).toBe(shadow.xs);
    expect(kaiPOSTheme.shadows[24]).toBe(shadow.xl);
  });

  it('exposes both light + dark color schemes', () => {
    const { colorSchemes } = kaiPOSTheme as unknown as {
      colorSchemes: { light: { palette: { mode: string } }; dark: { palette: { mode: string } } };
    };
    expect(colorSchemes.light.palette.mode).toBe('light');
    expect(colorSchemes.dark.palette.mode).toBe('dark');
  });

  it('registers component overrides for the kaiPOS canon', () => {
    expect(kaiPOSTheme.components?.MuiButton).toBeDefined();
    expect(kaiPOSTheme.components?.MuiCard).toBeDefined();
    expect(kaiPOSTheme.components?.MuiDialog).toBeDefined();
  });
});

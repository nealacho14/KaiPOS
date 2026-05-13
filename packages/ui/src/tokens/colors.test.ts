import { describe, expect, it } from 'vitest';
import { brand, colors } from './colors.js';

describe('tokens/colors', () => {
  it('exposes brand primitives with the canonical teal/amber/slate scales', () => {
    expect(brand.teal[500]).toBe('#0B7A75');
    expect(brand.amber[400]).toBe('#E8833A');
    expect(brand.slate[0]).toBe('#FFFFFF');
    expect(brand.slate[900]).toBe('#141412');
    expect(brand.slate[950]).toBe('#0A0A09');
  });

  it('exposes semantic palettes tuned for WCAG AA', () => {
    expect(brand.red[500]).toBeDefined();
    expect(brand.green[500]).toBeDefined();
    expect(brand.blue[500]).toBeDefined();
    expect(brand.orange[500]).toBeDefined();
  });

  it('derives the legacy `colors` surface from brand', () => {
    expect(colors.primary).toBe(brand.teal);
    expect(colors.secondary).toBe(brand.amber);
    expect(colors.grey).toBe(brand.slate);
    expect(colors.success.main).toBe(brand.green[500]);
    expect(colors.warning.main).toBe(brand.orange[500]);
    expect(colors.error.main).toBe(brand.red[500]);
    expect(colors.info.main).toBe(brand.blue[500]);
  });

  it('provides light + dark background / text / border surfaces', () => {
    expect(colors.background.light.default).toBe(brand.slate[50]);
    expect(colors.background.dark.default).toBe(brand.slate[950]);
    expect(colors.text.light.primary).toBe(brand.slate[900]);
    expect(colors.text.dark.primary).toBe(brand.slate[50]);
    expect(colors.border.light).toMatch(/rgba\(/);
    expect(colors.border.dark).toMatch(/rgba\(/);
  });
});

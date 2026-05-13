import { describe, expect, it } from 'vitest';
import { brand } from '../tokens/colors.js';
import { buildPalette } from './palette.js';

describe('buildPalette', () => {
  describe('light mode', () => {
    const palette = buildPalette('light');

    it('emits the canonical kaiPOS slots', () => {
      expect(palette.mode).toBe('light');
      expect(palette.primary).toMatchObject({ main: brand.teal[500] });
      expect(palette.secondary).toMatchObject({ main: brand.amber[400] });
    });

    it('builds light surfaces / textExt / divider / kds slots', () => {
      expect(palette.surfaces?.canvas).toBe(brand.slate[50]);
      expect(palette.surfaces?.default).toBe(brand.slate[0]);
      expect(palette.surfaces?.inverse).toBe(brand.slate[900]);
      expect(palette.textExt?.primary).toBe(brand.slate[900]);
      expect(palette.textExt?.disabled).toBe(brand.slate[400]);
      expect(palette.kds?.fired).toBe(brand.blue[500]);
      expect(palette.kds?.cooking).toBe(brand.amber[400]);
      expect(palette.kds?.ready).toBe(brand.green[500]);
      expect(palette.divider).toMatch(/rgba\(/);
    });

    it('uses the warmth-leaning slate as the `grey` slot', () => {
      const grey = palette.grey as unknown as Record<string | number, string>;
      expect(grey[500]).toBe(brand.slate[500]);
    });

    it('emits action + neutral channels for light mode', () => {
      expect(palette.action?.hoverOpacity).toBeCloseTo(0.04);
      expect(palette.action?.selectedOpacity).toBeCloseTo(0.08);
      expect(palette.neutral).toMatchObject({ contrastText: '#FFFFFF' });
    });
  });

  describe('dark mode', () => {
    const palette = buildPalette('dark');

    it('builds dark surfaces / textExt / kds slots', () => {
      expect(palette.mode).toBe('dark');
      expect(palette.surfaces?.canvas).toBe(brand.slate[950]);
      expect(palette.surfaces?.inverse).toBe(brand.slate[50]);
      expect(palette.textExt?.primary).toBe(brand.slate[50]);
      expect(palette.kds?.fired).toBe(brand.blue[400]);
      expect(palette.kds?.cooking).toBe(brand.amber[300]);
      expect(palette.kds?.ready).toBe(brand.green[400]);
    });

    it('uses higher hover / selected opacities for dark mode', () => {
      expect(palette.action?.hoverOpacity).toBeCloseTo(0.06);
      expect(palette.action?.selectedOpacity).toBeCloseTo(0.16);
    });

    it('emits dark-mode neutral with slate[100] dark and slate[900] contrastText', () => {
      expect(palette.neutral).toMatchObject({
        dark: brand.slate[100],
        contrastText: brand.slate[900],
      });
    });

    it('uses the brighter dark-mode error / warning / success / info shades', () => {
      expect(palette.error).toMatchObject({ main: brand.red[400] });
      expect(palette.warning).toMatchObject({ main: brand.orange[400] });
      expect(palette.success).toMatchObject({ main: brand.green[400] });
      expect(palette.info).toMatchObject({ main: brand.blue[400] });
    });
  });
});

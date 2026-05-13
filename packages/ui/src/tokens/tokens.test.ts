import { describe, expect, it } from 'vitest';
import {
  fontFamily,
  typeScale,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
} from './typography.js';
import { spacing, spacingUnit } from './spacing.js';
import { touch, touchTargets } from './touch.js';
import { radius, borderRadius } from './radius.js';
import { shadow, shadows } from './shadows.js';
import { zIndex } from './zIndex.js';

describe('tokens/typography', () => {
  it('declares sans + mono font families', () => {
    expect(fontFamily.sans).toContain('Inter');
    expect(fontFamily.mono).toContain('JetBrains Mono');
  });

  it('declares the headline + body type scale with custom money slots', () => {
    expect(typeScale.fontFamily).toBe(fontFamily.sans);
    expect(typeScale.h1.fontSize).toBe(44);
    expect(typeScale.body1.fontFeatureSettings).toContain('tnum');
    expect(typeScale.money.fontFamily).toBe(fontFamily.mono);
    expect(typeScale.orderId.fontFamily).toBe(fontFamily.mono);
  });

  it('exposes legacy size / weight / line-height / letter-spacing scales', () => {
    expect(fontSize.base).toBe(15);
    expect(fontWeight.bold).toBe(700);
    expect(lineHeight.normal).toBe(1.5);
    expect(letterSpacing.normal).toBe('0');
  });
});

describe('tokens/spacing', () => {
  it('uses a 4px base unit and a Tailwind-ish named scale', () => {
    expect(spacingUnit).toBe(4);
    expect(spacing[0]).toBe(0);
    expect(spacing[4]).toBe(16);
    expect(spacing[24]).toBe(96);
  });
});

describe('tokens/touch', () => {
  it('exposes the WCAG floor and POS/KDS comfort sizes', () => {
    expect(touch.min).toBe(48);
    expect(touch.pos).toBe(56);
    expect(touch.kds).toBe(64);
  });

  it('mirrors values into the legacy touchTargets alias', () => {
    expect(touchTargets.minimum).toBe(touch.min);
    expect(touchTargets.comfortable).toBe(touch.desktop);
    expect(touchTargets.large).toBe(touch.pos);
    expect(touchTargets.extraLarge).toBe(touch.kds);
  });
});

describe('tokens/radius', () => {
  it('exposes the canonical radius scale and a borderRadius alias', () => {
    expect(radius.md).toBe(10);
    expect(radius.pill).toBe(999);
    expect(borderRadius).toBe(radius);
  });
});

describe('tokens/shadows', () => {
  it('exposes the ambient + focus + inset shadow tokens', () => {
    expect(shadow.none).toBe('none');
    expect(shadow.focus).toContain('rgba(11,122,117');
    expect(shadow.inset).toMatch(/^inset/);
    expect(shadows).toBe(shadow);
  });
});

describe('tokens/zIndex', () => {
  it('puts tooltips above toasts above modals', () => {
    expect(zIndex.modal).toBeLessThan(zIndex.toast);
    expect(zIndex.toast).toBeLessThan(zIndex.tooltip);
    expect(zIndex.hide).toBeLessThan(zIndex.base);
  });
});

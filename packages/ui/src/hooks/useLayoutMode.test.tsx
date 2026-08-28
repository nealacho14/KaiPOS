import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { KaiPOSThemeProvider } from '../providers/index.js';
import { resetViewport, setViewport, VIEWPORT } from '../testing/index.js';
import { useLayoutMode } from './useLayoutMode.js';

afterEach(resetViewport);

// The provider is not optional: bare `useTheme()` falls back to MUI's default
// theme, whose `md` is 900 — kaiPOS overrides it to 960. Without the wrapper
// every assertion between those two widths silently tests the wrong breakpoint.
function wrapper({ children }: { children: ReactNode }) {
  return <KaiPOSThemeProvider>{children}</KaiPOSThemeProvider>;
}

function modeAt(width: number, height: number) {
  setViewport({ width, height });
  return renderHook(() => useLayoutMode(), { wrapper }).result.current;
}

describe('useLayoutMode', () => {
  it('reports phone on a handset in portrait', () => {
    expect(modeAt(VIEWPORT.phone.width, VIEWPORT.phone.height)).toBe('phone');
  });

  it('reports phone for a large handset in landscape', () => {
    // 932x430 clears any sane width floor but has no vertical room for a
    // two-pane layout. This is the case the height clause exists for.
    const { width, height } = VIEWPORT.phoneLandscape;
    expect(modeAt(width, height)).toBe('phone');
  });

  it('reports tablet for an iPad in portrait', () => {
    const { width, height } = VIEWPORT.tabletPortrait;
    expect(modeAt(width, height)).toBe('tablet');
  });

  it('reports tablet for a 10-inch Android tablet in portrait', () => {
    expect(modeAt(800, 1280)).toBe('tablet');
  });

  it('reports desktop for an iPad in landscape', () => {
    const { width, height } = VIEWPORT.tabletLandscape;
    expect(modeAt(width, height)).toBe('desktop');
  });

  it('reports desktop on a laptop', () => {
    expect(modeAt(VIEWPORT.desktop.width, VIEWPORT.desktop.height)).toBe('desktop');
  });

  // Boundaries get one case each: Testing Library only unmounts between tests,
  // so two `renderHook` calls in a single test share a mounted subscription and
  // the second would read the first's viewport.
  it('stays on tablet one pixel below the desktop floor', () => {
    expect(modeAt(959, 1200)).toBe('tablet');
  });

  it('switches to desktop exactly at the md breakpoint', () => {
    expect(modeAt(960, 1200)).toBe('desktop');
  });

  it('stays on phone one pixel below the tablet width', () => {
    expect(modeAt(719, 1024)).toBe('phone');
  });

  it('reaches tablet exactly at the tablet width', () => {
    expect(modeAt(720, 1024)).toBe('tablet');
  });

  it('stays on phone one pixel below the tablet height', () => {
    expect(modeAt(768, 599)).toBe('phone');
  });

  it('reaches tablet exactly at the tablet height', () => {
    expect(modeAt(768, 600)).toBe('tablet');
  });
});

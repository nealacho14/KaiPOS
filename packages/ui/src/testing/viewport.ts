/**
 * Test-only viewport control. Not exported from the package root — import from
 * `@kaipos/ui/testing` so it never reaches an application bundle.
 *
 * happy-dom implements a real media-query engine that evaluates `min-width` /
 * `min-height` against the window, so responsive branches can be driven for
 * real instead of stubbing `matchMedia`.
 */

interface HappyDOMWindow {
  happyDOM?: { setViewport: (viewport: { width: number; height: number }) => void };
}

/** happy-dom's own default, restored between tests so suites stay independent. */
export const DEFAULT_VIEWPORT = { width: 1024, height: 768 } as const;

/** Common device sizes, so tests read as intent rather than magic numbers. */
export const VIEWPORT = {
  phone: { width: 375, height: 812 },
  phoneLandscape: { width: 932, height: 430 },
  tabletPortrait: { width: 768, height: 1024 },
  tabletLandscape: { width: 1024, height: 768 },
  desktop: { width: 1440, height: 900 },
} as const;

/**
 * Resizes the happy-dom window. Any component rendered afterwards sees the new
 * size; already-mounted trees are not re-rendered, so call this before `render`.
 */
export function setViewport(size: { width: number; height: number }): void {
  const happyDOM = (window as Window & HappyDOMWindow).happyDOM;
  if (!happyDOM) {
    throw new Error('setViewport requires the happy-dom test environment.');
  }
  happyDOM.setViewport({ width: size.width, height: size.height });
}

/** Restores the default viewport. Wire into `afterEach`. */
export function resetViewport(): void {
  setViewport(DEFAULT_VIEWPORT);
}

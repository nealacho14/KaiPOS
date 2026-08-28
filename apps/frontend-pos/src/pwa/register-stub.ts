/**
 * Vitest stand-in for `virtual:pwa-register/react`.
 *
 * That module is synthesised by vite-plugin-pwa during a build, so it does not
 * resolve under Vitest. Aliased in `vitest.config.ts`; it reports no waiting
 * worker, which is the correct state for a test run.
 */
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as [boolean, (value: boolean) => void],
    offlineReady: [false, () => {}] as [boolean, (value: boolean) => void],
    updateServiceWorker: async () => {},
  };
}

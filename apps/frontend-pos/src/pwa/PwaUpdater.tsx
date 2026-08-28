import { UpdatePrompt } from '@kaipos/ui';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Registers the service worker and surfaces its update prompt.
 *
 * This is the only file in the app that imports `virtual:pwa-register/react`.
 * That module exists solely inside a Vite build, so keeping it here — rather
 * than in `@kaipos/app-runtime`, which is consumed as raw TypeScript source and
 * also has to typecheck and run under Vitest on its own — avoids dragging a
 * build-time-only dependency into a shared package. The presentational half
 * lives in `@kaipos/ui` as `<UpdatePrompt>`.
 */
export function PwaUpdater() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  return (
    <UpdatePrompt
      open={needRefresh}
      // `true` reloads once the waiting worker takes control.
      onUpdate={() => void updateServiceWorker(true)}
      onDismiss={() => setNeedRefresh(false)}
    />
  );
}

import './commands';

// The apps register service workers. Left in place between specs, a worker
// serves the precached shell and the specs stop exercising a real deploy —
// which, with `retries.runMode: 2`, degrades into an intermittent post-deploy
// failure that is miserable to trace back to caching.
beforeEach(() => {
  cy.window({ log: false }).then(async (win) => {
    // A support-file `beforeEach` runs before the spec's own hooks, so on the
    // first test of every spec the AUT is still on `about:blank`. That document
    // has an opaque origin, where both APIs below reject with a DOMException —
    // and Cypress cannot append its context to a DOMException (`message` is
    // getter-only), so the hook dies with an opaque "Cannot set property
    // message" TypeError that skips the entire spec. Nothing is registered on
    // about:blank anyway, so there is nothing to clean up.
    if (!win.location.protocol.startsWith('http')) return;

    try {
      if (win.navigator.serviceWorker) {
        const registrations = await win.navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if (win.caches) {
        const keys = await win.caches.keys();
        await Promise.all(keys.map((key) => win.caches.delete(key)));
      }
    } catch {
      // Some origins expose the APIs but refuse them (insecure context, storage
      // partitioning). Best-effort cleanup must never fail the suite.
    }
  });
});

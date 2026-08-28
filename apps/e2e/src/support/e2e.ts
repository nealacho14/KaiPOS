import './commands';

// The apps register service workers. Left in place between specs, a worker
// serves the precached shell and the specs stop exercising a real deploy —
// which, with `retries.runMode: 2`, degrades into an intermittent post-deploy
// failure that is miserable to trace back to caching.
beforeEach(() => {
  cy.window({ log: false }).then(async (win) => {
    if (win.navigator.serviceWorker) {
      const registrations = await win.navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if (win.caches) {
      const keys = await win.caches.keys();
      await Promise.all(keys.map((key) => win.caches.delete(key)));
    }
  });
});

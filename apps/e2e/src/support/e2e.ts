import './commands';

// Both SPAs register a service worker for the offline shell. Under Cypress the
// worker and Cypress's proxy fight over navigations: `cy.reload()` and the
// post-logout redirect hang until the 60s page-load timeout, which turns a
// ~2 minute suite into a ~22 minute one. Real browsers are unaffected — the
// deployed app reloads fine with the worker in control — so this is a harness
// interaction, not a production bug.
//
// Deleting the prototype accessor makes workbox's `'serviceWorker' in navigator`
// guard false, so registration never happens at all. Unregistering after the
// fact (the previous approach, kept below) cannot help: by the time a
// `beforeEach` runs, a worker registered during the previous test already
// controls the page.
Cypress.on('window:before:load', (win) => {
  const container = win.navigator.serviceWorker;
  if (container) {
    // Anything a previous session left behind still controls this origin, so
    // evict it. Fire-and-forget: the reference stays valid after the delete
    // below, and a failure here must never fail the suite.
    void container
      .getRegistrations?.()
      .then((registrations) => registrations.forEach((r) => void r.unregister()))
      .catch(() => {});
  }
  delete (win.Navigator?.prototype as { serviceWorker?: unknown } | undefined)?.serviceWorker;
});

// Precached responses would keep the specs from exercising a real deploy, so
// drop the Cache Storage entries too. `caches` is independent of the
// registration removed above.
beforeEach(() => {
  cy.window({ log: false }).then(async (win) => {
    // A support-file `beforeEach` runs before the spec's own hooks, so on the
    // first test of every spec the AUT is still on `about:blank`. That document
    // has an opaque origin, where the API below rejects with a DOMException —
    // and Cypress cannot append its context to a DOMException (`message` is
    // getter-only), so the hook dies with an opaque "Cannot set property
    // message" TypeError that skips the entire spec. Nothing is cached on
    // about:blank anyway.
    if (!win.location.protocol.startsWith('http')) return;

    try {
      if (win.caches) {
        const keys = await win.caches.keys();
        await Promise.all(keys.map((key) => win.caches.delete(key)));
      }
    } catch {
      // Some origins expose the API but refuse it (insecure context, storage
      // partitioning). Best-effort cleanup must never fail the suite.
    }
  });
});

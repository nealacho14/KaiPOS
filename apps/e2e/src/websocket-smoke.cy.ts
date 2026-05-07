// Smoke check that the SPA's WebSocketProvider wires up end-to-end against the
// live backend. Channel/permission semantics are covered by backend unit tests
// (`ws-connect.test.ts`, `ws-default.test.ts`, `ws-disconnect.test.ts`,
// `ws-auth.test.ts`); here we only verify the chip flips to "active" after an
// authenticated session is established. Requires the frontend build to have
// `VITE_WS_ENDPOINT` pointing at a reachable backend WS (staging does).
describe('websocket smoke', () => {
  beforeEach(() => {
    cy.window().then((win) => win.localStorage.clear());
  });

  it('flips the header ws-status chip to active after admin login', () => {
    cy.loginAs('admin');
    cy.visit('/dashboard');
    cy.url().should('include', '/dashboard');

    // The chip starts as idle/connecting and transitions to active once the
    // WS handshake completes. 15s covers cold-start on a quiet staging.
    cy.get('[data-testid="ws-status"]', { timeout: 15_000 }).should(
      'have.attr',
      'data-status',
      'active',
    );
  });
});

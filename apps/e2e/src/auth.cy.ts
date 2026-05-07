describe('auth', () => {
  beforeEach(() => {
    cy.window().then((win) => win.localStorage.clear());
  });

  it('logs in a valid admin and lands on the dashboard', () => {
    cy.loginAs('admin');
    cy.visit('/dashboard');
    cy.url().should('include', '/dashboard');
    cy.location('pathname').should('not.include', '/login');
  });

  it('shows an error and stays on /login when credentials are invalid', () => {
    // Unique email per run so we never accumulate failed attempts on the
    // same record. The backend's loginAttempts collection locks an email
    // for 15 minutes after MAX_LOGIN_ATTEMPTS=5 and re-locks on every
    // subsequent failed login — a hardcoded address gets perma-stuck on
    // ACCOUNT_LOCKED, which masks the 401 copy this test is asserting.
    const invalidEmail = `cypress-no-such-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cypress.test`;
    cy.visit('/login');
    cy.get('input[type=email]').type(invalidEmail);
    cy.get('input[type=password]').type('wrong-password');
    cy.contains('button', /iniciar sesión/i).click();
    cy.contains(/email o contraseña incorrectos/i).should('be.visible');
    cy.location('pathname').should('eq', '/login');
  });

  it('persists session across a full page reload', () => {
    cy.loginAs('admin');
    cy.visit('/dashboard');
    cy.url().should('include', '/dashboard');
    cy.reload();
    cy.url().should('include', '/dashboard');
    cy.location('pathname').should('not.include', '/login');
  });

  it('clears tokens and redirects to /login on logout', () => {
    cy.loginAs('admin');
    cy.visit('/dashboard');
    cy.logout();
    cy.window().then((win) => {
      expect(win.localStorage.getItem('kaipos:accessToken')).to.equal(null);
      expect(win.localStorage.getItem('kaipos:refreshToken')).to.equal(null);
    });
    cy.visit('/dashboard');
    cy.location('pathname').should('include', '/login');
  });

  it('redirects unauthenticated visitors away from a protected route', () => {
    cy.visit('/dashboard');
    cy.location('pathname').should('include', '/login');
  });
});

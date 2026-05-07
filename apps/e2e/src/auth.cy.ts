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
    cy.visit('/login');
    cy.get('input[type=email]').type('nope@example.com');
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

import type { E2ERole } from '../../cypress.d';

const ACCESS_KEY = 'kaipos:accessToken';
const REFRESH_KEY = 'kaipos:refreshToken';
const USER_KEY = 'kaipos:user';
const SELECTED_BUSINESS_KEY = 'kaipos:selectedBusinessId';

interface LoginResponse {
  success: boolean;
  data: {
    accessToken: string;
    refreshToken: string;
    user: Record<string, unknown>;
  };
}

function envCreds(role: E2ERole): { email: string; password: string } {
  const upper = role.toUpperCase();
  const email = Cypress.env(`USER_${upper}_EMAIL`) as string | undefined;
  const password = Cypress.env(`USER_${upper}_PASSWORD`) as string | undefined;
  if (!email || !password) {
    throw new Error(
      `Missing CYPRESS_USER_${upper}_EMAIL / CYPRESS_USER_${upper}_PASSWORD env. ` +
        `See apps/e2e/.env.example for the full list of required variables.`,
    );
  }
  return { email, password };
}

Cypress.Commands.add('apiLogin', (email: string, password: string) => {
  cy.request<LoginResponse>({
    method: 'POST',
    url: '/api/auth/login',
    body: { email, password, rememberMe: true },
  }).then((res) => {
    expect(res.status).to.eq(200);
    expect(res.body.success).to.eq(true);
    const { accessToken, refreshToken, user } = res.body.data;
    cy.window().then((win) => {
      win.localStorage.setItem(ACCESS_KEY, accessToken);
      win.localStorage.setItem(REFRESH_KEY, refreshToken);
      win.localStorage.setItem(USER_KEY, JSON.stringify(user));
    });
  });
});

Cypress.Commands.add('loginAs', (role: E2ERole) => {
  const { email, password } = envCreds(role);
  cy.apiLogin(email, password);
});

Cypress.Commands.add('logout', () => {
  cy.window().then((win) => {
    const refreshToken = win.localStorage.getItem(REFRESH_KEY);
    if (refreshToken) {
      cy.request({
        method: 'POST',
        url: '/api/auth/logout',
        body: { refreshToken },
        failOnStatusCode: false,
      });
    }
    win.localStorage.removeItem(ACCESS_KEY);
    win.localStorage.removeItem(REFRESH_KEY);
    win.localStorage.removeItem(USER_KEY);
    win.localStorage.removeItem(SELECTED_BUSINESS_KEY);
  });
});

import type {
  ApiCreatedProduct,
  ApiCreateProductPayload,
  E2ERole,
  E2ETenant,
} from '../../cypress.d';

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

interface ProductsListResponse {
  success: boolean;
  data: ApiCreatedProduct[];
  pagination?: { total: number };
}

interface ProductCreateResponse {
  success: boolean;
  data: ApiCreatedProduct;
}

function envCreds(role: E2ERole, tenant: E2ETenant): { email: string; password: string } {
  const upperRole = role.toUpperCase();
  const upperTenant = tenant.toUpperCase();

  // super_admin spans all tenants — always read the unsuffixed pair.
  if (role === 'super_admin') {
    const email = Cypress.env(`USER_${upperRole}_EMAIL`) as string | undefined;
    const password = Cypress.env(`USER_${upperRole}_PASSWORD`) as string | undefined;
    if (email && password) return { email, password };
    throw new Error(
      `Missing CYPRESS_USER_${upperRole}_EMAIL / CYPRESS_USER_${upperRole}_PASSWORD env. ` +
        `See apps/e2e/.env.example for the full list of required variables.`,
    );
  }

  // Prefer tenant-suffixed vars (the Phase 2 contract). Fall back to the
  // unsuffixed var for tenant `a` so Phase 1 .env files keep working.
  const tenantedEmail = Cypress.env(`USER_${upperRole}_${upperTenant}_EMAIL`) as string | undefined;
  const tenantedPass = Cypress.env(`USER_${upperRole}_${upperTenant}_PASSWORD`) as
    | string
    | undefined;
  if (tenantedEmail && tenantedPass) {
    return { email: tenantedEmail, password: tenantedPass };
  }

  if (tenant === 'a') {
    const email = Cypress.env(`USER_${upperRole}_EMAIL`) as string | undefined;
    const password = Cypress.env(`USER_${upperRole}_PASSWORD`) as string | undefined;
    if (email && password) return { email, password };
  }

  throw new Error(
    `Missing CYPRESS_USER_${upperRole}_${upperTenant}_EMAIL / ` +
      `CYPRESS_USER_${upperRole}_${upperTenant}_PASSWORD env. ` +
      `See apps/e2e/.env.example for the full list of required variables.`,
  );
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

Cypress.Commands.add('loginAs', (role: E2ERole, tenant: E2ETenant = 'a') => {
  const { email, password } = envCreds(role, tenant);
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

function authHeaders(win: Window): Record<string, string> {
  const token = win.localStorage.getItem(ACCESS_KEY);
  if (!token) {
    throw new Error(
      'apiCreateProduct/apiDeleteProduct require an active session — call cy.loginAs first.',
    );
  }
  const business = win.localStorage.getItem(SELECTED_BUSINESS_KEY);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
  if (business) headers['x-business-id'] = business;
  return headers;
}

Cypress.Commands.add('apiCreateProduct', (payload: ApiCreateProductPayload) => {
  cy.window().then((win) => {
    const headers = authHeaders(win);
    return cy
      .request<ProductCreateResponse>({
        method: 'POST',
        url: '/api/products',
        headers,
        body: {
          branchId: payload.branchId,
          name: payload.name,
          description: payload.description ?? '',
          price: payload.price,
          category: payload.category,
          sku: payload.sku,
          stock: payload.stock ?? 0,
        },
      })
      .then((res) => {
        expect(res.status, `apiCreateProduct status for ${payload.sku}`).to.be.oneOf([200, 201]);
        return res.body.data;
      });
  });
});

Cypress.Commands.add('apiDeleteProduct', (id: string) => {
  cy.window().then((win) => {
    const headers = authHeaders(win);
    return cy
      .request({
        method: 'DELETE',
        url: `/api/products/${id}`,
        headers,
        failOnStatusCode: false,
      })
      .then((res) => {
        // 204 = deleted, 404 = already gone (cleanup is idempotent on purpose).
        expect(res.status, `apiDeleteProduct status for ${id}`).to.be.oneOf([204, 404]);
      });
  });
});

Cypress.Commands.add('apiFindProductsBySku', (branchId: string, skuPrefix: string) => {
  cy.window().then((win) => {
    const headers = authHeaders(win);
    const params = new URLSearchParams({
      branchId,
      q: skuPrefix,
      limit: '100',
      includeInactive: 'true',
    });
    return cy
      .request<ProductsListResponse>({
        method: 'GET',
        url: `/api/products?${params.toString()}`,
        headers,
      })
      .then((res) => {
        expect(res.status, 'apiFindProductsBySku status').to.eq(200);
        return res.body.data.filter((p) => p.sku.startsWith(skuPrefix));
      });
  });
});

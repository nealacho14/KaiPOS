import { CYPRESS_FIXTURES } from './support/fixtures';

// Cross-tenant scoping. cypress-biz-a admin must NOT see or be able to load
// any record (product, category, branch) that belongs to cypress-biz-b. The
// IDs are deterministic from `apps/backend/src/db/seed-cypress.ts` so we
// don't need a transient login to discover them.

const ACCESS_KEY = 'kaipos:accessToken';
const ACTIVE_BRANCH_KEY = 'kaipos.activeBranchId';

function authedRequest<T = unknown>(
  method: Cypress.HttpMethod,
  url: string,
  options: Partial<Cypress.RequestOptions> = {},
): Cypress.Chainable<Cypress.Response<T>> {
  return cy.window().then((win) => {
    const token = win.localStorage.getItem(ACCESS_KEY);
    expect(token, 'access token in localStorage').to.be.a('string');
    return cy.request<T>({
      method,
      url,
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
      failOnStatusCode: false,
    });
  });
}

describe('multi-tenant · cypress-biz-a cannot see or load cypress-biz-b records', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
    cy.loginAs('admin', 'a');
    cy.window().then((win) => {
      win.sessionStorage.setItem(ACTIVE_BRANCH_KEY, CYPRESS_FIXTURES.bizA.branchId);
    });
  });

  it('product detail for biz-b returns 404 in the SPA', () => {
    cy.visit(`/products/${CYPRESS_FIXTURES.bizB.productId}/edit`);
    // ProductFormPage maps a 404 from the API to this exact copy. See
    // apps/frontend-admin/src/pages/ProductFormPage.tsx (`No encontramos este producto.`)
    cy.contains(/no encontramos este producto/i, { timeout: 10_000 }).should('be.visible');
  });

  it('GET /api/products/:id for biz-b returns 404 (API-level)', () => {
    authedRequest('GET', `/api/products/${CYPRESS_FIXTURES.bizB.productId}`).then((res) => {
      expect(res.status, 'cross-tenant product fetch').to.eq(404);
    });
  });

  it('GET /api/categories does not leak biz-b categories', () => {
    authedRequest<{ success: boolean; data: Array<{ _id: string }> }>(
      'GET',
      '/api/categories?limit=200',
    ).then((res) => {
      expect(res.status).to.eq(200);
      const ids = res.body.data.map((c) => c._id);
      expect(ids, 'biz-b category id must not appear in biz-a list').to.not.include(
        CYPRESS_FIXTURES.bizB.categoryId,
      );
    });
  });

  it('GET /api/branches does not leak biz-b branches', () => {
    authedRequest<{ success: boolean; data: { branches: Array<{ _id: string }> } }>(
      'GET',
      '/api/branches',
    ).then((res) => {
      expect(res.status).to.eq(200);
      const ids = res.body.data.branches.map((b) => b._id);
      expect(ids, 'biz-b branch id must not appear in biz-a list').to.not.include(
        CYPRESS_FIXTURES.bizB.branchId,
      );
    });
  });
});

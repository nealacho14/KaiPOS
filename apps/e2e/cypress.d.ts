/// <reference types="cypress" />

export type E2ERole =
  | 'admin'
  | 'manager'
  | 'supervisor'
  | 'cashier'
  | 'waiter'
  | 'kitchen'
  | 'super_admin';
export type E2ETenant = 'a' | 'b';

export interface ApiCreateProductPayload {
  branchId: string;
  name: string;
  price: number;
  category: string;
  sku: string;
  stock?: number;
  description?: string;
}

export interface ApiCreatedProduct {
  _id: string;
  branchId: string;
  businessId: string;
  sku: string;
  name: string;
  price: number;
}

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Log in by hitting the API directly and persisting tokens in localStorage,
       * matching the SPA's auth-storage convention. Faster than driving the form.
       */
      apiLogin(email: string, password: string): Chainable<void>;

      /**
       * Log in as a pre-seeded role using credentials read from Cypress env.
       * Defaults to tenant `a` (cypress-biz-a). Pass `'b'` for cross-tenant
       * scenarios in the multi-tenant suite.
       *
       * Reads `CYPRESS_USER_<ROLE>_<TENANT>_EMAIL/PASSWORD`.
       */
      loginAs(role: E2ERole, tenant?: E2ETenant): Chainable<void>;

      /**
       * Hit /api/auth/logout (best-effort) and clear local session storage.
       */
      logout(): Chainable<void>;

      /**
       * Create a product via the API using the currently-authenticated session.
       * Resolves to the created product so its `_id` can be used for cleanup.
       *
       * SKUs should be prefixed with the runtime's CYP- token (see `cypressSkuPrefix`)
       * so the cleanup helper can find them on suite teardown.
       */
      apiCreateProduct(payload: ApiCreateProductPayload): Chainable<ApiCreatedProduct>;

      /**
       * Delete a product by id via the API. Tolerant of 404 so it can be used
       * in `afterEach` cleanup paths even when the test never created the row.
       */
      apiDeleteProduct(id: string): Chainable<void>;

      /**
       * List products via the API filtered by branch + free-text query. Used
       * by `afterEach` to find any leftover `CYP-...` rows the tests left
       * behind on failure paths.
       */
      apiFindProductsBySku(branchId: string, skuPrefix: string): Chainable<ApiCreatedProduct[]>;
    }
  }
}

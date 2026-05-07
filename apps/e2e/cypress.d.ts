/// <reference types="cypress" />

export type E2ERole = 'admin' | 'manager' | 'supervisor' | 'cashier' | 'waiter' | 'kitchen';

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Log in by hitting the API directly and persisting tokens in localStorage,
       * matching the SPA's auth-storage convention. Faster than driving the form.
       */
      apiLogin(email: string, password: string): Chainable<void>;

      /**
       * Log in as a pre-seeded role using credentials read from Cypress env
       * (CYPRESS_USER_<ROLE>_EMAIL / CYPRESS_USER_<ROLE>_PASSWORD).
       */
      loginAs(role: E2ERole): Chainable<void>;

      /**
       * Hit /api/auth/logout (best-effort) and clear local session storage.
       */
      logout(): Chainable<void>;
    }
  }
}

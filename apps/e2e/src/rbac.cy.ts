import { CYPRESS_FIXTURES } from './support/fixtures';

interface RoleMatrix {
  role: 'admin' | 'manager' | 'supervisor' | 'cashier' | 'waiter' | 'kitchen';
  // Visible nav labels in the sidebar (must be exact text matches).
  visible: string[];
  // Sidebar labels that must NOT appear for this role.
  hidden: string[];
  // Routes that require a permission this role lacks; visiting must redirect
  // away (the SPA bounces unauthorized routes back to /dashboard).
  forbiddenRoutes: string[];
}

// Sidebar items: Dashboard (no perm), Productos (products:read), Categorías
// (categories:read), Usuarios (users:read), Debug · WebSocket (no perm).
// See apps/frontend-admin/src/components/Sidebar.tsx and
// packages/shared/src/permissions.ts for the source of truth.
const MATRIX: RoleMatrix[] = [
  {
    role: 'admin',
    visible: ['Dashboard', 'Productos', 'Categorías', 'Usuarios', 'Debug · WebSocket'],
    hidden: [],
    forbiddenRoutes: [],
  },
  {
    role: 'manager',
    visible: ['Dashboard', 'Productos', 'Categorías', 'Usuarios', 'Debug · WebSocket'],
    hidden: [],
    forbiddenRoutes: [],
  },
  {
    role: 'supervisor',
    visible: ['Dashboard', 'Productos', 'Categorías', 'Debug · WebSocket'],
    hidden: ['Usuarios'],
    forbiddenRoutes: ['/users'],
  },
  {
    role: 'cashier',
    visible: ['Dashboard', 'Productos', 'Categorías', 'Debug · WebSocket'],
    hidden: ['Usuarios'],
    forbiddenRoutes: ['/users', '/users/new'],
  },
  {
    role: 'waiter',
    visible: ['Dashboard', 'Productos', 'Categorías', 'Debug · WebSocket'],
    hidden: ['Usuarios'],
    forbiddenRoutes: ['/users'],
  },
  {
    role: 'kitchen',
    visible: ['Dashboard', 'Debug · WebSocket'],
    hidden: ['Productos', 'Categorías', 'Usuarios'],
    forbiddenRoutes: ['/products', '/categories', '/users'],
  },
];

describe('rbac · per-role gating', () => {
  beforeEach(() => {
    cy.window().then((win) => win.localStorage.clear());
  });

  for (const entry of MATRIX) {
    it(`role=${entry.role}: sidebar + protected routes match the permission matrix`, () => {
      cy.loginAs(entry.role);
      cy.visit('/dashboard');
      cy.location('pathname').should('include', '/dashboard');

      // The sidebar nav has aria-label="Navegación principal" (Sidebar.tsx).
      // Wait for it to mount before asserting absence — otherwise we race
      // against the auth bootstrap and pass on a still-empty tree.
      cy.get('nav[aria-label="Navegación principal"]').should('be.visible');

      for (const label of entry.visible) {
        cy.get('nav[aria-label="Navegación principal"]').contains('a', label).should('be.visible');
      }
      for (const label of entry.hidden) {
        cy.get('nav[aria-label="Navegación principal"]').contains('a', label).should('not.exist');
      }

      // Direct URL access to forbidden routes redirects back to /dashboard
      // (RequirePermission guard, see apps/frontend-admin/src/components/guards).
      for (const route of entry.forbiddenRoutes) {
        cy.visit(route);
        cy.location('pathname', { timeout: 10_000 }).should('eq', '/dashboard');
      }

      cy.logout();
    });
  }
});

describe('rbac · super_admin business picker', () => {
  beforeEach(() => {
    cy.window().then((win) => win.localStorage.clear());
  });

  it('super_admin sees the business picker and can scope to cypress-biz-a', () => {
    cy.loginAs('super_admin');
    cy.visit('/dashboard');
    cy.location('pathname').should('include', '/dashboard');

    // The MUI Select uses an InputLabel with id="business-picker-label".
    // We click the labelled combobox to open the menu, then pick the option
    // for cypress-biz-a. The picker fires window.location.reload() after
    // selection — assert against localStorage rather than mid-reload UI.
    cy.get('[role="combobox"]').filter('[aria-labelledby*="business-picker-label"]').click();
    cy.get('[role="option"]')
      .contains(/cypress business a/i)
      .click();

    cy.window({ timeout: 10_000 }).should((win) => {
      expect(win.localStorage.getItem('kaipos:selectedBusinessId')).to.eq(
        CYPRESS_FIXTURES.bizA._id,
      );
    });
  });
});

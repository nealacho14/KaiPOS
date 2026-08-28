import { CYPRESS_FIXTURES } from './support/fixtures';

interface RoleMatrix {
  role: 'admin' | 'manager' | 'supervisor' | 'cashier' | 'waiter' | 'kitchen';
  // Where this role lands when it has nowhere else to go — the post-login
  // target and the redirect destination of every RequirePermission guard.
  // Mirrors `resolveHomePath` in packages/app-runtime/src/lib/home-path.ts.
  homePath: string;
  // Visible nav labels in the sidebar (must be exact text matches).
  visible: string[];
  // Sidebar labels that must NOT appear for this role.
  hidden: string[];
  // Routes that require a permission this role lacks; visiting must redirect
  // to the role's own homePath.
  forbiddenRoutes: string[];
}

// Sidebar items: Dashboard (business:manage), Productos (products:read),
// Categorías (categories:read), Usuarios (users:read), Debug · WebSocket
// (business:manage). Dashboard and the WS console are admin-only, so every
// other role both loses the nav link and gets bounced off the route.
// See apps/frontend-admin/src/components/Sidebar.tsx and
// packages/shared/src/permissions.ts for the source of truth.
const MATRIX: RoleMatrix[] = [
  {
    role: 'admin',
    homePath: '/dashboard',
    visible: ['Dashboard', 'Productos', 'Categorías', 'Usuarios', 'Debug · WebSocket'],
    hidden: [],
    forbiddenRoutes: [],
  },
  {
    role: 'manager',
    homePath: '/products',
    visible: ['Productos', 'Categorías', 'Usuarios'],
    hidden: ['Dashboard', 'Debug · WebSocket'],
    forbiddenRoutes: ['/dashboard', '/debug/ws'],
  },
  {
    role: 'supervisor',
    homePath: '/products',
    visible: ['Productos', 'Categorías'],
    hidden: ['Dashboard', 'Usuarios', 'Debug · WebSocket'],
    forbiddenRoutes: ['/dashboard', '/debug/ws', '/users'],
  },
  {
    role: 'cashier',
    homePath: '/products',
    visible: ['Productos', 'Categorías'],
    hidden: ['Dashboard', 'Usuarios', 'Debug · WebSocket'],
    forbiddenRoutes: ['/dashboard', '/debug/ws', '/users', '/users/new'],
  },
  {
    role: 'waiter',
    homePath: '/products',
    visible: ['Productos', 'Categorías'],
    hidden: ['Dashboard', 'Usuarios', 'Debug · WebSocket'],
    forbiddenRoutes: ['/dashboard', '/debug/ws', '/users'],
  },
  {
    role: 'kitchen',
    homePath: '/no-access',
    visible: [],
    hidden: ['Dashboard', 'Productos', 'Categorías', 'Usuarios', 'Debug · WebSocket'],
    forbiddenRoutes: ['/dashboard', '/debug/ws', '/products', '/categories', '/users'],
  },
];

describe('rbac · per-role gating', () => {
  beforeEach(() => {
    cy.window().then((win) => win.localStorage.clear());
  });

  for (const entry of MATRIX) {
    it(`role=${entry.role}: sidebar + protected routes match the permission matrix`, () => {
      cy.loginAs(entry.role);
      // `/` redirects to the role's own home. Landing here (rather than on a
      // fixed /dashboard) is itself the assertion that the guards resolve
      // without bouncing — /dashboard is admin-only now.
      cy.visit('/');
      cy.location('pathname', { timeout: 10_000 }).should('eq', entry.homePath);

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

      // Direct URL access to a forbidden route redirects to this role's home
      // (RequirePermission, packages/app-runtime/src/guards). Asserting the
      // exact destination also proves we don't land in a redirect loop.
      for (const route of entry.forbiddenRoutes) {
        cy.visit(route);
        cy.location('pathname', { timeout: 10_000 }).should('eq', entry.homePath);
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

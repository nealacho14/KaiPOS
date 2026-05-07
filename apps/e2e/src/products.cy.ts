import { CYPRESS_FIXTURES, cypressSkuPrefix, makeCypressSku } from './support/fixtures';

// Products CRUD against cypress-biz-a as admin. The cypress-biz-a admin lives
// on the seeded category "Cypress Categoría" and the seeded branch
// CYPRESS_FIXTURES.bizA.branchId. The afterEach sweeps any leftover product
// whose SKU starts with the runtime's CYP- prefix so failures don't leak
// data between runs (see `cypressSkuPrefix`).

const BRANCH_ID = CYPRESS_FIXTURES.bizA.branchId;
const CATEGORY = 'Cypress Categoría';
const ACTIVE_BRANCH_KEY = 'kaipos.activeBranchId';

// MUI TextField renders <label> + <input> as siblings inside a FormControl
// wrapper, so `.parent().find('input')` from the label is a stable bridge
// across MUI versions without needing data-testids on every field.
function fieldInput(labelRegex: RegExp): Cypress.Chainable<JQuery<HTMLInputElement>> {
  return cy.contains('label', labelRegex).parent().find('input') as Cypress.Chainable<
    JQuery<HTMLInputElement>
  >;
}

function selectByLabel(labelRegex: RegExp, optionText: string | RegExp): void {
  cy.contains('label', labelRegex).parent().find('[role="combobox"]').click();
  cy.get('[role="option"]').contains(optionText).click();
}

describe('products · CRUD via UI as cypress-biz-a admin', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
    cy.loginAs('admin', 'a');
    // Pre-select the seeded branch so the products page loads with a context.
    // The SPA reads this from sessionStorage on mount (ActiveBranchContext).
    cy.window().then((win) => {
      win.sessionStorage.setItem(ACTIVE_BRANCH_KEY, BRANCH_ID);
    });
  });

  afterEach(() => {
    cy.window().then((win) => {
      if (!win.localStorage.getItem('kaipos:accessToken')) return;
      cy.apiFindProductsBySku(BRANCH_ID, cypressSkuPrefix()).then((leftovers) => {
        for (const p of leftovers) {
          cy.apiDeleteProduct(p._id);
        }
      });
    });
  });

  it('creates, edits, and deletes a product end-to-end', () => {
    const sku = makeCypressSku('CRUD');
    const name = `Cypress CRUD ${sku.slice(-4)}`;
    const initialPrice = 250;
    const newPrice = 425;

    // ---- Create -----------------------------------------------------------
    cy.visit('/products/new');
    cy.location('pathname').should('include', '/products/new');

    fieldInput(/^Nombre del producto/i).type(name);
    selectByLabel(/^Categoría$/i, CATEGORY);
    fieldInput(/^SKU/i).clear().type(sku);
    fieldInput(/^Precio de venta/i)
      .clear()
      .type(String(initialPrice));
    fieldInput(/^Stock actual/i)
      .clear()
      .type('100');

    cy.contains('button', /^Publicar producto$/).click();
    cy.location('pathname', { timeout: 15_000 }).should('eq', '/products');
    cy.contains('table tr td', sku).should('be.visible');

    // Resolve the new product's id via the API so we can drive edit + delete
    // by URL rather than scraping <tr> handlers.
    cy.apiFindProductsBySku(BRANCH_ID, cypressSkuPrefix()).then((rows) => {
      const created = rows.find((r) => r.sku === sku);
      if (!created) {
        throw new Error(`Expected a created product with sku ${sku} but found none`);
      }
      const productId = created._id;

      // ---- Edit -----------------------------------------------------------
      cy.visit(`/products/${productId}/edit`);
      cy.location('pathname').should('include', `/products/${productId}/edit`);
      fieldInput(/^Precio de venta/i)
        .clear()
        .type(String(newPrice));
      cy.contains('button', /^Guardar cambios$/).click();
      cy.location('pathname', { timeout: 15_000 }).should('eq', '/products');

      // Hard reload to catch client-state-only edits.
      cy.reload();
      cy.contains('table tr', sku).should('contain.text', String(newPrice));

      // ---- Delete (soft-delete via UI confirm dialog) ---------------------
      cy.contains('table tr', sku).within(() => {
        cy.get('button[aria-label*="Desactivar"]').click();
      });
      cy.get('[role="dialog"]').within(() => {
        cy.contains('button', /^Desactivar$/).click();
      });

      // The row leaves the default (active-only) listing.
      cy.contains('table tr td', sku).should('not.exist');

      // The afterEach sweep then idempotently kills any straggler — covered
      // by apiDeleteProduct's 404-tolerant path.
    });
  });
});

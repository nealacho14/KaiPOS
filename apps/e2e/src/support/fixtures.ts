// IDs and constants matching `apps/backend/src/db/seed-cypress.ts`.
// If you change one side, change both.

export const CYPRESS_FIXTURES = {
  bizA: {
    _id: '00000000-0000-4000-8000-000000009100',
    slug: 'cypress-biz-a',
    branchId: '00000000-0000-4000-8000-000000009110',
    categoryId: '00000000-0000-4000-8000-000000009120',
    productId: '00000000-0000-4000-8000-000000009130',
    productSku: 'CYP-FIXED-A-001',
  },
  bizB: {
    _id: '00000000-0000-4000-8000-000000009200',
    slug: 'cypress-biz-b',
    branchId: '00000000-0000-4000-8000-000000009210',
    categoryId: '00000000-0000-4000-8000-000000009220',
    productId: '00000000-0000-4000-8000-000000009230',
    productSku: 'CYP-FIXED-B-001',
  },
} as const;

// The CI runner stamps GITHUB_RUN_ID into env so parallel PRs targeting the
// same staging environment don't fight over SKUs. Locally we fall back to the
// process pid (or `local`) to keep the suite reusable across `pnpm dev`.
//
// `Cypress.env('GITHUB_RUN_ID')` is set by the CI workflow (Phase 4); locally
// the var is undefined and we use `local`.
export function cypressSkuPrefix(): string {
  const runId = Cypress.env('GITHUB_RUN_ID') as string | undefined;
  return runId ? `CYP-${runId}-` : 'CYP-local-';
}

// Generate a unique SKU within the current run. The product cleanup loop in
// `afterEach` finds anything starting with `cypressSkuPrefix()`.
export function makeCypressSku(label: string): string {
  // 4 random alphanum chars is enough — suites only create a few products and
  // the prefix is already runtime-scoped.
  const noise = Math.random().toString(36).slice(2, 6).toUpperCase();
  const safeLabel =
    label
      .replace(/[^A-Z0-9]/gi, '')
      .slice(0, 6)
      .toUpperCase() || 'PROD';
  return `${cypressSkuPrefix()}${safeLabel}-${noise}`;
}

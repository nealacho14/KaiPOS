import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'cypress';

// Load apps/e2e/.env for local runs. dotenv does not override variables that
// are already set in the shell, so an explicit `export CYPRESS_BASE_URL=...`
// or the GitHub Actions `env:` block still wins. CI works fine even though
// no .env file is present (`override: false` is the default).
loadDotenv();

const baseUrl = process.env.CYPRESS_BASE_URL ?? 'http://localhost:3000';

// Cypress only auto-forwards CYPRESS_* vars to `Cypress.env()` when they are
// already in `process.env` at the moment its launcher reads them — and that
// snapshot can happen before this config file runs (and thus before
// loadDotenv has populated process.env). Forward them explicitly here so the
// .env-driven flow works the same way as a shell export. The `CYPRESS_`
// prefix is stripped to match how Cypress would have done it natively, so
// `CYPRESS_USER_ADMIN_A_EMAIL` becomes `Cypress.env('USER_ADMIN_A_EMAIL')`.
const cypressEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith('CYPRESS_') && value !== undefined) {
    cypressEnv[key.slice('CYPRESS_'.length)] = value;
  }
}

export default defineConfig({
  e2e: {
    baseUrl,
    specPattern: 'src/**/*.cy.ts',
    supportFile: 'src/support/e2e.ts',
    fixturesFolder: false,
    viewportWidth: 1280,
    viewportHeight: 800,
    video: false,
    screenshotOnRunFailure: true,
    retries: { runMode: 2, openMode: 0 },
    defaultCommandTimeout: 10_000,
    requestTimeout: 15_000,
  },
  env: cypressEnv,
});

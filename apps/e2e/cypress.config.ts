import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'cypress';

// Load apps/e2e/.env for local runs. dotenv does not override variables that
// are already set in the shell, so an explicit `export CYPRESS_BASE_URL=...`
// or the GitHub Actions `env:` block still wins. CI works fine even though
// no .env file is present (`override: false` is the default).
loadDotenv();

const baseUrl = process.env.CYPRESS_BASE_URL ?? 'http://localhost:3000';

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
});

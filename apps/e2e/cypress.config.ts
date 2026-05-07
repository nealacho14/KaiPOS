import { defineConfig } from 'cypress';

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

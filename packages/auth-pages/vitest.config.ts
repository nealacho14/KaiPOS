import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    // CI runners (Linux, cold module cache) run long async sequences
    // ~3× slower than local M-series Macs. Match the apps' default — the
    // first parametrized variant in LoginPage.test pays the full
    // @kaipos/app-runtime + KaiPOSThemeProvider import cost.
    testTimeout: 30_000,
  },
});

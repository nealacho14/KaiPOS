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
    // ~3× slower than local M-series Macs. Match the apps' default — 30s
    // is a safety net for module-load cold starts (this package owns the
    // shared AuthProvider chain that every consuming test pays for once).
    testTimeout: 30_000,
  },
});

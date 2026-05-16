import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    // CI runners (Linux, cold module cache) run long userEvent sequences
    // ~3× slower than local M-series Macs. 5s defaults trip flakily on
    // the variant/modifier form tests; 15s gives headroom without hiding
    // genuine hangs.
    testTimeout: 15_000,
  },
});

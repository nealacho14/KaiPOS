import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  resolve: {
    alias: {
      // Synthesised by vite-plugin-pwa at build time, so it cannot resolve here.
      'virtual:pwa-register/react': new URL('./src/pwa/register-stub.ts', import.meta.url).pathname,
    },
  },
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 30_000,
  },
});

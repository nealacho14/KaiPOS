import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Pure re-export barrels — measuring them would be noise.
        'src/index.ts',
        'src/components/index.ts',
        'src/icons/index.ts',
        'src/providers/index.ts',
        'src/tokens/index.ts',
        // Tests + setup + ambient type augmentations.
        'src/**/*.test.{ts,tsx}',
        'src/test-setup.ts',
        'src/theme/augmentations.ts',
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});

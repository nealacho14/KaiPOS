import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './pwa.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  version?: string;
};
const appVersion = pkg.version ?? '0.0.0';

const port = Number(process.env.VITE_PORT) || 3002;
const apiUrl = process.env.VITE_API_URL || 'http://localhost:4000';

export default defineConfig({
  // Served under /pos/* in production so it can coexist with the admin app on
  // the same CloudFront distribution. Vite rewrites every asset URL with this
  // prefix at build time, and the dev server roots at http://localhost:3002/pos/.
  base: '/pos/',
  plugins: [react(), VitePWA(pwaOptions)],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  server: {
    host: true,
    port,
    proxy: {
      '/api': {
        target: apiUrl,
        changeOrigin: true,
      },
    },
  },
});

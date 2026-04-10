import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const port = Number(process.env.VITE_PORT) || 3000;
const apiUrl = process.env.VITE_API_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
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

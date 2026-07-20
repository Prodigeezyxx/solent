import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
    proxy: {
      // Forwards /api/* to the Cloudflare Worker running via `wrangler dev` (default port 8787).
      '/api': {
        target: process.env.WORKER_URL || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  preview: {
    allowedHosts: ['.sandbox.novita.ai'],
  },
});

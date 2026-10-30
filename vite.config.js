import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Keeps the build free of injected inline scripts so the self-only CSP holds.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
  // In development, the Functions (sign-in, client, completion) run in "npm run pages" on port 8799.
  server: {
    proxy: { '/api': 'http://127.0.0.1:8799' },
  },
});

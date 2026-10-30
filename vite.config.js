import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Keeps the build free of injected inline scripts so the self-only CSP holds.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
});

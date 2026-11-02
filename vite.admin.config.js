import { defineConfig } from 'vite';

// The admin dashboard is a separate build served from /admin/, so its files sit behind the admin
// route group (Cloudflare Access) and never behind a client's access code. npm run build runs both.
// In development, the main Vite server (vite.config.js) serves admin/index.html at /admin/.
export default defineConfig({
  root: 'admin',
  base: '/admin/',
  publicDir: false,
  build: {
    outDir: '../dist/admin',
    emptyOutDir: true,
    // Same CSP constraints as the main build.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
});

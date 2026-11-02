import { createLogger, defineConfig } from 'vite';
import { API_PORT, API_URL, VITE_PORT } from './scripts/dev-ports.mjs';

const API_DOWN = 'API server not running, use npm run dev';

// Vite logs a full stack trace for every proxy failure. When the local API is simply not running,
// say so in one line instead. Every other error logs normally.
const logger = createLogger();
const logError = logger.error;
logger.error = (msg, options) => {
  if (options?.error?.code === 'ECONNREFUSED' && String(msg).includes('proxy error')) {
    logger.warn(`API server on port ${API_PORT} is not running. Use npm run dev.`, { timestamp: true });
    return;
  }
  logError(msg, options);
};

// Vite's HTML fallback looks for login/index.html in the project root, not in public/, so without
// this /login/ would serve the app, which redirects back to /login/ in a loop.
const loginPage = {
  name: 'serve-login-page',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/login' || req.url === '/login/' || req.url?.startsWith('/login/?')) {
        req.url = '/login/index.html';
      }
      next();
    });
  },
};

export default defineConfig({
  customLogger: logger,
  plugins: [loginPage],
  build: {
    // Keeps the build free of injected inline scripts so the self-only CSP holds.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
  // In development, the Functions (sign-in, client, completion) run in Wrangler (npm run dev:api).
  server: {
    port: VITE_PORT,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_URL,
        // Keep the browser's Host and Origin so the Functions see the real local origin.
        changeOrigin: false,
        configure(proxy) {
          // Runs before Vite's own error handler, which then sees the response is already sent.
          proxy.on('error', (_err, _req, res) => {
            if (res && 'writeHead' in res && !res.headersSent && !res.writableEnded) {
              res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
              res.end(JSON.stringify({ ok: false, error: API_DOWN }));
            }
          });
        },
      },
    },
  },
});

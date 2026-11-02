// Local ports, in one place. Used by vite.config.js, the dev scripts and the smoke test.
// Change the API port with DEV_API_PORT, then rerun npm run dev:setup so ALLOWED_ORIGINS matches.
export const API_PORT = Number(process.env.DEV_API_PORT || 8799);
export const VITE_PORT = 5173;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const VITE_URL = `http://localhost:${VITE_PORT}`;

// Origins the local Functions accept: the Vite dev server, and the API server itself
// (npm run pages and the smoke test load pages straight from it).
export const LOCAL_ORIGINS = [VITE_URL, `http://127.0.0.1:${VITE_PORT}`, API_URL, `http://localhost:${API_PORT}`];

// Fixed, documented test-only access code used by tests/smoke.mjs. dev:setup adds its hash to the
// local D1 database. It works only with local secrets, never in production.
export const SMOKE_CODE = 'smoke-test-code-2026-xyzw';

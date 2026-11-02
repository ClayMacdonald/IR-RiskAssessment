// Waits for the local API (npm run dev:api) so the first page load never hits a server that is still starting.
// Gives up after 60 seconds with a warning and lets Vite start anyway.
import { API_PORT, API_URL } from './dev-ports.mjs';

const deadline = Date.now() + 60_000;
while (Date.now() < deadline) {
  try {
    const res = await fetch(`${API_URL}/api/login`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) process.exit(0);
  } catch {
    // Not up yet.
  }
  await new Promise((r) => setTimeout(r, 500));
}
console.warn(`API server on port ${API_PORT} did not answer within 60 seconds. Starting Vite anyway.`);

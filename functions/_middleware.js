// Gates every request behind a signed session (see README, "Access control").
//
// Public without a session: the login page and its static files, the login and logout
// endpoints and the favicon. Everything else, including the JS bundle that holds the
// question bank, needs a valid session for a client whose access code has not expired.
// HTML requests without one are redirected to /login. Anything else gets 401.
import { currentClient } from './_lib/session.js';

const PUBLIC_EXACT = new Set(['/login', '/favicon.svg', '/api/login', '/api/logout']);
const PUBLIC_PREFIX = '/login/';

export function isPublic(pathname) {
  return PUBLIC_EXACT.has(pathname) || pathname.startsWith(PUBLIC_PREFIX);
}

export async function onRequest(context) {
  return gate(context);
}

export async function gate({ request, env, next, data = {} }) {
  // The URL parser resolves dot segments, so /login/../assets/x.js is checked as /assets/x.js.
  const { pathname } = new URL(request.url);
  if (isPublic(pathname)) return next();

  const client = await currentClient(request, env);
  if (!client) return denied(request);

  data.clientId = client.clientId;
  data.firmName = client.firmName;

  const res = await next();
  // Gated content must never be stored by a shared cache.
  const out = new Response(res.body, res);
  out.headers.set(
    'Cache-Control',
    pathname.startsWith('/assets/') ? 'private, max-age=31536000, immutable' : 'private, no-store'
  );
  out.headers.append('Vary', 'Cookie');
  return out;
}

function denied(request) {
  const wantsHtml = request.method === 'GET' && (request.headers.get('Accept') || '').includes('text/html');
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (wantsHtml) return new Response(null, { status: 302, headers: { ...headers, Location: '/login/' } });
  return new Response(JSON.stringify({ ok: false }), {
    status: 401,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

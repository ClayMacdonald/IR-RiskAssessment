// Gates every request (see README, "Access control" and "Admin dashboard"). Three groups:
//
// Public without a session: the login page and its static files, the login and logout
// endpoints and the favicon.
// Admin: /admin, /admin/* and /api/admin/*. A verified Cloudflare Access identity for an
// AdvisorDefense email is required (functions/_lib/admin.js). A client session never opens these.
// Client: everything else, including the JS bundle that holds the question bank, needs a valid
// session for a client whose access code has not expired. HTML requests without one are
// redirected to /login. Anything else gets 401.
import { currentClient } from './_lib/session.js';
import { adminIdentity } from './_lib/admin.js';

const PUBLIC_EXACT = new Set(['/login', '/favicon.svg', '/api/login', '/api/logout']);
const PUBLIC_PREFIX = '/login/';

export function isPublic(pathname) {
  return PUBLIC_EXACT.has(pathname) || pathname.startsWith(PUBLIC_PREFIX);
}

export function isAdmin(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/api/admin' || pathname.startsWith('/api/admin/');
}

export async function onRequest(context) {
  return gate(context);
}

export async function gate({ request, env, next, data = {} }, fetchImpl = fetch) {
  // The URL parser resolves dot segments, so /login/../assets/x.js is checked as /assets/x.js.
  const { pathname } = new URL(request.url);
  if (isPublic(pathname)) return next();

  if (isAdmin(pathname)) {
    const admin = await adminIdentity(request, env, fetchImpl);
    if (!admin) return forbidden();
    data.adminEmail = admin.email;
    return privateResponse(await next(), 'private, no-store');
  }

  const client = await currentClient(request, env);
  if (!client) return denied(request);

  data.clientId = client.clientId;
  data.firmName = client.firmName;
  data.preview = client.preview;

  return privateResponse(
    await next(),
    pathname.startsWith('/assets/') ? 'private, max-age=31536000, immutable' : 'private, no-store'
  );
}

// Gated content must never be stored by a shared cache.
function privateResponse(res, cacheControl) {
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', cacheControl);
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

// No redirect for the admin side: Cloudflare Access handles sign-in before the request gets here.
function forbidden() {
  return new Response(JSON.stringify({ ok: false, error: 'admin_only' }), {
    status: 403,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': 'application/json; charset=utf-8' },
  });
}

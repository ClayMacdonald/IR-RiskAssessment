// POST /api/logout: clears the session cookie. Public, so it works even after the session expires.
import { reply } from '../_lib/http.js';
import { clearedCookie } from '../_lib/session.js';

const ROUTE = '/api/logout';

export async function onRequestPost({ env } = {}) {
  return reply(ROUTE, 200, 'signed_out', { headers: { 'Set-Cookie': clearedCookie(env) }, body: { ok: true } });
}

export async function onRequest() {
  return reply(ROUTE, 405, 'method_not_allowed', { headers: { Allow: 'POST' } });
}

// GET /api/admin/me: the signed-in admin's email. The middleware has verified the Access identity.
import { reply } from '../../_lib/http.js';

const ROUTE = '/api/admin/me';

export async function onRequestGet({ data }) {
  if (!data.adminEmail) return reply(ROUTE, 403, 'not_admin');
  return reply(ROUTE, 200, 'ok', { body: { ok: true, email: data.adminEmail } });
}

export async function onRequest() {
  return reply(ROUTE, 405, 'method_not_allowed', { headers: { Allow: 'GET' } });
}

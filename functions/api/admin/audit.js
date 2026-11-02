// GET /api/admin/audit: the most recent admin audit rows, newest first (?before=<id> pages back).
// The middleware has verified the Cloudflare Access identity (data.adminEmail).
import { reply } from '../../_lib/http.js';

const ROUTE = '/api/admin/audit';
export const PAGE_SIZE = 100;

export async function onRequestGet({ request, env, data }) {
  const before = Number(new URL(request.url).searchParams.get('before'));
  return listAudit(env, data, Number.isInteger(before) && before > 0 ? before : null);
}

export async function onRequest() {
  return reply(ROUTE, 405, 'method_not_allowed', { headers: { Allow: 'GET' } });
}

export async function listAudit(env, data = {}, before = null) {
  if (!data.adminEmail) return reply(ROUTE, 403, 'not_admin');
  if (!env.DB) return reply(ROUTE, 500, 'not_configured');
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.at, a.actor_email, a.action, a.client_id, a.detail, c.firm_name
       FROM audit_log a LEFT JOIN clients c ON c.client_id = a.client_id
      WHERE (? IS NULL OR a.id < ?)
      ORDER BY a.id DESC LIMIT ?`
  )
    .bind(before, before, PAGE_SIZE + 1)
    .all();
  const rows = results.slice(0, PAGE_SIZE).map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.actor_email,
    action: r.action,
    clientId: r.client_id,
    firmName: r.firm_name,
    detail: r.detail ? JSON.parse(r.detail) : null,
  }));
  return reply(ROUTE, 200, 'ok', { body: { ok: true, rows, more: results.length > PAGE_SIZE } });
}

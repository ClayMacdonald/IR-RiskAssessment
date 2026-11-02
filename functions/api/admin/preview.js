// POST /api/admin/preview: { clientId } signs this browser in as that client for one hour, as a
// preview. The app shows a preview banner, and /api/completion stores and sends nothing.
//
// The middleware has verified the Cloudflare Access identity (data.adminEmail). The client must be
// active (not revoked or expired). Every preview writes an audit row.
import { allowedOrigins, readJson, reply } from '../../_lib/http.js';
import { codeExpiry, isActive, sessionCookie, signSession } from '../../_lib/session.js';
import { clientById } from '../../_lib/db.js';
import { auditStatement } from '../../_lib/audit.js';

const ROUTE = '/api/admin/preview';
export const PREVIEW_SECONDS = 60 * 60;

export async function onRequestPost({ request, env, data }) {
  return startPreview(request, env, data);
}

export async function onRequest() {
  return reply(ROUTE, 405, 'method_not_allowed', { headers: { Allow: 'POST' } });
}

export async function startPreview(request, env, data = {}, now = new Date()) {
  if (!data.adminEmail) return reply(ROUTE, 403, 'not_admin');
  if (!env.DB || !env.SESSION_SECRET) return reply(ROUTE, 500, 'not_configured');
  const { body, error } = await readJson(ROUTE, request, allowedOrigins(env));
  if (error) return error;

  const client = typeof body.clientId === 'string' ? await clientById(env.DB, body.clientId) : null;
  if (!client) return reply(ROUTE, 404, 'not_found');
  if (!isActive(client, now.getTime())) {
    return reply(ROUTE, 409, 'inactive', { body: { ok: false, error: 'This client is revoked or expired. Issue a new code first.' } });
  }

  const nowSec = Math.floor(now.getTime() / 1000);
  const exp = Math.min(nowSec + PREVIEW_SECONDS, codeExpiry(client));
  const token = await signSession({ cid: client.clientId, cv: client.codeVersion, exp, pv: 1 }, env.SESSION_SECRET);
  await auditStatement(env.DB, { actor: data.adminEmail, action: 'client_preview', clientId: client.clientId, now }).run();
  return reply(ROUTE, 200, 'preview_started', {
    headers: { 'Set-Cookie': sessionCookie(token, exp - nowSec, env) },
    body: { ok: true, url: '/' },
  });
}

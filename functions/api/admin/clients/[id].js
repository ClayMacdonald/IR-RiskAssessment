// GET  /api/admin/clients/{id}: one client and a summary of its completed assessments.
// POST /api/admin/clients/{id}: { action: "new_code" } returns a new code once (the old code and
//   every session made with it stop working), { action: "set_expiry", expires } changes the expiry,
//   { action: "revoke" } blocks sign-in and ends live sessions at once,
//   { action: "delete_records" } deletes every completed assessment for the client.
//
// The middleware has verified the Cloudflare Access identity (data.adminEmail). Every view and
// change writes an audit row.
import { allowedOrigins, readJson, reply } from '../../../_lib/http.js';
import { clientProblem, createClientEntry } from '../../../_lib/session.js';
import { clientById, upsertClientStatement } from '../../../_lib/db.js';
import { auditStatement } from '../../../_lib/audit.js';

const ROUTE = '/api/admin/clients/:id';

export async function onRequestGet({ env, data, params }) {
  return getClient(env, data, params.id);
}

export async function onRequestPost({ request, env, data, params }) {
  return changeClient(request, env, data, params.id);
}

export async function onRequest() {
  return reply(ROUTE, 405, 'method_not_allowed', { headers: { Allow: 'GET, POST' } });
}

function clientJson(c) {
  return { clientId: c.clientId, firmName: c.firmName, expires: c.expires, revokedAt: c.revokedAt };
}

export async function getClient(env, data = {}, clientId, now = new Date()) {
  if (!data.adminEmail) return reply(ROUTE, 403, 'not_admin');
  if (!env.DB) return reply(ROUTE, 500, 'not_configured');
  const client = typeof clientId === 'string' ? await clientById(env.DB, clientId) : null;
  if (!client) return reply(ROUTE, 404, 'not_found');

  const { results } = await env.DB.prepare(
    `SELECT id, completed_at, name, email, role, readiness_score, knowledge_score
       FROM submissions WHERE client_id = ? ORDER BY completed_at DESC`
  )
    .bind(clientId)
    .all();
  const submissions = results.map((r) => ({
    id: r.id,
    completedAt: r.completed_at,
    name: r.name,
    email: r.email,
    role: r.role,
    readinessScore: r.readiness_score,
    knowledgeScore: r.knowledge_score,
  }));
  await auditStatement(env.DB, { actor: data.adminEmail, action: 'client_view', clientId, detail: { submissions: submissions.length }, now }).run();
  return reply(ROUTE, 200, 'ok', { body: { ok: true, client: clientJson(client), submissions } });
}

export async function changeClient(request, env, data = {}, clientId, now = new Date()) {
  if (!data.adminEmail) return reply(ROUTE, 403, 'not_admin');
  if (!env.DB) return reply(ROUTE, 500, 'not_configured');
  const { body, error } = await readJson(ROUTE, request, allowedOrigins(env));
  if (error) return error;
  const client = typeof clientId === 'string' ? await clientById(env.DB, clientId) : null;
  if (!client) return reply(ROUTE, 404, 'not_found');
  const actor = data.adminEmail;

  if (body.action === 'new_code') {
    // Keeps the expiry unless it has passed; then the new code runs a year from today.
    const expires = clientProblem({ ...client, expires: client.expires }, now.getTime())
      ? new Date(now.getTime() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      : client.expires;
    const { code, client: next } = await createClientEntry(client.clientId, client.firmName, expires);
    await env.DB.batch([
      upsertClientStatement(env.DB, { ...next, actor, now }),
      auditStatement(env.DB, { actor, action: 'client_new_code', clientId, detail: { expires }, now }),
    ]);
    return reply(ROUTE, 200, 'new_code', { body: { ok: true, client: clientJson({ ...client, expires, revokedAt: null }), code } });
  }

  if (body.action === 'set_expiry') {
    const problem = clientProblem({ ...client, expires: body.expires }, now.getTime());
    if (problem) return reply(ROUTE, 400, 'invalid', { body: { ok: false, error: problem } });
    await env.DB.batch([
      env.DB.prepare('UPDATE clients SET expires = ? WHERE client_id = ?').bind(body.expires, clientId),
      auditStatement(env.DB, { actor, action: 'client_set_expiry', clientId, detail: { from: client.expires, to: body.expires }, now }),
    ]);
    return reply(ROUTE, 200, 'set_expiry', { body: { ok: true, client: clientJson({ ...client, expires: body.expires }) } });
  }

  if (body.action === 'revoke') {
    if (client.revokedAt) return reply(ROUTE, 200, 'already_revoked', { body: { ok: true, client: clientJson(client) } });
    const revokedAt = now.toISOString();
    await env.DB.batch([
      env.DB.prepare('UPDATE clients SET revoked_at = ? WHERE client_id = ?').bind(revokedAt, clientId),
      auditStatement(env.DB, { actor, action: 'client_revoke', clientId, now }),
    ]);
    return reply(ROUTE, 200, 'revoked', { body: { ok: true, client: clientJson({ ...client, revokedAt }) } });
  }

  if (body.action === 'delete_records') {
    const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM submissions WHERE client_id = ?').bind(clientId).first();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM submissions WHERE client_id = ?').bind(clientId),
      auditStatement(env.DB, { actor, action: 'client_delete_records', clientId, detail: { deleted: count }, now }),
    ]);
    return reply(ROUTE, 200, 'records_deleted', { body: { ok: true, client: clientJson(client), deleted: count } });
  }

  return reply(ROUTE, 400, 'unknown_action');
}

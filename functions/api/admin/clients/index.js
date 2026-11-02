// GET  /api/admin/clients: every client with its code status and completion counts. Opening the
//   dashboard also runs the retention purge (functions/_lib/retention.js) first.
// POST /api/admin/clients: creates a client and returns its access code once. Only the hash is stored.
//
// The middleware has verified the Cloudflare Access identity (data.adminEmail). Writes are POST
// only, from the site's own origins, JSON only, and every one writes an audit row in the same batch.
import { allowedOrigins, clean, readJson, reply } from '../../../_lib/http.js';
import { clientProblem, createClientEntry } from '../../../_lib/session.js';
import { clientById, upsertClientStatement } from '../../../_lib/db.js';
import { auditStatement } from '../../../_lib/audit.js';
import { purgeExpired } from '../../../_lib/retention.js';

const ROUTE = '/api/admin/clients';

export async function onRequestGet({ env, data }) {
  return listClients(env, data);
}

export async function onRequestPost({ request, env, data }) {
  return createClient(request, env, data);
}

export async function onRequest() {
  return reply(ROUTE, 405, 'method_not_allowed', { headers: { Allow: 'GET, POST' } });
}

export async function listClients(env, data = {}, now = new Date()) {
  if (!data.adminEmail) return reply(ROUTE, 403, 'not_admin');
  if (!env.DB) return reply(ROUTE, 500, 'not_configured');
  const purged = await purgeExpired(env.DB, data.adminEmail, now);
  const { results } = await env.DB.prepare(
    `SELECT c.client_id, c.firm_name, c.expires, c.revoked_at, c.created_at,
            COUNT(s.id) AS completions, MAX(s.completed_at) AS last_completed_at
       FROM clients c LEFT JOIN submissions s ON s.client_id = c.client_id
      GROUP BY c.client_id
      ORDER BY c.firm_name COLLATE NOCASE`
  ).all();
  const clients = results.map((r) => ({
    clientId: r.client_id,
    firmName: r.firm_name,
    expires: r.expires,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
    completions: r.completions,
    lastCompletedAt: r.last_completed_at,
  }));
  return reply(ROUTE, 200, 'ok', { body: { ok: true, clients, purged } });
}

export async function createClient(request, env, data = {}, now = new Date()) {
  if (!data.adminEmail) return reply(ROUTE, 403, 'not_admin');
  if (!env.DB) return reply(ROUTE, 500, 'not_configured');
  const { body, error } = await readJson(ROUTE, request, allowedOrigins(env));
  if (error) return error;

  const input = { clientId: body.clientId, firmName: clean(body.firmName, 150) || '', expires: body.expires };
  const problem = clientProblem(input, now.getTime());
  if (problem) return reply(ROUTE, 400, 'invalid', { body: { ok: false, error: problem } });
  if (await clientById(env.DB, input.clientId)) {
    return reply(ROUTE, 409, 'exists', { body: { ok: false, error: 'A client with this ID already exists. Open it to issue a new code.' } });
  }

  const { code, client } = await createClientEntry(input.clientId, input.firmName, input.expires);
  await env.DB.batch([
    upsertClientStatement(env.DB, { ...client, actor: data.adminEmail, now }),
    auditStatement(env.DB, { actor: data.adminEmail, action: 'client_create', clientId: client.clientId, detail: { expires: client.expires }, now }),
  ]);
  return reply(ROUTE, 200, 'created', { body: { ok: true, clientId: client.clientId, firmName: client.firmName, expires: client.expires, code } });
}

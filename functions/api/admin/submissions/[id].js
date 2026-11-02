// GET  /api/admin/submissions/{id}: one completed assessment with its answers and the bank as the
//   person saw it, so the dashboard can rebuild their report. ?for=download logs a download.
// POST /api/admin/submissions/{id}: { action: "delete" } deletes the record.
//
// The middleware has verified the Cloudflare Access identity (data.adminEmail). Every view,
// download and delete writes an audit row.
import { allowedOrigins, readJson, reply } from '../../../_lib/http.js';
import { auditStatement } from '../../../_lib/audit.js';

const ROUTE = '/api/admin/submissions/:id';
const ID_RE = /^[0-9a-f]{32}$/;

export async function onRequestGet({ request, env, data, params }) {
  const purpose = new URL(request.url).searchParams.get('for') === 'download' ? 'download' : 'view';
  return getSubmission(env, data, params.id, purpose);
}

export async function onRequestPost({ request, env, data, params }) {
  return changeSubmission(request, env, data, params.id);
}

export async function onRequest() {
  return reply(ROUTE, 405, 'method_not_allowed', { headers: { Allow: 'GET, POST' } });
}

async function findRow(db, id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  return db
    .prepare(
      `SELECT s.*, c.firm_name FROM submissions s JOIN clients c ON c.client_id = s.client_id WHERE s.id = ?`
    )
    .bind(id)
    .first();
}

export async function getSubmission(env, data = {}, id, purpose = 'view', now = new Date()) {
  if (!data.adminEmail) return reply(ROUTE, 403, 'not_admin');
  if (!env.DB) return reply(ROUTE, 500, 'not_configured');
  const row = await findRow(env.DB, id);
  if (!row) return reply(ROUTE, 404, 'not_found');

  const submission = {
    id: row.id,
    clientId: row.client_id,
    firmName: row.firm_name,
    completedAt: row.completed_at,
    name: row.name,
    email: row.email,
    role: row.role,
    irpVersion: row.irp_version,
    readinessScore: row.readiness_score,
    knowledgeScore: row.knowledge_score,
    sections: JSON.parse(row.sections_json),
    missed: JSON.parse(row.missed_json),
    answers: JSON.parse(row.answers_json),
    bank: JSON.parse(row.bank_json),
  };
  const action = purpose === 'download' ? 'submission_download' : 'submission_view';
  await auditStatement(env.DB, { actor: data.adminEmail, action, clientId: row.client_id, detail: { submission: row.id }, now }).run();
  return reply(ROUTE, 200, action, { body: { ok: true, submission } });
}

export async function changeSubmission(request, env, data = {}, id, now = new Date()) {
  if (!data.adminEmail) return reply(ROUTE, 403, 'not_admin');
  if (!env.DB) return reply(ROUTE, 500, 'not_configured');
  const { body, error } = await readJson(ROUTE, request, allowedOrigins(env));
  if (error) return error;
  if (body.action !== 'delete') return reply(ROUTE, 400, 'unknown_action');
  const row = await findRow(env.DB, id);
  if (!row) return reply(ROUTE, 404, 'not_found');

  await env.DB.batch([
    env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(row.id),
    auditStatement(env.DB, { actor: data.adminEmail, action: 'submission_delete', clientId: row.client_id, detail: { submission: row.id }, now }),
  ]);
  return reply(ROUTE, 200, 'deleted', { body: { ok: true } });
}

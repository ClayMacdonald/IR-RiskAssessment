// Admin record access: view, download, delete one and delete all, with audit rows.
// Records are created through the real completion Function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSubmission, changeSubmission } from '../functions/api/admin/submissions/[id].js';
import { changeClient, getClient } from '../functions/api/admin/clients/[id].js';
import { handleCompletion } from '../functions/api/completion.js';
import { upsertClientStatement } from '../functions/_lib/db.js';
import base from '../src/content/questions.json' with { type: 'json' };
import config from '../src/content/config.json' with { type: 'json' };
import { buildBank } from '../src/bank.js';
import { buildResults, correctIndex } from '../src/scoring.js';
import { completionPayload } from '../src/payload.js';
import { reportInput } from '../src/admin/record.js';
import { createD1 } from './d1.mjs';

const ORIGIN = 'https://irp.advisordefense.com';
const ADMIN = { adminEmail: 'analyst@advisordefense.com' };
const BANK = buildBank(base, null, config.irpVersion);

const consoleLog = console.log;
console.log = () => {};
test.after(() => (console.log = consoleLog));

async function setup() {
  const DB = createD1();
  for (const [clientId, firmName] of [['acme', 'Acme Wealth Partners'], ['other', 'Other Firm']]) {
    await upsertClientStatement(DB, { clientId, firmName, codeHash: clientId.padEnd(64, '0'), expires: '2099-12-31', actor: 'test' }).run();
  }
  return { DB, RESEND_API_KEY: 're_local_dev_dummy', RESEND_FROM_EMAIL: 'x <x@example.com>', COMPLETION_NOTIFY_EMAIL: 'x@example.com', TURNSTILE_SECRET_KEY: 'ts' };
}

const answers = () => Object.fromEntries(BANK.questions.map((q, i) => [q.id, q.type === 'knowledge' ? (i % 2 ? correctIndex(q) : (correctIndex(q) + 1) % 4) : i % 3]));

async function complete(env, clientId, name) {
  const body = { ...completionPayload({ name, email: `${name.split(' ')[0].toLowerCase()}@example.com`, role: 'CSIRT Lead' }, BANK, answers()), turnstileToken: 't' };
  const request = new Request(`${ORIGIN}/api/completion`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const turnstile = async () => new Response(JSON.stringify({ success: true, action: 'completion', hostname: 'irp.advisordefense.com' }));
  assert.equal((await handleCompletion(request, env, { clientId, firmName: 'ignored' }, turnstile, {})).status, 200);
  return (await env.DB.prepare('SELECT id FROM submissions WHERE name = ?').bind(name).first()).id;
}

const post = (body) => new Request(`${ORIGIN}/api/admin/x`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const audit = async (env) => (await env.DB.prepare('SELECT action, client_id, detail FROM audit_log ORDER BY id').all()).results;

test('a record comes back with what the PDF needs, and rebuilds the same scores', async () => {
  const env = await setup();
  const id = await complete(env, 'acme', 'Jordan Example');
  const res = await getSubmission(env, ADMIN, id);
  assert.equal(res.status, 200);
  const { submission: s } = await res.json();
  assert.equal(s.firmName, 'Acme Wealth Partners', 'registered firm name, not the session data');
  assert.equal(s.name, 'Jordan Example');
  assert.deepEqual(s.answers, answers());
  assert.deepEqual(s.bank, BANK);

  const input = reportInput(s);
  const rebuilt = buildResults({ bank: input.bank, answers: input.answers }, config.knowledgeBands);
  assert.equal(rebuilt.readiness.score, s.readinessScore);
  assert.equal(rebuilt.knowledge.score, s.knowledgeScore);
  assert.deepEqual(rebuilt.missed.map((q) => q.id), s.missed);
  assert.equal(input.completedAt.toISOString(), s.completedAt);
});

test('views and downloads are audited separately', async () => {
  const env = await setup();
  const id = await complete(env, 'acme', 'Jordan Example');
  await getSubmission(env, ADMIN, id, 'view');
  await getSubmission(env, ADMIN, id, 'download');
  const rows = await audit(env);
  assert.deepEqual(rows.map((r) => r.action), ['submission_view', 'submission_download']);
  assert.ok(rows.every((r) => r.client_id === 'acme' && JSON.parse(r.detail).submission === id));
  assert.ok(!JSON.stringify(rows).includes('Jordan'), 'no personal data in the audit log');
});

test('unknown and malformed IDs get 404 and touch nothing', async () => {
  const env = await setup();
  for (const id of ['0'.repeat(32), 'not-an-id', "' OR 1=1 --", undefined]) {
    assert.equal((await getSubmission(env, ADMIN, id)).status, 404, String(id));
  }
  assert.equal((await audit(env)).length, 0);
});

test('delete removes one record; delete all removes only that client\'s records', async () => {
  const env = await setup();
  const a1 = await complete(env, 'acme', 'Avery One');
  await complete(env, 'acme', 'Blake Two');
  const o1 = await complete(env, 'other', 'Casey Three');

  assert.equal((await changeSubmission(post({ action: 'delete' }), env, ADMIN, a1)).status, 200);
  assert.equal((await getSubmission(env, ADMIN, a1)).status, 404);
  assert.equal((await changeSubmission(post({ action: 'delete' }), env, ADMIN, a1)).status, 404, 'already gone');
  assert.equal((await changeSubmission(post({ action: 'archive' }), env, ADMIN, o1)).status, 400);

  const res = await changeClient(post({ action: 'delete_records' }), env, ADMIN, 'acme');
  assert.equal((await res.json()).deleted, 1);
  const left = (await env.DB.prepare('SELECT client_id FROM submissions').all()).results;
  assert.deepEqual(left.map((r) => r.client_id), ['other']);
  // The client itself stays, with no records.
  assert.deepEqual((await (await getClient(env, ADMIN, 'acme')).json()).submissions, []);

  const actions = (await audit(env)).map((r) => [r.action, r.detail && JSON.parse(r.detail)]);
  assert.deepEqual(actions.slice(0, 2), [['submission_delete', { submission: a1 }], ['client_delete_records', { deleted: 1 }]]);
});

test('record endpoints refuse without an admin identity or from another origin', async () => {
  const env = await setup();
  const id = await complete(env, 'acme', 'Jordan Example');
  assert.equal((await getSubmission(env, {}, id)).status, 403);
  assert.equal((await changeSubmission(post({ action: 'delete' }), env, {}, id)).status, 403);
  const evil = new Request(`${ORIGIN}/api/admin/x`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{"action":"delete"}' });
  assert.equal((await changeSubmission(evil, env, ADMIN, id)).status, 403);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM submissions').first()).n, 1);
});

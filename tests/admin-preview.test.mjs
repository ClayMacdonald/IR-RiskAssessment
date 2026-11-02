// Admin preview: a one-hour client session flagged as a preview, where nothing is saved or sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startPreview } from '../functions/api/admin/preview.js';
import { handleCompletion } from '../functions/api/completion.js';
import { clientResponse } from '../functions/api/client.js';
import { gate } from '../functions/_middleware.js';
import { COOKIE_NAME, verifySession } from '../functions/_lib/session.js';
import { upsertClientStatement } from '../functions/_lib/db.js';
import base from '../src/content/questions.json' with { type: 'json' };
import config from '../src/content/config.json' with { type: 'json' };
import { buildBank } from '../src/bank.js';
import { completionPayload } from '../src/payload.js';
import { createD1 } from './d1.mjs';

const ORIGIN = 'https://irp.advisordefense.com';
const ADMIN = { adminEmail: 'analyst@advisordefense.com' };
const SECRET = 'test-session-secret-at-least-32-characters-long';

const consoleLog = console.log;
console.log = () => {};
test.after(() => (console.log = consoleLog));

async function setup() {
  const DB = createD1();
  await upsertClientStatement(DB, { clientId: 'acme', firmName: 'Acme', codeHash: 'a'.repeat(64), expires: '2099-12-31', actor: 't' }).run();
  await upsertClientStatement(DB, { clientId: 'gone', firmName: 'Gone', codeHash: 'b'.repeat(64), expires: '2099-12-31', actor: 't' }).run();
  await DB.prepare("UPDATE clients SET revoked_at = '2026-01-01T00:00:00Z' WHERE client_id = 'gone'").run();
  return {
    DB,
    SESSION_SECRET: SECRET,
    RESEND_API_KEY: 're_test',
    RESEND_FROM_EMAIL: 'x <x@example.com>',
    COMPLETION_NOTIFY_EMAIL: 'x@example.com',
    TURNSTILE_SECRET_KEY: 'ts',
  };
}

const post = (path, body) => new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('preview signs in as the client for at most an hour, flagged, and is audited', async () => {
  const env = await setup();
  const res = await startPreview(post('/api/admin/preview', { clientId: 'acme' }), env, ADMIN);
  assert.equal(res.status, 200);
  const cookie = res.headers.get('Set-Cookie');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=3600']) assert.ok(cookie.includes(flag), flag);
  const token = cookie.split(';')[0].split('=')[1];
  const session = await verifySession(token, SECRET);
  assert.equal(session.pv, 1);
  assert.equal(session.cid, 'acme');

  const data = {};
  const request = new Request(`${ORIGIN}/api/client`, { headers: { Cookie: `${COOKIE_NAME}=${token}` } });
  assert.equal((await gate({ request, env, next: async () => new Response('ok'), data })).status, 200);
  assert.equal(data.preview, true);
  assert.equal((await (await clientResponse(data, {})).json()).preview, true);

  const audit = await env.DB.prepare('SELECT action, client_id, actor_email FROM audit_log').all();
  assert.deepEqual(audit.results.map((r) => ({ ...r })), [{ action: 'client_preview', client_id: 'acme', actor_email: 'analyst@advisordefense.com' }]);
});

test('a preview completion stores nothing and sends nothing', async () => {
  const env = await setup();
  const bank = buildBank(base, null, config.irpVersion);
  const body = { ...completionPayload({ name: 'Preview Person', email: 'p@advisordefense.com', role: 'CSIRT Lead' }, bank, Object.fromEntries(bank.questions.map((q) => [q.id, 0]))), turnstileToken: 't' };
  const calls = [];
  const fetchImpl = async (url) => (calls.push(url), new Response('{}'));
  const res = await handleCompletion(post('/api/completion', body), env, { clientId: 'acme', firmName: 'Acme', preview: true }, fetchImpl, {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, preview: true });
  assert.equal(calls.length, 0, 'no Turnstile or Resend call');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM submissions').first()).n, 0);
});

test('a normal session is not a preview', async () => {
  assert.equal((await (await clientResponse({ clientId: 'acme' }, {})).json()).preview, false);
});

test('preview refuses inactive or unknown clients, non-admins and other origins', async () => {
  const env = await setup();
  assert.equal((await startPreview(post('/api/admin/preview', { clientId: 'gone' }), env, ADMIN)).status, 409);
  assert.equal((await startPreview(post('/api/admin/preview', { clientId: 'nobody' }), env, ADMIN)).status, 404);
  assert.equal((await startPreview(post('/api/admin/preview', { clientId: 'acme' }), env, {})).status, 403);
  const evil = new Request(`${ORIGIN}/api/admin/preview`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{"clientId":"acme"}' });
  const res = await startPreview(evil, env, ADMIN);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('Set-Cookie'), null);
});

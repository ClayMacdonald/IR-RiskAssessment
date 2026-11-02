// Admin client management: list, create, new code, expiry and revoke, with audit rows.
// D1 is the node:sqlite adapter in tests/d1.mjs, with the real migrations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listClients, createClient } from '../functions/api/admin/clients/index.js';
import { getClient, changeClient } from '../functions/api/admin/clients/[id].js';
import { handleLogin } from '../functions/api/login.js';
import { gate } from '../functions/_middleware.js';
import { COOKIE_NAME, hashCode } from '../functions/_lib/session.js';
import { createD1 } from './d1.mjs';

const ORIGIN = 'https://irp.advisordefense.com';
const ADMIN = { adminEmail: 'analyst@advisordefense.com' };
const SECRET = 'test-session-secret-at-least-32-characters-long';

const consoleLog = console.log;
console.log = () => {};
test.after(() => (console.log = consoleLog));

const env = () => ({ DB: createD1(), SESSION_SECRET: SECRET, TURNSTILE_SECRET_KEY: 'ts' });

function post(path, body, { origin = ORIGIN } = {}) {
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

const turnstileOk = async () => new Response(JSON.stringify({ success: true, action: 'login', hostname: 'irp.advisordefense.com' }));

async function signIn(e, code) {
  const res = await handleLogin(post('/api/login', { code, turnstileToken: 't' }), e, turnstileOk);
  return res.status === 200 ? res.headers.get('Set-Cookie').split(';')[0].split('=')[1] : null;
}

async function opensGate(e, token) {
  const request = new Request(`${ORIGIN}/assets/a.js`, { headers: { Cookie: `${COOKIE_NAME}=${token}` } });
  return (await gate({ request, env: e, next: async () => new Response('ok'), data: {} })).status === 200;
}

const audit = async (e) => (await e.DB.prepare('SELECT actor_email, action, client_id, detail FROM audit_log ORDER BY id').all()).results;
const NEW = { clientId: 'acme-wealth', firmName: 'Acme Wealth Partners', expires: '2099-12-31' };

test('create returns the code once, stores only its hash, and the code signs in', async () => {
  const e = env();
  const res = await createClient(post('/api/admin/clients', NEW), e, ADMIN);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.code, /^[A-HJKMNP-Z2-9]{5}(-[A-HJKMNP-Z2-9]{5}){3}$/);

  const row = await e.DB.prepare('SELECT * FROM clients WHERE client_id = ?').bind('acme-wealth').first();
  assert.equal(row.code_hash, await hashCode(body.code));
  assert.equal(row.created_by, 'analyst@advisordefense.com');
  assert.ok(!JSON.stringify(row).includes(body.code), 'plaintext code not stored');
  const auditRows = await audit(e);
  assert.deepEqual(auditRows.map((a) => [a.action, a.client_id, a.actor_email]), [['client_create', 'acme-wealth', 'analyst@advisordefense.com']]);
  assert.ok(!JSON.stringify(auditRows).includes(body.code), 'code not in the audit log');

  assert.ok(await signIn(e, body.code));
  // The list never includes a code or hash.
  const list = await (await listClients(e, ADMIN)).json();
  assert.equal(list.clients.length, 1);
  assert.deepEqual(Object.keys(list.clients[0]).sort(), ['clientId', 'completions', 'createdAt', 'expires', 'firmName', 'lastCompletedAt', 'revokedAt']);
});

test('create validates input, refuses duplicates and checks the origin', async () => {
  const e = env();
  for (const bad of [
    { ...NEW, clientId: 'Acme Wealth' },
    { ...NEW, clientId: '-acme' },
    { ...NEW, firmName: '' },
    { ...NEW, firmName: 'x'.repeat(151) },
    { ...NEW, expires: '2020-01-01' },
    { ...NEW, expires: '12/31/2099' },
  ]) {
    assert.equal((await createClient(post('/api/admin/clients', bad), e, ADMIN)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await createClient(post('/api/admin/clients', NEW), e, ADMIN)).status, 200);
  const dup = await createClient(post('/api/admin/clients', { ...NEW, firmName: 'Someone Else' }), e, ADMIN);
  assert.equal(dup.status, 409);
  const row = await e.DB.prepare('SELECT firm_name, code_version FROM clients').first();
  assert.deepEqual({ ...row }, { firm_name: 'Acme Wealth Partners', code_version: 1 }, 'duplicate did not replace the code');
  assert.equal((await createClient(post('/api/admin/clients', { ...NEW, clientId: 'other' }, { origin: 'https://evil.example' }), e, ADMIN)).status, 403);
});

test('a new code ends the old code and its sessions', async () => {
  const e = env();
  const { code } = await (await createClient(post('/api/admin/clients', NEW), e, ADMIN)).json();
  const oldSession = await signIn(e, code);
  assert.ok(await opensGate(e, oldSession));

  const res = await changeClient(post('/api/admin/clients/acme-wealth', { action: 'new_code' }), e, ADMIN, 'acme-wealth');
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.notEqual(body.code, code);
  assert.equal(await signIn(e, code), null, 'old code refused');
  assert.equal(await opensGate(e, oldSession), false, 'old session ended');
  assert.ok(await opensGate(e, await signIn(e, body.code)), 'new code works');
  assert.deepEqual((await audit(e)).map((a) => a.action), ['client_create', 'client_new_code']);
});

test('revoke ends sessions at once; a new code restores access', async () => {
  const e = env();
  const { code } = await (await createClient(post('/api/admin/clients', NEW), e, ADMIN)).json();
  const session = await signIn(e, code);
  const res = await changeClient(post('/api/admin/clients/acme-wealth', { action: 'revoke' }), e, ADMIN, 'acme-wealth');
  assert.equal(res.status, 200);
  assert.ok((await res.json()).client.revokedAt);
  assert.equal(await opensGate(e, session), false);
  assert.equal(await signIn(e, code), null);

  const { code: fresh } = await (await changeClient(post('/api/admin/clients/acme-wealth', { action: 'new_code' }), e, ADMIN, 'acme-wealth')).json();
  assert.ok(await signIn(e, fresh));
  assert.deepEqual((await audit(e)).map((a) => a.action), ['client_create', 'client_revoke', 'client_new_code']);
});

test('set expiry keeps the code and validates the date', async () => {
  const e = env();
  const { code } = await (await createClient(post('/api/admin/clients', NEW), e, ADMIN)).json();
  const res = await changeClient(post('/api/admin/clients/acme-wealth', { action: 'set_expiry', expires: '2098-06-30' }), e, ADMIN, 'acme-wealth');
  assert.equal((await res.json()).client.expires, '2098-06-30');
  assert.ok(await signIn(e, code), 'same code still works');
  assert.equal((await changeClient(post('/api/admin/clients/acme-wealth', { action: 'set_expiry', expires: '2001-01-01' }), e, ADMIN, 'acme-wealth')).status, 400);
  const [, change] = await audit(e);
  assert.deepEqual(JSON.parse(change.detail), { from: '2099-12-31', to: '2098-06-30' });
});

test('client view lists completions and is audited; unknown clients and actions are refused', async () => {
  const e = env();
  await createClient(post('/api/admin/clients', NEW), e, ADMIN);
  const res = await getClient(e, ADMIN, 'acme-wealth');
  const body = await res.json();
  assert.equal(body.client.firmName, 'Acme Wealth Partners');
  assert.deepEqual(body.submissions, []);
  assert.equal((await audit(e)).at(-1).action, 'client_view');
  assert.equal((await getClient(e, ADMIN, 'nobody')).status, 404);
  assert.equal((await changeClient(post('/api/admin/clients/acme-wealth', { action: 'delete_everything' }), e, ADMIN, 'acme-wealth')).status, 400);
});

test('every admin handler refuses without an admin identity', async () => {
  const e = env();
  assert.equal((await listClients(e, {})).status, 403);
  assert.equal((await createClient(post('/api/admin/clients', NEW), e, {})).status, 403);
  assert.equal((await getClient(e, {}, 'acme-wealth')).status, 403);
  assert.equal((await changeClient(post('/api/admin/clients/acme-wealth', { action: 'revoke' }), e, {}, 'acme-wealth')).status, 403);
  assert.equal((await audit(e)).length, 0);
});

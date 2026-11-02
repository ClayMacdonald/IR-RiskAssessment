// Admin identity: Cloudflare Access JWT verification and the admin route group in the middleware.
// Keys are generated here and the certs endpoint is mocked; no network calls.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { gate, isAdmin } from '../functions/_middleware.js';
import { adminIdentity, clearCertCache, emailAllowed, JWT_HEADER } from '../functions/_lib/admin.js';
import { onRequestGet as me } from '../functions/api/admin/me.js';
import { signSession, COOKIE_NAME } from '../functions/_lib/session.js';
import { upsertClientStatement } from '../functions/_lib/db.js';
import { createD1 } from './d1.mjs';

const TEAM = 'advisordefense.cloudflareaccess.com';
const AUD = 'aud-tag-0123456789abcdef';
const ORIGIN = 'https://irp.advisordefense.com';
const SECRET = 'test-session-secret-at-least-32-characters-long';
const ENV = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ADMIN_EMAIL_DOMAIN: 'advisordefense.com', SESSION_SECRET: SECRET };

const consoleLog = console.log;
console.log = () => {};
test.after(() => (console.log = consoleLog));

const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const part = (obj) => b64url(enc.encode(JSON.stringify(obj)));

async function keyPair(kid) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'RS256', use: 'sig' };
  return { privateKey: pair.privateKey, jwk };
}

const KEY = await keyPair('kid-1');
const OTHER = await keyPair('kid-1');

const nowS = () => Math.floor(Date.now() / 1000);

function claims(extra = {}) {
  return { iss: `https://${TEAM}`, aud: [AUD], email: 'Analyst@AdvisorDefense.com', type: 'app', iat: nowS(), nbf: nowS() - 5, exp: nowS() + 3600, ...extra };
}

async function jwt(body = claims(), { key = KEY, header = { alg: 'RS256', kid: 'kid-1', typ: 'JWT' } } = {}) {
  const signingInput = `${part(header)}.${part(body)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, enc.encode(signingInput));
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

function certs(keys = [KEY.jwk]) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return new Response(JSON.stringify({ keys }), { status: 200 });
  };
  return { fetchImpl, calls };
}

const req = (path, { token, cookie, host = ORIGIN } = {}) => {
  const headers = { Accept: 'application/json' };
  if (token) headers[JWT_HEADER] = token;
  if (cookie) headers.Cookie = cookie;
  return new Request(`${host}${path}`, { headers });
};

const nextOk = () => {
  const calls = [];
  return { calls, next: async () => (calls.push(1), new Response('admin content', { status: 200 })) };
};

beforeEach(() => clearCertCache());

test('admin paths are grouped; nothing else is', () => {
  for (const p of ['/admin', '/admin/', '/admin/index.html', '/admin/assets/a.js', '/api/admin', '/api/admin/me']) assert.ok(isAdmin(p), p);
  for (const p of ['/', '/administrator', '/api/administer', '/assets/admin.js', '/login/admin']) assert.ok(!isAdmin(p), p);
});

test('a valid Access JWT for an AdvisorDefense email opens the admin side', async () => {
  const { fetchImpl, calls } = certs();
  const data = {};
  const { next, calls: served } = nextOk();
  const res = await gate({ request: req('/api/admin/me', { token: await jwt() }), env: ENV, next, data }, fetchImpl);
  assert.equal(res.status, 200);
  assert.equal(served.length, 1);
  assert.equal(data.adminEmail, 'analyst@advisordefense.com');
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(calls, [`https://${TEAM}/cdn-cgi/access/certs`]);
  const body = await (await me({ data })).json();
  assert.deepEqual(body, { ok: true, email: 'analyst@advisordefense.com' });
});

test('signing keys are cached, and an unknown kid triggers one refetch', async () => {
  const { fetchImpl, calls } = certs();
  await adminIdentity(req('/admin/', { token: await jwt() }), ENV, fetchImpl);
  await adminIdentity(req('/admin/', { token: await jwt() }), ENV, fetchImpl);
  assert.equal(calls.length, 1);
  const unknown = await jwt(claims(), { header: { alg: 'RS256', kid: 'kid-9' } });
  assert.equal(await adminIdentity(req('/admin/', { token: unknown }), ENV, fetchImpl), null);
  assert.equal(calls.length, 2);
});

test('bad tokens are refused with 403 and the content is never served', async () => {
  const cases = {
    missing: undefined,
    garbage: 'not.a.jwt',
    'wrong key': await jwt(claims(), { key: OTHER }),
    'tampered claims': (await jwt()).replace(/^([^.]+)\.[^.]+/, (m, h) => `${h}.${part(claims({ email: 'boss@advisordefense.com' }))}`),
    'alg none': `${part({ alg: 'none', kid: 'kid-1' })}.${part(claims())}.`,
    'HS256 header': await jwt(claims(), { header: { alg: 'HS256', kid: 'kid-1' } }),
    'wrong audience': await jwt(claims({ aud: ['someone-else'] })),
    'wrong issuer': await jwt(claims({ iss: 'https://evil.cloudflareaccess.com' })),
    expired: await jwt(claims({ exp: nowS() - 1 })),
    'not yet valid': await jwt(claims({ nbf: nowS() + 600 })),
    'outside email domain': await jwt(claims({ email: 'someone@clientfirm.com' })),
    'lookalike domain': await jwt(claims({ email: 'x@evil-advisordefense.com' })),
    'subdomain email': await jwt(claims({ email: 'x@mail.advisordefense.com' })),
    'service token, no email': await jwt(claims({ email: undefined, common_name: 'svc' })),
  };
  for (const [name, token] of Object.entries(cases)) {
    const { next, calls } = nextOk();
    const res = await gate({ request: req('/api/admin/me', { token }), env: ENV, next, data: {} }, certs().fetchImpl);
    assert.equal(res.status, 403, name);
    assert.equal(calls.length, 0, `${name}: not served`);
    assert.deepEqual(await res.json(), { ok: false, error: 'admin_only' });
  }
});

test('missing or malformed Access settings fail closed', async () => {
  const token = await jwt();
  for (const env of [
    {},
    { ...ENV, ACCESS_AUD: '' },
    { ...ENV, ADMIN_EMAIL_DOMAIN: '' },
    { ...ENV, ACCESS_TEAM_DOMAIN: '' },
    { ...ENV, ACCESS_TEAM_DOMAIN: 'evil.example.com' },
    { ...ENV, ACCESS_TEAM_DOMAIN: `${TEAM}/x` },
  ]) {
    const { fetchImpl, calls } = certs();
    assert.equal(await adminIdentity(req('/admin/', { token }), env, fetchImpl), null);
    assert.equal(calls.length, 0, 'no key fetch without valid settings');
  }
});

test('a certs outage fails closed', async () => {
  const fetchImpl = async () => new Response('down', { status: 503 });
  assert.equal(await adminIdentity(req('/admin/', { token: await jwt() }), ENV, fetchImpl), null);
  const throws = async () => { throw new Error('network'); };
  assert.equal(await adminIdentity(req('/admin/', { token: await jwt() }), ENV, throws), null);
});

test('a pages.dev request with a forged header gets 403 (Access does not cover that host)', async () => {
  const forged = await jwt(claims(), { key: OTHER });
  const { next, calls } = nextOk();
  const res = await gate({ request: req('/admin/', { token: forged, host: 'https://irp-assessment.pages.dev' }), env: ENV, next, data: {} }, certs().fetchImpl);
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test('a client session never opens the admin side', async () => {
  const DB = createD1();
  await upsertClientStatement(DB, { clientId: 'acme', firmName: 'Acme', codeHash: 'a'.repeat(64), expires: '2099-12-31', actor: 'test' }).run();
  const token = await signSession({ cid: 'acme', cv: 1, exp: nowS() + 3600 }, SECRET);
  const env = { ...ENV, DB };
  const cookie = `${COOKIE_NAME}=${token}`;
  for (const path of ['/admin/', '/api/admin/me']) {
    const { next, calls } = nextOk();
    const res = await gate({ request: req(path, { cookie }), env, next, data: {} }, certs().fetchImpl);
    assert.equal(res.status, 403, path);
    assert.equal(calls.length, 0);
  }
  // The same session still opens the client side.
  const { next, calls } = nextOk();
  assert.equal((await gate({ request: req('/assets/a.js', { cookie }), env, next, data: {} })).status, 200);
  assert.equal(calls.length, 1);
});

test('an admin identity does not open the client side', async () => {
  const { next, calls } = nextOk();
  const res = await gate({ request: req('/assets/a.js', { token: await jwt() }), env: { ...ENV, DB: createD1() }, next, data: {} }, certs().fetchImpl);
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test('local dev: ADMIN_DEV_EMAIL stands in for the JWT only in local dev mode', async () => {
  const local = { ADMIN_EMAIL_DOMAIN: 'advisordefense.com', ADMIN_DEV_EMAIL: 'dev@advisordefense.com', LOCAL_DEV: '1', ALLOWED_ORIGINS: 'http://localhost:5173' };
  assert.deepEqual(await adminIdentity(req('/admin/'), local), { email: 'dev@advisordefense.com' });
  // Production origins: LOCAL_DEV and ADMIN_DEV_EMAIL are ignored, so a JWT is still required.
  const stray = { ...ENV, LOCAL_DEV: '1', ADMIN_DEV_EMAIL: 'dev@advisordefense.com' };
  assert.equal(await adminIdentity(req('/admin/'), stray, certs().fetchImpl), null);
  // Without LOCAL_DEV it does nothing either.
  assert.equal(await adminIdentity(req('/admin/'), { ...local, LOCAL_DEV: undefined }), null);
  // The dev email must still be in the admin domain.
  assert.equal(await adminIdentity(req('/admin/'), { ...local, ADMIN_DEV_EMAIL: 'dev@example.com' }), null);
});

test('email domain matching is exact', () => {
  assert.ok(emailAllowed('a@advisordefense.com', 'advisordefense.com'));
  assert.ok(emailAllowed('A@AdvisorDefense.COM', 'advisordefense.com'));
  for (const e of ['a@advisordefense.com.evil.com', 'a@xadvisordefense.com', 'advisordefense.com', '', null]) assert.ok(!emailAllowed(e, 'advisordefense.com'), String(e));
  assert.ok(!emailAllowed('a@advisordefense.com', ''));
});

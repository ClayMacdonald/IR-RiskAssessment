// Access control: middleware, sessions, login, logout and the client endpoint.
// Turnstile is mocked. Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, isPublic } from '../functions/_middleware.js';
import { handleLogin } from '../functions/api/login.js';
import { onRequestPost as logout } from '../functions/api/logout.js';
import { clientResponse } from '../functions/api/client.js';
import { isLocalDev } from '../functions/_lib/http.js';
import {
  COOKIE_NAME,
  DEV_COOKIE_NAME,
  generateCode,
  hashCode,
  normalizeCode,
  signSession,
  timingSafeEqual,
  verifySession,
} from '../functions/_lib/session.js';
import { upsertClientStatement } from '../functions/_lib/db.js';
import { createD1 } from './d1.mjs';

const ORIGIN = 'https://irp.advisordefense.com';
const SECRET = 'test-session-secret-at-least-32-characters-long';
const CODE = 'ABCDE-FGHJK-MNPQR-STUVW';
const OLD_CODE = 'ZZZZZ-YYYYY-XXXXX-WWWWW';

const consoleLog = console.log;
console.log = () => {};
test.after(() => (console.log = consoleLog));

const DEFAULT_CLIENTS = [
  { clientId: 'acme', firmName: 'Acme Wealth', code: CODE, expires: '2099-12-31' },
  { clientId: 'oldco', firmName: 'Old Co', code: OLD_CODE, expires: '2020-01-01' },
];

async function seed(db, clients) {
  for (const c of clients) {
    await upsertClientStatement(db, { ...c, codeHash: await hashCode(c.code), actor: 'test' }).run();
  }
}

async function makeEnv(extra = {}, clients = DEFAULT_CLIENTS) {
  const DB = createD1();
  await seed(DB, clients);
  return { SESSION_SECRET: SECRET, TURNSTILE_SECRET_KEY: 'turnstile-secret', DB, ...extra };
}

const nextOk = () => {
  const calls = [];
  const next = async () => {
    calls.push(1);
    return new Response('content', { status: 200, headers: { 'Cache-Control': 'public, max-age=31536000' } });
  };
  return { next, calls };
};

const nowSec = () => Math.floor(Date.now() / 1000);

function req(path, { cookie, accept = '*/*', method = 'GET' } = {}) {
  const headers = { Accept: accept };
  if (cookie) headers.Cookie = `${COOKIE_NAME}=${cookie}`;
  return new Request(`${ORIGIN}${path}`, { method, headers });
}

function loginReq(body, { origin = ORIGIN, url = `${ORIGIN}/api/login` } = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify(body),
  });
}

function turnstileMock(result = { success: true, action: 'login', hostname: 'irp.advisordefense.com' }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(result), { status: 200 });
  };
  return { fetchImpl, calls };
}

// ---------- Middleware ----------

test('no cookie: a bundle request is blocked with 401 before login', async () => {
  const { next, calls } = nextOk();
  const res = await gate({ request: req('/assets/index-abc123.js'), env: await makeEnv(), next });
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0, 'asset never served');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('no cookie: an HTML request redirects to /login', async () => {
  const { next, calls } = nextOk();
  const res = await gate({ request: req('/', { accept: 'text/html' }), env: await makeEnv(), next });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), '/login/');
  assert.equal(calls.length, 0);
});

test('no cookie: API requests get 401, not a redirect', async () => {
  const { next } = nextOk();
  for (const path of ['/api/client', '/api/completion']) {
    const res = await gate({ request: req(path, { accept: 'text/html' , method: 'POST' }), env: await makeEnv(), next });
    assert.equal(res.status, 401, path);
  }
});

test('login page, its files, login, logout and favicon are public', async () => {
  for (const path of ['/login', '/login/', '/login/login.js', '/login/fonts/x.woff2', '/api/login', '/api/logout', '/favicon.svg']) {
    assert.ok(isPublic(path), path);
    const { next, calls } = nextOk();
    await gate({ request: req(path), env: await makeEnv(), next });
    assert.equal(calls.length, 1, `${path} served`);
  }
  for (const path of ['/', '/index.html', '/assets/a.js', '/api/client', '/loginx', '/login.html', '/src/content/questions.json']) {
    assert.ok(!isPublic(path), path);
  }
});

test('dot segments cannot escape the login prefix', async () => {
  const { next, calls } = nextOk();
  for (const path of ['/login/../assets/index.js', '/login/%2e%2e/assets/index.js']) {
    const res = await gate({ request: req(path), env: await makeEnv(), next });
    assert.equal(res.status, 401, path);
  }
  assert.equal(calls.length, 0);
});

test('bad signature is rejected', async () => {
  const good = await signSession({ cid: 'acme', cv: 1, exp: nowSec() + 3600 }, SECRET);
  const forged = await signSession({ cid: 'acme', exp: nowSec() + 3600 }, 'some-other-secret');
  const tampered = good.replace(/^[^.]+/, btoa(JSON.stringify({ cid: 'oldco', exp: nowSec() + 3600 })).replace(/=+$/, ''));
  for (const cookie of [forged, tampered, 'garbage', `${good}.extra`, '']) {
    const { next, calls } = nextOk();
    const res = await gate({ request: req('/assets/a.js', { cookie }), env: await makeEnv(), next });
    assert.equal(res.status, 401, cookie);
    assert.equal(calls.length, 0);
  }
});

test('expired session is rejected', async () => {
  const cookie = await signSession({ cid: 'acme', exp: nowSec() - 1 }, SECRET);
  const { next, calls } = nextOk();
  const res = await gate({ request: req('/assets/a.js', { cookie }), env: await makeEnv(), next });
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test('a live session for a client whose code has expired is rejected', async () => {
  const cookie = await signSession({ cid: 'oldco', cv: 1, exp: nowSec() + 3600 }, SECRET);
  const { next, calls } = nextOk();
  const res = await gate({ request: req('/assets/a.js', { cookie }), env: await makeEnv(), next });
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test('a session for a client not in the database is rejected', async () => {
  const cookie = await signSession({ cid: 'removed', cv: 1, exp: nowSec() + 3600 }, SECRET);
  const { next } = nextOk();
  const res = await gate({ request: req('/assets/a.js', { cookie }), env: await makeEnv(), next });
  assert.equal(res.status, 401);
});

test('missing configuration fails closed', async () => {
  const cookie = await signSession({ cid: 'acme', cv: 1, exp: nowSec() + 3600 }, SECRET);
  for (const env of [{}, { ...(await makeEnv()), SESSION_SECRET: '' }, { ...(await makeEnv()), DB: undefined }]) {
    const { next, calls } = nextOk();
    const res = await gate({ request: req('/assets/a.js', { cookie }), env, next });
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
  }
});

test('valid session passes, exposes clientId and keeps gated content out of shared caches', async () => {
  const cookie = await signSession({ cid: 'acme', cv: 1, exp: nowSec() + 3600 }, SECRET);
  const data = {};
  const { next, calls } = nextOk();
  const asset = await gate({ request: req('/assets/a.js', { cookie }), env: await makeEnv(), next, data });
  assert.equal(asset.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(data.clientId, 'acme');
  assert.equal(data.firmName, 'Acme Wealth');
  assert.match(asset.headers.get('Cache-Control'), /^private/);
  assert.match(asset.headers.get('Vary'), /Cookie/);

  const page = await gate({ request: req('/', { cookie }), env: await makeEnv(), next, data: {} });
  assert.equal(page.headers.get('Cache-Control'), 'private, no-store');
});

test('revoking a client blocks sign-in and ends live sessions', async () => {
  const env = await makeEnv();
  const cookie = await signSession({ cid: 'acme', cv: 1, exp: nowSec() + 3600 }, SECRET);
  await env.DB.prepare('UPDATE clients SET revoked_at = ? WHERE client_id = ?').bind(new Date().toISOString(), 'acme').run();
  const { next, calls } = nextOk();
  assert.equal((await gate({ request: req('/assets/a.js', { cookie }), env, next })).status, 401);
  assert.equal(calls.length, 0);
  const res = await handleLogin(loginReq({ code: CODE, turnstileToken: 'tok' }), env, turnstileMock().fetchImpl);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { ok: false, error: 'sign_in_failed' });
});

test('issuing a new code ends sessions made with the old one', async () => {
  const env = await makeEnv();
  const old = await signSession({ cid: 'acme', cv: 1, exp: nowSec() + 3600 }, SECRET);
  const NEW_CODE = 'NNNNN-PPPPP-QQQQQ-RRRRR';
  await seed(env.DB, [{ clientId: 'acme', firmName: 'Acme Wealth', code: NEW_CODE, expires: '2099-12-31' }]);
  const { next } = nextOk();
  assert.equal((await gate({ request: req('/assets/a.js', { cookie: old }), env, next })).status, 401, 'old session');
  const oldCode = await handleLogin(loginReq({ code: CODE, turnstileToken: 'tok' }), env, turnstileMock().fetchImpl);
  assert.equal(oldCode.status, 401, 'old code');
  const res = await handleLogin(loginReq({ code: NEW_CODE, turnstileToken: 'tok' }), env, turnstileMock().fetchImpl);
  const token = res.headers.get('Set-Cookie').split(';')[0].split('=')[1];
  assert.equal((await verifySession(token, SECRET)).cv, 2);
  assert.equal((await gate({ request: req('/assets/a.js', { cookie: token }), env, next, data: {} })).status, 200);
});

test('a session without a code version is rejected', async () => {
  const cookie = await signSession({ cid: 'acme', exp: nowSec() + 3600 }, SECRET);
  const { next } = nextOk();
  assert.equal((await gate({ request: req('/assets/a.js', { cookie }), env: await makeEnv(), next })).status, 401);
});

// ---------- Sessions and codes ----------

test('sessions verify only with the right secret and before expiry', async () => {
  const token = await signSession({ cid: 'acme', exp: nowSec() + 60 }, SECRET);
  assert.deepEqual(await verifySession(token, SECRET), { cid: 'acme', exp: nowSec() + 60 });
  assert.equal(await verifySession(token, 'wrong'), null);
  assert.equal(await verifySession(token, SECRET, Date.now() + 61_000), null);
});

test('codes normalize, hash consistently and have about 99 bits of entropy', async () => {
  assert.equal(normalizeCode(' abcde-fghjk mnpqr-stuvw '), 'ABCDEFGHJKMNPQRSTUVW');
  assert.equal(await hashCode('abcde-fghjk-mnpqr-stuvw'), await hashCode(CODE));
  const code = generateCode();
  assert.match(code, /^[A-HJKMNP-Z2-9]{5}(-[A-HJKMNP-Z2-9]{5}){3}$/);
  assert.notEqual(generateCode(), code);
  assert.ok(timingSafeEqual('abc', 'abc'));
  assert.ok(!timingSafeEqual('abc', 'abd'));
  assert.ok(!timingSafeEqual('abc', 'abcd'));
});

// ---------- Login ----------

test('valid code signs in with a locked-down cookie carrying only clientId, code version and expiry', async () => {
  const { fetchImpl, calls } = turnstileMock();
  const res = await handleLogin(loginReq({ code: 'abcde fghjk mnpqr stuvw', turnstileToken: 'tok' }), await makeEnv(), fetchImpl);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1, 'Turnstile verified');
  const cookie = res.headers.get('Set-Cookie');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=28800']) assert.ok(cookie.includes(flag), flag);
  assert.ok(cookie.startsWith(`${COOKIE_NAME}=`));
  const token = cookie.split(';')[0].split('=')[1];
  const payload = await verifySession(token, SECRET);
  assert.deepEqual(Object.keys(payload).sort(), ['cid', 'cv', 'exp']);
  assert.equal(payload.cid, 'acme');
  assert.equal(payload.cv, 1);
});

test('full flow: the login cookie opens the gate', async () => {
  const env = await makeEnv();
  const res = await handleLogin(loginReq({ code: CODE, turnstileToken: 'tok' }), env, turnstileMock().fetchImpl);
  const token = res.headers.get('Set-Cookie').split(';')[0].split('=')[1];
  const { next } = nextOk();
  const asset = await gate({ request: req('/assets/a.js', { cookie: token }), env, next, data: {} });
  assert.equal(asset.status, 200);
});

test('unknown and expired codes get the same generic response', async () => {
  const env = await makeEnv();
  const bodies = [];
  for (const code of ['NOPE1-NOPE2-NOPE3-NOPE4', OLD_CODE]) {
    const res = await handleLogin(loginReq({ code, turnstileToken: 'tok' }), env, turnstileMock().fetchImpl);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('Set-Cookie'), null);
    bodies.push(await res.text());
  }
  assert.equal(bodies[0], bodies[1]);
  assert.deepEqual(JSON.parse(bodies[0]), { ok: false, error: 'sign_in_failed' });
});

test('a session never outlives its code', async () => {
  const env = await makeEnv({}, [{ clientId: 'acme', firmName: 'Acme', code: CODE, expires: '2030-01-01' }]);
  const now = Date.parse('2030-01-01T22:00:00Z');
  const res = await handleLogin(loginReq({ code: CODE, turnstileToken: 'tok' }), env, turnstileMock().fetchImpl, now);
  assert.equal(res.status, 200);
  assert.ok(res.headers.get('Set-Cookie').includes(`Max-Age=${2 * 3600 - 1}`));
});

test('Turnstile failure, wrong action or wrong hostname rejects with the generic response', async () => {
  const env = await makeEnv();
  for (const result of [
    { success: false },
    { success: true, action: 'completion', hostname: 'irp.advisordefense.com' },
    { success: true, action: 'login', hostname: 'evil.example' },
  ]) {
    const res = await handleLogin(loginReq({ code: CODE, turnstileToken: 'tok' }), env, turnstileMock(result).fetchImpl);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { ok: false, error: 'sign_in_failed' });
  }
  const missing = await handleLogin(loginReq({ code: CODE }), env, turnstileMock().fetchImpl);
  assert.equal(missing.status, 401);
});

test('bad origin, bad content type and oversized bodies are refused', async () => {
  const env = await makeEnv();
  const { fetchImpl, calls } = turnstileMock();
  assert.equal((await handleLogin(loginReq({ code: CODE }, { origin: 'https://evil.example' }), env, fetchImpl)).status, 403);
  const text = new Request(`${ORIGIN}/api/login`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' }, body: 'x' });
  assert.equal((await handleLogin(text, env, fetchImpl)).status, 415);
  assert.equal((await handleLogin(loginReq({ code: CODE, pad: 'x'.repeat(5000) }), env, fetchImpl)).status, 413);
  assert.equal(calls.length, 0, 'Turnstile never called');
});

test('missing secrets fail closed', async () => {
  const env = await makeEnv({ SESSION_SECRET: '' });
  assert.equal((await handleLogin(loginReq({ code: CODE, turnstileToken: 't' }), env, turnstileMock().fetchImpl)).status, 500);
  const noTurnstile = await makeEnv({ TURNSTILE_SECRET_KEY: '' });
  assert.equal((await handleLogin(loginReq({ code: CODE, turnstileToken: 't' }), noTurnstile, turnstileMock().fetchImpl)).status, 500);
});

// ---------- Local dev mode (configuration only) ----------

const LOCAL = 'http://localhost:5173';
const localEnv = async (extra = {}) =>
  makeEnv({ LOCAL_DEV: '1', TURNSTILE_SECRET_KEY: '', ALLOWED_ORIGINS: `${LOCAL},http://127.0.0.1:8799`, ...extra });

test('isLocalDev needs LOCAL_DEV=1 and only http localhost origins', async () => {
  assert.ok(isLocalDev(await localEnv()));
  assert.ok(!isLocalDev(await makeEnv({ LOCAL_DEV: '1' })), 'default https origins');
  assert.ok(!isLocalDev(await localEnv({ ALLOWED_ORIGINS: `${LOCAL},${ORIGIN}` })), 'any https origin');
  assert.ok(!isLocalDev(await localEnv({ ALLOWED_ORIGINS: 'http://evil.example' })), 'non-local http origin');
  assert.ok(!isLocalDev(await localEnv({ LOCAL_DEV: 'true' })), 'only the exact value 1');
  assert.ok(!isLocalDev(await localEnv({ LOCAL_DEV: undefined })));
});

test('local dev: no Turnstile, and a dev cookie without Secure that still opens the gate', async () => {
  const env = await localEnv();
  const { fetchImpl, calls } = turnstileMock();
  const res = await handleLogin(loginReq({ code: CODE }, { origin: LOCAL, url: `${LOCAL}/api/login` }), env, fetchImpl);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0, 'Turnstile not called');
  const cookie = res.headers.get('Set-Cookie');
  assert.ok(cookie.startsWith(`${DEV_COOKIE_NAME}=`));
  assert.ok(!cookie.includes('Secure'));
  for (const flag of ['HttpOnly', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(flag), flag);

  const token = cookie.split(';')[0].split('=')[1];
  const devReq = new Request(`${LOCAL}/assets/a.js`, { headers: { Cookie: `${DEV_COOKIE_NAME}=${token}` } });
  const { next } = nextOk();
  assert.equal((await gate({ request: devReq, env, next, data: {} })).status, 200);
});

test('LOCAL_DEV in production configuration changes nothing', async () => {
  // A stray LOCAL_DEV with production origins: Turnstile still required, cookie still __Host- and Secure.
  const env = await makeEnv({ LOCAL_DEV: '1' });
  const noToken = await handleLogin(loginReq({ code: CODE }), env, turnstileMock({ success: false }).fetchImpl);
  assert.equal(noToken.status, 401);
  const res = await handleLogin(loginReq({ code: CODE, turnstileToken: 'tok' }), env, turnstileMock().fetchImpl);
  const cookie = res.headers.get('Set-Cookie');
  assert.ok(cookie.startsWith(`${COOKIE_NAME}=`) && cookie.includes('Secure'));
  // Without a Turnstile secret it refuses to run at all.
  assert.equal((await handleLogin(loginReq({ code: CODE }), await makeEnv({ LOCAL_DEV: '1', TURNSTILE_SECRET_KEY: '' }), turnstileMock().fetchImpl)).status, 500);
});

test('production never accepts the dev cookie name', async () => {
  const token = await signSession({ cid: 'acme', cv: 1, exp: nowSec() + 3600 }, SECRET);
  const request = new Request(`${ORIGIN}/assets/a.js`, { headers: { Cookie: `${DEV_COOKIE_NAME}=${token}` } });
  const { next, calls } = nextOk();
  assert.equal((await gate({ request, env: await makeEnv({ LOCAL_DEV: '1' }), next })).status, 401);
  assert.equal(calls.length, 0);
});

// ---------- Logout and client ----------

test('logout clears the cookie', async () => {
  const res = await logout();
  assert.equal(res.status, 200);
  assert.ok(res.headers.get('Set-Cookie').startsWith(`${COOKIE_NAME}=;`));
  assert.ok(res.headers.get('Set-Cookie').includes('Max-Age=0'));
});

test('client endpoint returns only the signed-in client override', async () => {
  const overrides = { acme: { facts: { carrier: 'Carrier A' } }, other: { facts: { carrier: 'Carrier B' } } };
  const res = await clientResponse({ clientId: 'acme', firmName: 'Acme Wealth' }, overrides);
  const body = await res.json();
  assert.deepEqual(body, { ok: true, clientId: 'acme', firmName: 'Acme Wealth', override: { facts: { carrier: 'Carrier A' } }, preview: false });
  assert.ok(!JSON.stringify(body).includes('Carrier B'));
  const none = await (await clientResponse({ clientId: 'nobody' }, overrides)).json();
  assert.equal(none.override, null);
  const proto = await (await clientResponse({ clientId: '__proto__' }, overrides)).json();
  assert.equal(proto.override, null);
  assert.equal((await clientResponse({}, overrides)).status, 401);
});

// ---------- SQL files for wrangler d1 execute ----------

test('client SQL quotes values, validates input and matches the Functions statement', async () => {
  const { upsertClientSql } = await import('../scripts/sql.mjs');
  const client = { clientId: 'oneil-co', firmName: "O'Neil & Co'); DROP TABLE clients; --", expires: '2099-12-31', codeHash: await hashCode(CODE), actor: 'test' };
  const sql = upsertClientSql(client);
  const db = createD1();
  db.raw.exec(sql);
  const row = await db.prepare('SELECT firm_name, code_hash FROM clients WHERE client_id = ?').bind('oneil-co').first();
  assert.equal(row.firm_name, client.firmName);
  assert.equal(row.code_hash, client.codeHash);
  assert.throws(() => upsertClientSql({ ...client, clientId: "x'; --" }));
  assert.throws(() => upsertClientSql({ ...client, codeHash: 'not-a-hash' }));
  assert.throws(() => upsertClientSql({ ...client, expires: '2099-12-31; --' }));
});

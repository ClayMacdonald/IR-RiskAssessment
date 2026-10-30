// Unit tests for functions/api/completion.js. Turnstile and Resend are mocked; no network calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCompletion, onRequest, buildEmail, validate } from '../functions/api/completion.js';
import base from '../src/content/questions.json' with { type: 'json' };
import config from '../src/content/config.json' with { type: 'json' };
import { buildBank } from '../src/bank.js';
import { buildResults, correctIndex, questionsFor } from '../src/scoring.js';
import { completionPayload } from '../src/payload.js';

const ENV = {
  RESEND_API_KEY: 're_test_secret_value',
  RESEND_FROM_EMAIL: 'IRP Readiness <notify@notify.example.com>',
  COMPLETION_NOTIFY_EMAIL: 'team@example.com, ceo@example.com',
  TURNSTILE_SECRET_KEY: 'ts_test_secret_value',
};
const ORIGIN = 'https://irp.advisordefense.com';
const SESSION = { clientId: 'acme-wealth', firmName: 'Acme Wealth Partners' };
const IDS = new Set(base.questions.map((q) => q.id));

// A real payload, built the same way the browser builds it.
function payload(role = 'CSIRT Lead') {
  const bank = buildBank(base, null, config.irpVersion);
  const qs = questionsFor(bank, role);
  const answers = Object.fromEntries(qs.map((q) => [q.id, q.type === 'knowledge' ? correctIndex(q) : 0]));
  answers.notice_deadline = (correctIndex(qs.find((q) => q.id === 'notice_deadline') || qs[0]) + 1) % 4;
  const results = buildResults({ bank, role, answers }, config.knowledgeBands);
  return { ...completionPayload({ name: 'Jordan Example', email: 'jordan@acmewealth.com', role }, results), turnstileToken: 'tok' };
}

function req(body, { origin = ORIGIN, type = 'application/json', raw } = {}) {
  const headers = { 'CF-Connecting-IP': '203.0.113.7' };
  if (origin) headers.Origin = origin;
  if (type) headers['Content-Type'] = type;
  return new Request(`${ORIGIN}/api/completion`, { method: 'POST', headers, body: raw ?? JSON.stringify(body) });
}

function upstream({ turnstile = { success: true, action: 'completion', hostname: 'irp.advisordefense.com' }, resend = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('turnstile')) {
      if (turnstile === 'throw') throw new Error('network');
      return new Response(JSON.stringify(turnstile), { status: 200 });
    }
    if (url.includes('resend')) {
      if (resend === 'throw') throw new Error('network');
      return new Response('{}', { status: resend });
    }
    throw new Error(`unexpected ${url}`);
  };
  return { calls, fetchImpl };
}

async function run(request, opts = {}, { env = ENV, session = SESSION, overrides = {} } = {}) {
  const up = upstream(opts);
  const logs = [];
  const orig = console.log;
  console.log = (m) => logs.push(String(m));
  try {
    const res = await handleCompletion(request, env, session, up.fetchImpl, overrides);
    return { res, body: await res.json(), calls: up.calls, logs };
  } finally {
    console.log = orig;
  }
}

test('valid completion: verifies Turnstile, sends one email with the session client, returns 200', async () => {
  const p = payload();
  const { res, body, calls } = await run(req(p));
  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.body.get('secret'), ENV.TURNSTILE_SECRET_KEY);
  assert.equal(calls[0].init.body.get('remoteip'), '203.0.113.7');
  const sent = JSON.parse(calls[1].init.body);
  assert.deepEqual(sent.to, ['team@example.com', 'ceo@example.com']);
  assert.equal(sent.reply_to, 'jordan@acmewealth.com');
  for (const v of ['Acme Wealth Partners (acme-wealth)', 'Jordan Example', 'CSIRT Lead', '100 / 100', 'notice_deadline', 'Customer Notification']) {
    assert.ok(sent.text.includes(v), `text has ${v}`);
  }
  assert.ok(!sent.text.includes('As soon as practicable'), 'no answer text in the email');
});

test('clientId comes from the session, never the body', async () => {
  const { calls } = await run(req({ ...payload(), clientId: 'other-client', firmName: 'Spoofed Firm' }));
  const sent = JSON.parse(calls[1].init.body);
  assert.ok(sent.text.includes('acme-wealth'));
  assert.ok(!sent.text.includes('other-client'));
  assert.ok(!sent.text.includes('Spoofed Firm'));
});

test('no session: 401 before anything else', async () => {
  const { res, calls } = await run(req(payload()), {}, { session: {} });
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test('staff payload has no readiness score and is accepted', async () => {
  const p = payload('Staff (Supervised Person)');
  assert.equal(p.readinessScore, null);
  const { res } = await run(req(p));
  assert.equal(res.status, 200);
});

test('validation rejects bad fields', () => {
  const good = payload();
  assert.ok(validate(good, IDS));
  const bad = [
    { ...good, name: '' },
    { ...good, name: 'x'.repeat(101) },
    { ...good, email: 'not-an-email' },
    { ...good, email: 'a@b.com\r\nBcc: x@y.com' },
    { ...good, role: 'Intern' },
    { ...good, readinessScore: null },
    { ...good, readinessScore: 101 },
    { ...good, knowledgeScore: 55.5 },
    { ...good, sections: [] },
    { ...good, sections: [{ id: 99, readiness: null, correct: 0, total: 1 }] },
    { ...good, sections: [{ id: 1, readiness: null, correct: 3, total: 2 }] },
    { ...good, sections: [good.sections[0], good.sections[0]] },
    { ...good, missed: ['not_a_question'] },
    { ...good, missed: ['notice_deadline', 'notice_deadline'] },
    { ...good, missed: [{ id: 'x' }] },
    { ...good, turnstileToken: 7 },
    { ...payload('Staff (Supervised Person)'), readinessScore: 80 },
  ];
  bad.forEach((b, i) => assert.equal(validate(b, IDS), null, `case ${i}`));
});

test('questions added by the client override are accepted as missed IDs', async () => {
  const overrides = { 'acme-wealth': { add: [{ id: 'acme_extra' }] } };
  const { res } = await run(req({ ...payload(), missed: ['acme_extra'] }), {}, { overrides });
  assert.equal(res.status, 200);
  const other = await run(req({ ...payload(), missed: ['acme_extra'] }), {}, { session: { clientId: 'other' }, overrides });
  assert.equal(other.res.status, 400);
});

test('origin, content type, size and JSON checks', async () => {
  assert.equal((await run(req(payload(), { origin: 'https://evil.example' }))).res.status, 403);
  assert.equal((await run(req(payload(), { origin: null }))).res.status, 403);
  assert.equal((await run(req(payload(), { type: 'text/plain' }))).res.status, 415);
  assert.equal((await run(req(null, { raw: '{"name":' }))).res.status, 400);
  assert.equal((await run(req({ ...payload(), pad: 'x'.repeat(5000) }))).res.status, 413);
});

test('Turnstile failures are refused without sending email', async () => {
  for (const turnstile of [
    { success: false },
    { success: true, action: 'login', hostname: 'irp.advisordefense.com' },
    { success: true, action: 'completion', hostname: 'evil.example' },
    'throw',
  ]) {
    const { res, calls } = await run(req(payload()), { turnstile });
    assert.equal(res.status, 403);
    assert.equal(calls.length, 1, 'Resend never called');
  }
});

test('Resend failure returns 502', async () => {
  assert.equal((await run(req(payload()), { resend: 500 })).res.status, 502);
  assert.equal((await run(req(payload()), { resend: 'throw' })).res.status, 502);
});

test('missing configuration returns 500; DEV_SKIP_TURNSTILE only on localhost', async () => {
  assert.equal((await run(req(payload()), {}, { env: { ...ENV, COMPLETION_NOTIFY_EMAIL: '' } })).res.status, 500);
  const devEnv = { ...ENV, TURNSTILE_SECRET_KEY: '', DEV_SKIP_TURNSTILE: '1' };
  assert.equal((await run(req(payload()), {}, { env: devEnv })).res.status, 500);
});

test('logs carry the outcome only, never personal data or secrets', async () => {
  const { logs } = await run(req(payload()));
  const all = logs.join('\n');
  for (const s of ['Jordan', 'jordan@acmewealth.com', 'acme-wealth', 're_test_secret_value', 'ts_test_secret_value']) {
    assert.ok(!all.includes(s), `log leaked ${s}`);
  }
  assert.deepEqual(JSON.parse(logs[0]), { route: '/api/completion', status: 200, outcome: 'sent' });
});

test('email escapes HTML and strips line breaks from the subject', () => {
  const email = buildEmail({
    ...validate(payload(), IDS),
    name: '<script>alert(1)</script>',
    clientId: 'c',
    firm: 'Evil\r\nBcc: x@y.com <b>',
  });
  assert.ok(!email.html.includes('<script>'));
  assert.ok(email.html.includes('&lt;script&gt;'));
  assert.ok(!/[\r\n]/.test(email.subject));
});

test('other methods get 405', async () => {
  const res = await onRequest();
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('Allow'), 'POST');
});

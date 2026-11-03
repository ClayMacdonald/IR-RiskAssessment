// Unit tests for functions/api/completion.js. Turnstile and Resend are mocked; no network calls.
// D1 is the node:sqlite adapter in tests/d1.mjs, with the real migrations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCompletion, onRequest, buildEmail, validate, clientBank, DRY_RUN_KEY } from '../functions/api/completion.js';
import base from '../src/content/questions.json' with { type: 'json' };
import config from '../src/content/config.json' with { type: 'json' };
import { buildBank } from '../src/bank.js';
import { buildResults, correctIndex } from '../src/scoring.js';
import { completionPayload } from '../src/payload.js';
import { upsertClientStatement } from '../functions/_lib/db.js';
import { createD1 } from './d1.mjs';

const ORIGIN = 'https://irp.advisordefense.com';
const SESSION = { clientId: 'acme-wealth', firmName: 'Acme Wealth Partners' };
const BANK = buildBank(base, null, config.irpVersion);

async function makeEnv(extra = {}) {
  const DB = createD1();
  for (const clientId of ['acme-wealth', 'other']) {
    await upsertClientStatement(DB, { clientId, firmName: clientId, codeHash: clientId.padEnd(64, '0'), expires: '2099-12-31', actor: 'test' }).run();
  }
  return {
    RESEND_API_KEY: 're_test_secret_value',
    RESEND_FROM_EMAIL: 'IRP Readiness <notify@notify.example.com>',
    COMPLETION_NOTIFY_EMAIL: 'team@example.com, ceo@example.com',
    TURNSTILE_SECRET_KEY: 'ts_test_secret_value',
    DB,
    ...extra,
  };
}

// All knowledge correct and all readiness at full credit, except one missed knowledge question.
function answers(bank = BANK) {
  const a = Object.fromEntries(bank.questions.map((q) => [q.id, q.type === 'knowledge' ? correctIndex(q) : 0]));
  a.notice_deadline = (correctIndex(bank.questions.find((q) => q.id === 'notice_deadline')) + 1) % 4;
  return a;
}

// A real payload, built the same way the browser builds it.
function payload(role = 'CSIRT Lead', bank = BANK) {
  return { ...completionPayload({ name: 'Jordan Example', email: 'jordan@acmewealth.com', role }, bank, answers(bank)), turnstileToken: 'tok' };
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

async function run(request, opts = {}, { env, session = SESSION, overrides = {} } = {}) {
  env = env || (await makeEnv());
  const up = upstream(opts);
  const logs = [];
  const orig = console.log;
  console.log = (m) => logs.push(String(m));
  try {
    const res = await handleCompletion(request, env, session, up.fetchImpl, overrides);
    return { res, body: await res.json(), calls: up.calls, logs, env };
  } finally {
    console.log = orig;
  }
}

const rows = async (env) => (await env.DB.prepare('SELECT * FROM submissions').all()).results;

test('valid completion: verifies Turnstile, stores the record, sends one short email with a dashboard link', async () => {
  const { res, body, calls, env } = await run(req(payload()));
  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.body.get('secret'), 'ts_test_secret_value');
  assert.equal(calls[0].init.body.get('remoteip'), '203.0.113.7');

  const [row] = await rows(env);
  assert.equal(row.client_id, 'acme-wealth');
  assert.equal(row.name, 'Jordan Example');
  assert.equal(row.email, 'jordan@acmewealth.com');
  assert.equal(row.role, 'CSIRT Lead');
  assert.equal(row.irp_version, config.irpVersion);
  assert.deepEqual(JSON.parse(row.answers_json), answers());
  assert.deepEqual(JSON.parse(row.missed_json), ['notice_deadline']);
  assert.deepEqual(JSON.parse(row.bank_json), BANK);

  const sent = JSON.parse(calls[1].init.body);
  assert.deepEqual(sent.to, ['team@example.com', 'ceo@example.com']);
  assert.equal(sent.reply_to, undefined);
  for (const v of ['Acme Wealth Partners (acme-wealth)', 'CSIRT Lead', '100 / 100', `${ORIGIN}/admin/#/submissions/${row.id}`]) {
    assert.ok(sent.text.includes(v), `text has ${v}`);
  }
  for (const v of ['Jordan', 'jordan@acmewealth.com', 'notice_deadline', 'As soon as practicable']) {
    assert.ok(!sent.text.includes(v) && !sent.html.includes(v), `email leaves out ${v}`);
  }
});

test('scores are computed on the server; scores sent by the browser are ignored', async () => {
  const { env } = await run(req({ ...payload(), readinessScore: 0, knowledgeScore: 0, sections: [], missed: [] }));
  const [row] = await rows(env);
  const expected = buildResults({ bank: BANK, answers: answers() }, config.knowledgeBands);
  assert.equal(row.readiness_score, expected.readiness.score);
  assert.equal(row.knowledge_score, expected.knowledge.score);
  assert.equal(row.readiness_score, 100);
  assert.equal(row.knowledge_score, Math.round((11 / 12) * 100));
  const sections = JSON.parse(row.sections_json);
  assert.equal(sections.length, expected.crosswalk.length);
  assert.deepEqual(sections.find((s) => s.id === 6), { id: 6, readiness: 100, correct: 1, total: 2 });
});

test('clientId comes from the session, never the body', async () => {
  const { calls, env } = await run(req({ ...payload(), clientId: 'other', firmName: 'Spoofed Firm' }));
  const sent = JSON.parse(calls[1].init.body);
  assert.ok(sent.text.includes('acme-wealth'));
  assert.ok(!sent.text.includes('Spoofed Firm'));
  assert.deepEqual((await rows(env)).map((r) => r.client_id), ['acme-wealth']);
});

test('no session: 401 before anything else', async () => {
  const { res, calls, env } = await run(req(payload()), {}, { session: {} });
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
  assert.equal((await rows(env)).length, 0);
});

test('every CSIRT role is accepted; a staff role is not', async () => {
  for (const role of ['Chief Compliance Officer', 'Owner or Principal', 'Secondary Lead', 'Operations']) {
    assert.equal((await run(req(payload(role)))).res.status, 200, role);
  }
  assert.equal(validate(payload('Staff (Supervised Person)'), BANK), null);
});

test('validation rejects bad fields and answers that do not match the bank', () => {
  const good = payload();
  assert.ok(validate(good, BANK));
  const first = BANK.questions[0].id;
  const { [first]: _dropped, ...missingOne } = good.answers;
  const bad = [
    { ...good, name: '' },
    { ...good, name: 'x'.repeat(101) },
    { ...good, email: 'not-an-email' },
    { ...good, email: 'a@b.com\r\nBcc: x@y.com' },
    { ...good, role: 'Intern' },
    { ...good, answers: undefined },
    { ...good, answers: [] },
    { ...good, answers: missingOne },
    { ...good, answers: { ...missingOne, not_a_question: 0 } },
    { ...good, answers: { ...good.answers, extra_question: 0 } },
    { ...good, answers: { ...good.answers, [first]: 4 } },
    { ...good, answers: { ...good.answers, [first]: -1 } },
    { ...good, answers: { ...good.answers, [first]: '1' } },
    { ...good, answers: { ...good.answers, [first]: 1.5 } },
    { ...good, answers: { ...good.answers, [first]: null } },
    { ...good, turnstileToken: 7 },
  ];
  bad.forEach((b, i) => assert.equal(validate(b, BANK), null, `case ${i}`));
});

test("the client's override decides which questions must be answered, and is stored with the record", async () => {
  const extra = { ...BANK.questions.find((q) => q.id === 'notice_deadline'), id: 'acme_extra', title: 'Acme extra' };
  const overrides = { 'acme-wealth': { hide: ['roles_tabletop'], add: [extra], irpVersion: 'Acme IRP 2.1' } };
  const bank = clientBank('acme-wealth', overrides);
  assert.ok(bank.questions.some((q) => q.id === 'acme_extra'));
  assert.ok(!bank.questions.some((q) => q.id === 'roles_tabletop'));

  const { res, env } = await run(req(payload('CSIRT Lead', bank)), {}, { overrides });
  assert.equal(res.status, 200);
  const [row] = await rows(env);
  assert.equal(row.irp_version, 'Acme IRP 2.1');
  assert.deepEqual(JSON.parse(row.bank_json), bank);

  // The default bank's answers do not fit this client, and this client's do not fit another.
  assert.equal((await run(req(payload()), {}, { overrides })).res.status, 400);
  assert.equal((await run(req(payload('CSIRT Lead', bank)), {}, { session: { clientId: 'other' }, overrides })).res.status, 400);
});

test('origin, content type, size and JSON checks', async () => {
  assert.equal((await run(req(payload(), { origin: 'https://evil.example' }))).res.status, 403);
  assert.equal((await run(req(payload(), { origin: null }))).res.status, 403);
  assert.equal((await run(req(payload(), { type: 'text/plain' }))).res.status, 415);
  assert.equal((await run(req(null, { raw: '{"name":' }))).res.status, 400);
  assert.equal((await run(req({ ...payload(), pad: 'x'.repeat(5000) }))).res.status, 413);
});

test('Turnstile failures are refused without storing or sending', async () => {
  for (const turnstile of [
    { success: false },
    { success: true, action: 'login', hostname: 'irp.advisordefense.com' },
    { success: true, action: 'completion', hostname: 'evil.example' },
    'throw',
  ]) {
    const { res, calls, env } = await run(req(payload()), { turnstile });
    assert.equal(res.status, 403);
    assert.equal(calls.length, 1, 'Resend never called');
    assert.equal((await rows(env)).length, 0, 'nothing stored');
  }
});

test('a failed email still keeps the record and returns 200', async () => {
  for (const resend of [500, 'throw']) {
    const { res, env, logs } = await run(req(payload()), { resend });
    assert.equal(res.status, 200);
    assert.equal((await rows(env)).length, 1);
    assert.equal(JSON.parse(logs[0]).outcome, 'stored_send_failed');
  }
});

test('a storage failure returns 500 and sends no email', async () => {
  const env = await makeEnv();
  env.DB.raw.exec('DROP TABLE submissions');
  const { res, calls } = await run(req(payload()), {}, { env });
  assert.equal(res.status, 500);
  assert.equal(calls.filter((c) => c.url.includes('resend')).length, 0);
});

test('missing configuration returns 500; LOCAL_DEV with production origins does not skip Turnstile', async () => {
  assert.equal((await run(req(payload()), {}, { env: await makeEnv({ COMPLETION_NOTIFY_EMAIL: '' }) })).res.status, 500);
  assert.equal((await run(req(payload()), {}, { env: await makeEnv({ DB: undefined }) })).res.status, 500);
  const strayDev = await makeEnv({ TURNSTILE_SECRET_KEY: '', LOCAL_DEV: '1' });
  assert.equal((await run(req(payload()), {}, { env: strayDev })).res.status, 500);
});

test('local dev: Turnstile skipped, the record is stored and the dummy Resend key sends nothing', async () => {
  const LOCAL = 'http://localhost:5173';
  const env = await makeEnv({ LOCAL_DEV: '1', TURNSTILE_SECRET_KEY: '', RESEND_API_KEY: DRY_RUN_KEY, ALLOWED_ORIGINS: LOCAL });
  const { res, calls, logs } = await run(req(payload(), { origin: LOCAL }), {}, { env });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0, 'no Turnstile or Resend call');
  assert.deepEqual(JSON.parse(logs[0]), { route: '/api/completion', status: 200, outcome: 'stored_dry_run' });
  assert.ok(!logs.join('\n').includes('Jordan'));
  assert.equal((await rows(env)).length, 1);
  // The dry run still requires a session and valid fields.
  assert.equal((await run(req(payload(), { origin: LOCAL }), {}, { env, session: {} })).res.status, 401);
  assert.equal((await run(req({ ...payload(), role: 'Intern' }, { origin: LOCAL }), {}, { env })).res.status, 400);
});

test('the dummy key is a dry run even in production configuration, so it can never reach Resend', async () => {
  const { res, calls } = await run(req(payload()), {}, { env: await makeEnv({ RESEND_API_KEY: DRY_RUN_KEY }) });
  assert.equal(res.status, 200);
  assert.equal(calls.filter((c) => c.url.includes('resend')).length, 0);
});

test('logs carry the outcome only, never personal data or secrets', async () => {
  const { logs } = await run(req(payload()));
  const all = logs.join('\n');
  for (const s of ['Jordan', 'jordan@acmewealth.com', 'acme-wealth', 're_test_secret_value', 'ts_test_secret_value']) {
    assert.ok(!all.includes(s), `log leaked ${s}`);
  }
  assert.deepEqual(JSON.parse(logs[0]), { route: '/api/completion', status: 200, outcome: 'stored_sent' });
});

test('email escapes HTML and strips line breaks from the subject', () => {
  const results = buildResults({ bank: BANK, answers: answers() }, config.knowledgeBands);
  const email = buildEmail({ firm: 'Evil\r\nBcc: x@y.com <script>alert(1)</script>', clientId: 'c', role: 'CSIRT Lead', results, link: 'https://x/admin/#/submissions/"><b>' });
  assert.ok(!email.html.includes('<script>'));
  assert.ok(email.html.includes('&lt;script&gt;'));
  assert.ok(!email.html.includes('"><b>'));
  assert.ok(!/[\r\n]/.test(email.subject));
});

test('other methods get 405', async () => {
  const res = await onRequest();
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('Allow'), 'POST');
});

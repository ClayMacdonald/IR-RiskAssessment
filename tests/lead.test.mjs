// Unit tests for functions/api/lead.js. Run with: npm run test:unit
// Turnstile and Resend are mocked; no network calls are made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleLead, onRequest, buildEmail, validate } from '../functions/api/lead.js';

const ENV = {
  RESEND_API_KEY: 're_test_secret_value',
  RESEND_FROM_EMAIL: 'Reg S-P Readiness Score <leads@notify.example.com>',
  LEAD_NOTIFY_EMAIL: 'sales@example.com',
  TURNSTILE_SECRET_KEY: 'ts_test_secret_value',
};
const ORIGIN = 'https://regsp.advisordefense.com';
const GOOD = {
  name: 'Jordan Example',
  email: 'jordan@examplewealth.com',
  role: 'CCO',
  firmName: 'Example Wealth Partners',
  score: 56,
  turnstileToken: 'token-abc',
};

function req(body, { origin = ORIGIN, type = 'application/json', raw } = {}) {
  const headers = { 'CF-Connecting-IP': '203.0.113.7' };
  if (origin) headers.Origin = origin;
  if (type) headers['Content-Type'] = type;
  return new Request('https://regsp.advisordefense.com/api/lead', {
    method: 'POST',
    headers,
    body: raw ?? JSON.stringify(body),
  });
}

// Records calls. turnstile: object returned by siteverify, or 'throw'. resend: HTTP status, or 'throw'.
function upstream({ turnstile = { success: true, action: 'lead', hostname: 'regsp.advisordefense.com' }, resend = 200 } = {}) {
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

async function run(request, opts, env = ENV) {
  const up = upstream(opts);
  const logs = [];
  const orig = console.log;
  console.log = (m) => logs.push(String(m));
  try {
    const res = await handleLead(request, env, up.fetchImpl);
    return { res, body: await res.json(), calls: up.calls, logs };
  } finally {
    console.log = orig;
  }
}

test('valid lead: verifies Turnstile, sends one email, returns 200', async () => {
  const { res, body, calls } = await run(req(GOOD));
  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(calls.length, 2);
  const ts = calls[0].init.body;
  assert.equal(ts.get('secret'), ENV.TURNSTILE_SECRET_KEY);
  assert.equal(ts.get('response'), 'token-abc');
  assert.equal(ts.get('remoteip'), '203.0.113.7');
  const sent = JSON.parse(calls[1].init.body);
  assert.equal(calls[1].init.headers.Authorization, `Bearer ${ENV.RESEND_API_KEY}`);
  assert.deepEqual(sent.to, ['sales@example.com']);
  assert.equal(sent.from, ENV.RESEND_FROM_EMAIL);
  assert.equal(sent.reply_to, 'jordan@examplewealth.com');
  assert.match(sent.subject, /Example Wealth Partners \(56\)/);
  for (const v of ['Jordan Example', 'jordan@examplewealth.com', 'CCO', 'Example Wealth Partners', '56 / 100']) {
    assert.ok(sent.text.includes(v), `text has ${v}`);
    assert.ok(sent.html.includes(v), `html has ${v}`);
  }
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('recipient comes from config, never from the request', async () => {
  const { calls } = await run(req({ ...GOOD, to: 'attacker@evil.example', LEAD_NOTIFY_EMAIL: 'x@evil.example' }));
  assert.deepEqual(JSON.parse(calls[1].init.body).to, ['sales@example.com']);
});

test('other methods get 405', async () => {
  const res = await onRequest();
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('Allow'), 'POST');
});

test('missing or foreign Origin is rejected before any upstream call', async () => {
  for (const origin of [null, 'https://evil.example', 'https://regsp.advisordefense.com.evil.example', 'http://regsp.advisordefense.com']) {
    const { res, calls } = await run(req(GOOD, { origin }));
    assert.equal(res.status, 403, String(origin));
    assert.equal(calls.length, 0);
  }
});

test('pages.dev origin is allowed by default', async () => {
  const { res } = await run(req(GOOD, { origin: 'https://regs-p.pages.dev' }), {
    turnstile: { success: true, action: 'lead', hostname: 'regs-p.pages.dev' },
  });
  assert.equal(res.status, 200);
});

test('non-JSON content type gets 415', async () => {
  const { res, calls } = await run(req(GOOD, { type: 'text/plain' }));
  assert.equal(res.status, 415);
  assert.equal(calls.length, 0);
});

test('body over 4 KB gets 413', async () => {
  const { res, calls } = await run(req({ ...GOOD, name: 'a'.repeat(5000) }));
  assert.equal(res.status, 413);
  assert.equal(calls.length, 0);
});

test('malformed JSON gets 400', async () => {
  const { res } = await run(req(null, { raw: '{not json' }));
  assert.equal(res.status, 400);
});

test('field validation rejects bad input before Turnstile', async () => {
  const bad = [
    { email: 'not-an-email' },
    { email: 'a@b' },
    { email: 'x@y.com\r\nBcc: victim@example.com' },
    { role: 'Admin' },
    { role: ['CCO'] },
    { score: 101 },
    { score: -1 },
    { score: 55.5 },
    { score: '56' },
    { name: '' },
    { name: '   ' },
    { name: 'a'.repeat(101) },
    { firmName: 'f'.repeat(151) },
    { firmName: 42 },
    { turnstileToken: '' },
    { turnstileToken: undefined },
  ];
  for (const patch of bad) {
    const { res, calls } = await run(req({ ...GOOD, ...patch }));
    assert.equal(res.status, 400, JSON.stringify(patch));
    assert.equal(calls.length, 0, JSON.stringify(patch));
  }
  assert.equal(validate([]), null);
  assert.equal(validate(null), null);
});

test('Turnstile failures block the email', async () => {
  const cases = [
    { success: false, action: 'lead', hostname: 'regsp.advisordefense.com', 'error-codes': ['timeout-or-duplicate'] },
    { success: true, action: 'login', hostname: 'regsp.advisordefense.com' },
    { success: true, action: 'lead', hostname: 'evil.example' },
    { success: 'true', action: 'lead', hostname: 'regsp.advisordefense.com' },
    'throw',
  ];
  for (const turnstile of cases) {
    const { res, calls } = await run(req(GOOD), { turnstile });
    assert.equal(res.status, 403, JSON.stringify(turnstile));
    assert.equal(calls.filter((c) => c.url.includes('resend')).length, 0);
  }
});

test('Resend error or network failure returns 502', async () => {
  for (const resend of [500, 401, 'throw']) {
    const { res, body } = await run(req(GOOD), { resend });
    assert.equal(res.status, 502);
    assert.deepEqual(body, { ok: false });
  }
});

test('missing configuration returns 500 and calls nothing', async () => {
  for (const key of Object.keys(ENV)) {
    const env = { ...ENV, [key]: '' };
    const { res, calls } = await run(req(GOOD), {}, env);
    assert.equal(res.status, 500, key);
    assert.equal(calls.length, 0);
  }
});

test('HTML and header injection are neutralized', async () => {
  const { calls } = await run(
    req({
      ...GOOD,
      name: '<img src=x onerror=alert(1)>',
      firmName: 'Evil & Co\r\nBcc: victim@example.com <script>',
    })
  );
  const sent = JSON.parse(calls[1].init.body);
  assert.ok(!sent.html.includes('<img'), 'no raw img tag');
  assert.ok(!sent.html.includes('<script'), 'no raw script tag');
  assert.ok(sent.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(sent.html.includes('Evil &amp; Co'));
  assert.ok(!/[\r\n]/.test(sent.subject), 'no line breaks in subject');
});

test('logs and responses never contain personal data or secrets', async () => {
  const outcomes = [{}, { resend: 500 }, { turnstile: 'throw' }];
  for (const o of outcomes) {
    const { body, logs } = await run(req(GOOD), o);
    const out = JSON.stringify(body) + logs.join('\n');
    for (const secret of [ENV.RESEND_API_KEY, ENV.TURNSTILE_SECRET_KEY, GOOD.email, GOOD.name, GOOD.firmName]) {
      assert.ok(!out.includes(secret), `leaked ${secret}`);
    }
  }
});

test('buildEmail escapes every row and stays plain', () => {
  const e = buildEmail(
    { name: 'A "B"', email: 'a@b.co', role: 'CCO', firm: "O'Neil", score: 7 },
    new Date('2026-10-29T15:00:00Z')
  );
  assert.ok(e.html.includes('A &quot;B&quot;'));
  assert.ok(e.html.includes('O&#39;Neil'));
  assert.ok(e.text.includes('Submitted: 2026-10-29 15:00 UTC'));
});

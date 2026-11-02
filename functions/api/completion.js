// POST /api/completion: saves a completed assessment and emails AdvisorDefense a link to it.
//
// Security model (see README, "Completed assessments"):
// - Requires a signed-in session. The middleware sets data.clientId and data.firmName from the
//   session cookie. A clientId in the body is ignored.
// - Only POST, only from the site's own origins, JSON only, body capped at 4 KB.
// - The browser sends only name, work email, role and answers (question ID to option index).
//   The server rebuilds this client's bank and computes every score itself, so a browser cannot
//   change a stored score. Every answer must match a question in that bank.
// - A Cloudflare Turnstile token is required and verified with the action and hostname we expect.
// - The record is stored in D1 before the email is sent. The email holds the firm, role, scores and
//   a dashboard link only: no name, email address or answers. The recipient comes from config.
// - Secrets live only in Cloudflare (RESEND_API_KEY, TURNSTILE_SECRET_KEY) and are never logged or returned.
// - Logs record the outcome only, never personal data.
import base from '../../src/content/questions.json' with { type: 'json' };
import appConfig from '../../src/content/config.json' with { type: 'json' };
import clients from '../_lib/clients.generated.js';
import { buildBank } from '../../src/bank.js';
import { buildResults } from '../../src/scoring.js';
import { ROLE_LABELS } from '../../src/roles.js';
import { allowedOrigins, clean, escapeHtml, hostnames, isLocalDev, readJson, reply } from '../_lib/http.js';
import { verifyTurnstile } from '../_lib/turnstile.js';
import { insertSubmissionStatement, submissionRecord } from '../_lib/submissions.js';

const ROUTE = '/api/completion';
const RESEND_URL = 'https://api.resend.com/emails';
// The local placeholder key in .dev.vars.example. With it, nothing is sent to Resend.
export const DRY_RUN_KEY = 're_local_dev_dummy';
const UPSTREAM_TIMEOUT_MS = 8000;
const EMAIL_RE = /^[^\s@<>"',;:()[\]\\]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

export async function onRequestPost({ request, env, data }) {
  return handleCompletion(request, env, data);
}

// Any other method on this path.
export async function onRequest() {
  return reply(ROUTE, 405, 'method_not_allowed', { headers: { Allow: 'POST' } });
}

// The bank exactly as this client saw it: defaults, their override and filled placeholders.
export function clientBank(clientId, overrides = clients) {
  const override = Object.hasOwn(overrides, clientId) ? overrides[clientId] : null;
  return buildBank(base, override, appConfig.irpVersion);
}

export async function handleCompletion(request, env, data = {}, fetchImpl = fetch, overrides = clients, now = new Date()) {
  if (!data.clientId) return reply(ROUTE, 401, 'no_session');

  const config = readConfig(env);
  if (!config) return reply(ROUTE, 500, 'not_configured');

  const { body, error } = await readJson(ROUTE, request, config.origins);
  if (error) return error;

  const bank = clientBank(data.clientId, overrides);
  const completion = validate(body, bank);
  if (!completion) return reply(ROUTE, 400, 'invalid');

  if (!config.skipTurnstile) {
    const human = await verifyTurnstile(
      {
        token: body.turnstileToken,
        ip: request.headers.get('CF-Connecting-IP') || '',
        secret: config.turnstileSecret,
        action: 'completion',
        hostnames: hostnames(config.origins),
      },
      fetchImpl
    );
    if (!human) return reply(ROUTE, 403, 'turnstile_failed');
  }

  const results = buildResults({ bank, answers: completion.answers }, appConfig.knowledgeBands);
  const record = submissionRecord({ ...completion, clientId: data.clientId, bank, results, now });
  try {
    await insertSubmissionStatement(env.DB, record).run();
  } catch {
    return reply(ROUTE, 500, 'store_failed');
  }

  // Local dev: the record is saved. Log the outcome only and send nothing.
  if (config.apiKey === DRY_RUN_KEY) return reply(ROUTE, 200, 'stored_dry_run', { body: { ok: true } });

  const notice = { firm: data.firmName || data.clientId, clientId: data.clientId, role: completion.role, results, link: `${config.adminUrl}#/submissions/${record.id}` };
  const sent = await sendEmail(notice, config, fetchImpl, now);
  // The record is what matters. A failed notice is logged; the dashboard still shows the record.
  return reply(ROUTE, 200, sent ? 'stored_sent' : 'stored_send_failed', { body: { ok: true } });
}

function readConfig(env = {}) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL;
  const to = env.COMPLETION_NOTIFY_EMAIL;
  const turnstileSecret = env.TURNSTILE_SECRET_KEY;
  const skipTurnstile = isLocalDev(env);
  if (!env.DB || !apiKey || !from || !to || (!turnstileSecret && !skipTurnstile)) return null;
  const origins = allowedOrigins(env);
  return {
    apiKey,
    from,
    to: to.split(',').map((t) => t.trim()).filter(Boolean),
    turnstileSecret,
    skipTurnstile,
    origins,
    // The first allowed origin is the site's main address (irp.advisordefense.com in production).
    adminUrl: `${origins[0]}/admin/`,
  };
}

// Returns { name, email, role, answers } or null. Every question in the bank must be answered
// with a valid option index, and nothing else may be sent.
export function validate(body, bank) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const name = clean(body.name, 100);
  const email = clean(body.email, 254);
  const role = typeof body.role === 'string' && ROLE_LABELS.includes(body.role) ? body.role : null;
  if (!name || !email || !role || !EMAIL_RE.test(email)) return null;

  const given = body.answers;
  if (!given || typeof given !== 'object' || Array.isArray(given)) return null;
  const keys = Object.keys(given);
  if (keys.length !== bank.questions.length) return null;
  const answers = {};
  for (const q of bank.questions) {
    const a = Object.hasOwn(given, q.id) ? given[q.id] : undefined;
    if (!Number.isInteger(a) || a < 0 || a >= q.options.length) return null;
    answers[q.id] = a;
  }

  if (typeof body.turnstileToken !== 'string' || body.turnstileToken.length > 2048) return null;
  return { name, email, role, answers };
}

export function buildEmail(c, now = new Date()) {
  const when = now.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const { readiness, knowledge } = c.results;
  const rows = [
    ['Client', `${c.firm} (${c.clientId})`],
    ['Role', c.role],
    ['Program Readiness', readiness ? `${readiness.score} / 100` : 'Not asked'],
    ['IRP Knowledge', knowledge ? `${knowledge.score} / 100` : 'Not asked'],
    ['Completed', when],
  ];
  const subject = `IRP assessment completed: ${c.firm}, ${c.role}`.replace(/[\r\n\u0000-\u001F]+/g, ' ').slice(0, 200);
  const intro = `Someone at ${c.firm} finished the IRP and Reg S-P readiness assessment.`;
  const note = 'Name, answers and the full report are in the dashboard (AdvisorDefense sign-in required).';
  const text = [intro, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', `Open the record: ${c.link}`, '', note].join('\n');
  const html = `<p>${escapeHtml(intro)}</p>
<table cellpadding="6" cellspacing="0" border="0">
${rows.map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`).join('\n')}
</table>
<p><a href="${escapeHtml(c.link)}">Open the record in the dashboard</a></p>
<p>${escapeHtml(note)}</p>`;
  return { subject, text, html };
}

async function sendEmail(c, config, fetchImpl, now) {
  const { subject, text, html } = buildEmail(c, now);
  try {
    const res = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.from, to: config.to, subject, text, html }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

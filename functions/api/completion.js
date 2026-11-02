// POST /api/completion: emails AdvisorDefense when someone downloads their report.
//
// Security model (see README, "Completion notifications"):
// - Requires a signed-in session. The middleware sets data.clientId and data.firmName from the
//   session cookie. A clientId in the body is ignored.
// - Only POST, only from the site's own origins, JSON only, body capped at 4 KB.
// - Every field is validated server side, including question IDs against the bank.
//   The recipient comes from config, never from the request.
// - A Cloudflare Turnstile token is required and verified with the action and hostname we expect.
// - Every field is HTML-escaped in the email and line breaks are removed from the subject.
// - Secrets live only in Cloudflare (RESEND_API_KEY, TURNSTILE_SECRET_KEY) and are never logged or returned.
// - Logs record the outcome only, never personal data.
import bank from '../../src/content/questions.json' with { type: 'json' };
import clients from '../_lib/clients.generated.js';
import { ROLE_LABELS } from '../../src/roles.js';
import { allowedOrigins, clean, escapeHtml, hostnames, isLocalDev, readJson, reply } from '../_lib/http.js';
import { verifyTurnstile } from '../_lib/turnstile.js';

const ROUTE = '/api/completion';
const RESEND_URL = 'https://api.resend.com/emails';
// The local placeholder key in .dev.vars.example. With it, nothing is sent to Resend.
export const DRY_RUN_KEY = 're_local_dev_dummy';
const UPSTREAM_TIMEOUT_MS = 8000;
const EMAIL_RE = /^[^\s@<>"',;:()[\]\\]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
const SECTION_NAMES = Object.fromEntries(bank.sections.map((s) => [s.id, s.name]));

export async function onRequestPost({ request, env, data }) {
  return handleCompletion(request, env, data);
}

// Any other method on this path.
export async function onRequest() {
  return reply(ROUTE, 405, 'method_not_allowed', { headers: { Allow: 'POST' } });
}

export async function handleCompletion(request, env, data = {}, fetchImpl = fetch, overrides = clients) {
  if (!data.clientId) return reply(ROUTE, 401, 'no_session');

  const config = readConfig(env);
  if (!config) return reply(ROUTE, 500, 'not_configured');

  const { body, error } = await readJson(ROUTE, request, config.origins);
  if (error) return error;

  const completion = validate(body, knownIds(data.clientId, overrides));
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

  // Local dev: everything above still ran (session, validation). Log the outcome only and stop.
  if (config.apiKey === DRY_RUN_KEY) return reply(ROUTE, 200, 'dry_run_would_send', { body: { ok: true } });

  const sent = await sendEmail({ ...completion, clientId: data.clientId, firm: data.firmName || data.clientId }, config, fetchImpl);
  if (!sent) return reply(ROUTE, 502, 'send_failed');

  return reply(ROUTE, 200, 'sent', { body: { ok: true } });
}

function readConfig(env = {}) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL;
  const to = env.COMPLETION_NOTIFY_EMAIL;
  const turnstileSecret = env.TURNSTILE_SECRET_KEY;
  const skipTurnstile = isLocalDev(env);
  if (!apiKey || !from || !to || (!turnstileSecret && !skipTurnstile)) return null;
  return {
    apiKey,
    from,
    to: to.split(',').map((t) => t.trim()).filter(Boolean),
    turnstileSecret,
    skipTurnstile,
    origins: allowedOrigins(env),
  };
}

// Question IDs this client can see: the default bank plus any added by its override.
function knownIds(clientId, overrides) {
  const ids = new Set(bank.questions.map((q) => q.id));
  const o = Object.hasOwn(overrides, clientId) ? overrides[clientId] : null;
  for (const q of (o && Array.isArray(o.add) && o.add) || []) if (q && typeof q.id === 'string') ids.add(q.id);
  return ids;
}

const isScore = (v) => Number.isInteger(v) && v >= 0 && v <= 100;

export function validate(body, ids) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const name = clean(body.name, 100);
  const email = clean(body.email, 254);
  const role = typeof body.role === 'string' && ROLE_LABELS.includes(body.role) ? body.role : null;
  if (!name || !email || !role || !EMAIL_RE.test(email)) return null;

  // Null only if the client's override hides every readiness question.
  const readinessScore = body.readinessScore;
  if (!(readinessScore === null || isScore(readinessScore))) return null;
  if (!isScore(body.knowledgeScore)) return null;

  if (!Array.isArray(body.sections) || body.sections.length < 1 || body.sections.length > bank.sections.length) return null;
  const seen = new Set();
  const sections = [];
  for (const s of body.sections) {
    if (!s || typeof s !== 'object' || !SECTION_NAMES[s.id] || seen.has(s.id)) return null;
    seen.add(s.id);
    if (!(s.readiness === null || isScore(s.readiness))) return null;
    if (!Number.isInteger(s.total) || s.total < 0 || s.total > 50) return null;
    if (!Number.isInteger(s.correct) || s.correct < 0 || s.correct > s.total) return null;
    sections.push({ id: s.id, readiness: s.readiness, correct: s.correct, total: s.total });
  }

  if (!Array.isArray(body.missed) || body.missed.length > ids.size) return null;
  if (!body.missed.every((id) => typeof id === 'string' && ids.has(id))) return null;
  if (new Set(body.missed).size !== body.missed.length) return null;

  if (typeof body.turnstileToken !== 'string' || body.turnstileToken.length > 2048) return null;
  return { name, email, role, readinessScore, knowledgeScore: body.knowledgeScore, sections, missed: body.missed };
}

export function buildEmail(c, now = new Date()) {
  const when = now.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const rows = [
    ['Client', `${c.firm} (${c.clientId})`],
    ['Name', c.name],
    ['Work email', c.email],
    ['Role', c.role],
    ['Program Readiness', c.readinessScore === null ? 'Not asked' : `${c.readinessScore} / 100`],
    ['IRP Knowledge', `${c.knowledgeScore} / 100`],
    ['Completed', when],
  ];
  const sectionRows = c.sections.map((s) => [
    SECTION_NAMES[s.id],
    [`Knowledge ${s.correct} of ${s.total}`, s.readiness === null ? null : `Readiness ${s.readiness}%`].filter(Boolean).join(', '),
  ]);
  const missed = c.missed.length ? c.missed.join(', ') : 'None';
  const subject = `IRP assessment completed: ${c.firm}, ${c.role} (Knowledge ${c.knowledgeScore})`
    .replace(/[\r\n\u0000-\u001F]+/g, ' ')
    .slice(0, 200);
  const note = 'Scores are reported by the person\'s browser. Answers are not sent.';
  const text = [
    'Someone downloaded their IRP and Reg S-P readiness report.',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'By section:',
    ...sectionRows.map(([k, v]) => `  ${k}: ${v}`),
    '',
    `Missed question IDs: ${missed}`,
    '',
    note,
  ].join('\n');
  const table = (list) =>
    `<table cellpadding="6" cellspacing="0" border="0">\n${list
      .map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`)
      .join('\n')}\n</table>`;
  const html = `<p>Someone downloaded their IRP and Reg S-P readiness report.</p>
${table(rows)}
<p><strong>By section</strong></p>
${table(sectionRows)}
<p><strong>Missed question IDs:</strong> ${escapeHtml(missed)}</p>
<p>${escapeHtml(note)}</p>`;
  return { subject, text, html };
}

async function sendEmail(c, config, fetchImpl) {
  const { subject, text, html } = buildEmail(c);
  try {
    const res = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.from, to: config.to, reply_to: c.email, subject, text, html }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

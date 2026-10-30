// POST /api/lead: emails AdvisorDefense when someone downloads their report.
//
// Security model (see README, "Lead notifications"):
// - Only POST, only from the site's own origins, JSON only, body capped at 4 KB.
// - Every field is validated server side. The recipient comes from config, never from the request.
// - A Cloudflare Turnstile token is required and verified with the action and hostname we expect.
//   Tokens are single use, so a captured request cannot be replayed.
// - Every field is HTML-escaped in the email and line breaks are removed from the subject.
// - Secrets live only in Cloudflare (RESEND_API_KEY, TURNSTILE_SECRET_KEY) and are never logged or returned.
// - Logs record the outcome only, never personal data.

const MAX_BODY_BYTES = 4096;
const DEFAULT_ORIGINS = ['https://regsp.advisordefense.com', 'https://regs-p.pages.dev'];
const ROLES = ['CCO', 'Owner or Principal', 'Operations', 'Other'];
const EMAIL_RE = /^[^\s@<>"',;:()[\]\\]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RESEND_URL = 'https://api.resend.com/emails';
const TURNSTILE_ACTION = 'lead';
const UPSTREAM_TIMEOUT_MS = 8000;

export async function onRequestPost({ request, env }) {
  return handleLead(request, env);
}

// Any other method on this path.
export async function onRequest() {
  return reply(405, 'method_not_allowed', { Allow: 'POST' });
}

export async function handleLead(request, env, fetchImpl = fetch) {
  const config = readConfig(env);
  if (!config) return reply(500, 'not_configured');

  const origin = request.headers.get('Origin');
  if (!origin || !config.origins.includes(origin)) return reply(403, 'bad_origin');

  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!type.startsWith('application/json')) return reply(415, 'bad_content_type');

  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) return reply(413, 'too_large');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return reply(413, 'too_large');

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, 'bad_json');
  }

  const lead = validate(body);
  if (!lead) return reply(400, 'invalid');

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const human = await verifyTurnstile(body.turnstileToken, ip, config, fetchImpl);
  if (!human) return reply(403, 'turnstile_failed');

  const sent = await sendEmail(lead, config, fetchImpl);
  if (!sent) return reply(502, 'send_failed');

  return reply(200, 'sent', {}, { ok: true });
}

function readConfig(env = {}) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL;
  const to = env.LEAD_NOTIFY_EMAIL;
  const turnstileSecret = env.TURNSTILE_SECRET_KEY;
  if (!apiKey || !from || !to || !turnstileSecret) return null;
  const origins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : DEFAULT_ORIGINS;
  const hostnames = origins.map((o) => {
    try {
      return new URL(o).hostname;
    } catch {
      return '';
    }
  });
  return { apiKey, from, to: to.split(',').map((t) => t.trim()).filter(Boolean), turnstileSecret, origins, hostnames };
}

// Removes control characters (including CR and LF) and collapses whitespace.
function clean(value, max) {
  if (typeof value !== 'string') return null;
  const v = value.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!v || v.length > max) return null;
  return v;
}

export function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const name = clean(body.name, 100);
  const firm = clean(body.firmName, 150);
  const email = clean(body.email, 254);
  const role = typeof body.role === 'string' && ROLES.includes(body.role) ? body.role : null;
  const score = body.score;
  if (!name || !firm || !email || !role) return null;
  if (!EMAIL_RE.test(email)) return null;
  if (!Number.isInteger(score) || score < 0 || score > 100) return null;
  if (typeof body.turnstileToken !== 'string' || !body.turnstileToken || body.turnstileToken.length > 2048) return null;
  return { name, firm, email, role, score };
}

async function verifyTurnstile(token, ip, config, fetchImpl) {
  try {
    const form = new FormData();
    form.append('secret', config.turnstileSecret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const res = await fetchImpl(TURNSTILE_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const out = await res.json();
    return (
      out.success === true && out.action === TURNSTILE_ACTION && config.hostnames.includes(out.hostname)
    );
  } catch {
    return false;
  }
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildEmail(lead, now = new Date()) {
  const when = now.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const rows = [
    ['Name', lead.name],
    ['Work email', lead.email],
    ['Role', lead.role],
    ['Firm', lead.firm],
    ['Score', `${lead.score} / 100`],
    ['Submitted', when],
  ];
  const subject = `New Reg S-P Readiness lead: ${lead.firm} (${lead.score})`.slice(0, 200);
  const text = [
    'A visitor downloaded their Reg S-P Readiness report.',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Source: regsp.advisordefense.com. The score is reported by the visitor\'s browser.',
  ].join('\n');
  const html = `<p>A visitor downloaded their Reg S-P Readiness report.</p>
<table cellpadding="6" cellspacing="0" border="0">
${rows.map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`).join('\n')}
</table>
<p>Source: regsp.advisordefense.com. The score is reported by the visitor's browser.</p>`;
  return { subject, text, html };
}

async function sendEmail(lead, config, fetchImpl) {
  const { subject, text, html } = buildEmail(lead);
  try {
    const res = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.from, to: config.to, reply_to: lead.email, subject, text, html }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function reply(status, outcome, headers = {}, body = { ok: false }) {
  // Outcome only. No personal data, no upstream error text, no secrets.
  console.log(JSON.stringify({ route: '/api/lead', status, outcome }));
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

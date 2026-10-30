// Shared request and response helpers for the Pages Functions.
// Logs record the route, status and a short outcome code only. Never personal data or secrets.

export const MAX_BODY_BYTES = 4096;
export const DEFAULT_ORIGINS = ['https://irp.advisordefense.com', 'https://irp-assessment.pages.dev'];

export function reply(route, status, outcome, { headers = {}, body = { ok: false } } = {}) {
  console.log(JSON.stringify({ route, status, outcome }));
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

export function allowedOrigins(env = {}) {
  return env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : DEFAULT_ORIGINS;
}

export function hostnames(origins) {
  return origins.map((o) => {
    try {
      return new URL(o).hostname;
    } catch {
      return '';
    }
  });
}

// True only for local development hosts. Used to skip Turnstile in local smoke tests when
// DEV_SKIP_TURNSTILE=1. A production hostname can never satisfy this.
export function isLocalRequest(request) {
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

// Checks origin, content type and size, then parses JSON.
// Returns { body } on success or { error: Response } on failure.
export async function readJson(route, request, origins) {
  const origin = request.headers.get('Origin');
  if (!origin || !origins.includes(origin)) return { error: reply(route, 403, 'bad_origin') };

  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!type.startsWith('application/json')) return { error: reply(route, 415, 'bad_content_type') };

  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) return { error: reply(route, 413, 'too_large') };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return { error: reply(route, 413, 'too_large') };

  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: reply(route, 400, 'bad_json') };
    return { body };
  } catch {
    return { error: reply(route, 400, 'bad_json') };
  }
}

// Removes control characters (including CR and LF) and collapses whitespace.
export function clean(value, max) {
  if (typeof value !== 'string') return null;
  const v = value.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!v || v.length > max) return null;
  return v;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

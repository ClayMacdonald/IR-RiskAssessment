// GET  /api/login: returns the public Turnstile site key for the login page.
// POST /api/login: exchanges an access code for a signed session cookie.
//
// Security model (see README, "Access control"):
// - Only from the site's own origins, JSON only, body capped at 4 KB.
// - Turnstile token required (action "login"). A Cloudflare rate limiting rule on this path is the second layer.
// - Codes are compared by SHA-256 hash against the ACCESS_CODES secret. Expired codes are rejected.
// - Every failure returns the same generic response, so it never hints whether a code exists.
// - The cookie carries only clientId and expiry, signed with SESSION_SECRET.
import { allowedOrigins, hostnames, isLocalRequest, readJson, reply } from '../_lib/http.js';
import { verifyTurnstile } from '../_lib/turnstile.js';
import {
  SESSION_SECONDS,
  codeExpiry,
  findCode,
  isActive,
  readAccessCodes,
  sessionCookie,
  signSession,
} from '../_lib/session.js';

const ROUTE = '/api/login';
const MAX_CODE_LENGTH = 64;

export async function onRequestGet({ env }) {
  return reply(ROUTE, 200, 'site_key', {
    body: { siteKey: env.TURNSTILE_SITE_KEY || env.VITE_TURNSTILE_SITE_KEY || '' },
  });
}

export async function onRequestPost({ request, env }) {
  return handleLogin(request, env);
}

export async function onRequest() {
  return reply(ROUTE, 405, 'method_not_allowed', { headers: { Allow: 'GET, POST' } });
}

export async function handleLogin(request, env, fetchImpl = fetch, now = Date.now()) {
  const codes = readAccessCodes(env);
  const skipTurnstile = env.DEV_SKIP_TURNSTILE === '1' && isLocalRequest(request);
  if (!codes || !env.SESSION_SECRET || (!env.TURNSTILE_SECRET_KEY && !skipTurnstile)) {
    return reply(ROUTE, 500, 'not_configured');
  }

  const origins = allowedOrigins(env);
  const { body, error } = await readJson(ROUTE, request, origins);
  if (error) return error;

  const code = typeof body.code === 'string' && body.code.length <= MAX_CODE_LENGTH ? body.code : '';
  if (!code) return rejected('invalid');

  if (!skipTurnstile) {
    const human = await verifyTurnstile(
      {
        token: body.turnstileToken,
        ip: request.headers.get('CF-Connecting-IP') || '',
        secret: env.TURNSTILE_SECRET_KEY,
        action: 'login',
        hostnames: hostnames(origins),
      },
      fetchImpl
    );
    if (!human) return rejected('turnstile_failed');
  }

  const entry = await findCode(codes, code);
  if (!isActive(entry, now)) return rejected(entry ? 'code_expired' : 'code_unknown');

  // The session ends after 8 hours or when the code expires, whichever is first.
  const nowSec = Math.floor(now / 1000);
  const exp = Math.min(nowSec + SESSION_SECONDS, codeExpiry(entry));
  const token = await signSession({ cid: entry.clientId, exp }, env.SESSION_SECRET);
  return reply(ROUTE, 200, 'signed_in', {
    headers: { 'Set-Cookie': sessionCookie(token, exp - nowSec) },
    body: { ok: true },
  });
}

// One response for every failed sign-in. The outcome code goes to the log only.
function rejected(outcome) {
  return reply(ROUTE, 401, outcome, { body: { ok: false, error: 'sign_in_failed' } });
}

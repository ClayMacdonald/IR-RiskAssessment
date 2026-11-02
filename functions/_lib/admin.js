// Admin identity from Cloudflare Access (see README, "Admin dashboard").
//
// Cloudflare Access sits in front of /admin* and /api/admin* and signs in AdvisorDefense staff
// with an email one-time PIN. Access adds a signed JWT to every request it lets through, in the
// Cf-Access-Jwt-Assertion header. This module verifies that JWT in code as well, so the admin side
// stays closed on any hostname Access does not cover (such as *.pages.dev) and if the Access
// application is ever misconfigured:
// - RS256 signature against the team's public keys (https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs)
// - issuer is the team domain, audience includes ACCESS_AUD, not expired, not before its start time
// - the email ends with @ADMIN_EMAIL_DOMAIN
// Local dev (isLocalDev, set by configuration only): ADMIN_DEV_EMAIL stands in for the JWT.
import { isLocalDev } from './http.js';

export const JWT_HEADER = 'Cf-Access-Jwt-Assertion';
const TEAM_DOMAIN = /^[a-z0-9-]+\.cloudflareaccess\.com$/;
const CERTS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_S = 60;
const FETCH_TIMEOUT_MS = 5000;

const encoder = new TextEncoder();
const certCache = new Map();

function fromBase64url(value) {
  const s = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function decodePart(part) {
  return JSON.parse(new TextDecoder().decode(fromBase64url(part)));
}

export function emailAllowed(email, domain) {
  if (typeof email !== 'string' || typeof domain !== 'string' || !domain) return false;
  return email.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
}

// The team's signing keys, cached per isolate. Refetched when stale or when a kid is unknown.
async function signingKeys(team, fetchImpl, now, refresh = false) {
  const cached = certCache.get(team);
  if (cached && !refresh && now - cached.at < CERTS_TTL_MS) return cached.keys;
  const res = await fetchImpl(`https://${team}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error('certs_unavailable');
  const body = await res.json();
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  certCache.set(team, { at: now, keys });
  return keys;
}

export function clearCertCache() {
  certCache.clear();
}

// Returns the verified claims, or null.
export async function verifyAccessJwt(token, { team, aud }, fetchImpl = fetch, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 8192) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = decodePart(parts[0]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

    let jwk = (await signingKeys(team, fetchImpl, now)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await signingKeys(team, fetchImpl, now, true)).find((k) => k.kid === header.kid);
    if (!jwk || jwk.kty !== 'RSA') return null;

    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;

    const claims = decodePart(parts[1]);
    const nowS = Math.floor(now / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== `https://${team}`) return null;
    if (!audiences.includes(aud)) return null;
    if (!Number.isInteger(claims.exp) || claims.exp <= nowS) return null;
    if (Number.isInteger(claims.nbf) && claims.nbf > nowS + CLOCK_SKEW_S) return null;
    return claims;
  } catch {
    return null;
  }
}

// Resolves the request to { email } for an AdvisorDefense admin, or null. Fails closed when any
// setting is missing.
export async function adminIdentity(request, env = {}, fetchImpl = fetch, now = Date.now()) {
  const domain = env.ADMIN_EMAIL_DOMAIN;
  if (isLocalDev(env) && env.ADMIN_DEV_EMAIL) {
    return emailAllowed(env.ADMIN_DEV_EMAIL, domain) ? { email: env.ADMIN_DEV_EMAIL.toLowerCase() } : null;
  }
  const team = env.ACCESS_TEAM_DOMAIN;
  if (!TEAM_DOMAIN.test(team || '') || !env.ACCESS_AUD || !domain) return null;
  const claims = await verifyAccessJwt(request.headers.get(JWT_HEADER), { team, aud: env.ACCESS_AUD }, fetchImpl, now);
  if (!claims || !emailAllowed(claims.email, domain)) return null;
  return { email: claims.email.toLowerCase() };
}

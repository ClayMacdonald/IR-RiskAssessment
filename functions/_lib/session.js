// Access codes and signed sessions.
//
// ACCESS_CODES (Cloudflare secret) is JSON mapping the SHA-256 hex of each access code to
// { "clientId": "...", "firmName": "...", "expires": "YYYY-MM-DD" }. No plaintext codes anywhere.
// A code is valid through the end of its expires date (UTC).
//
// The session cookie carries only { cid, exp } and an HMAC-SHA256 signature made with SESSION_SECRET.
// Production: __Host-irp_session; HttpOnly; Secure; SameSite=Strict; Path=/.
// Local dev (isLocalDev, set by configuration only): irp_session without Secure, so browsers that
// refuse Secure cookies over http://localhost (Safari) keep it. The __Host- prefix requires Secure.
import { isLocalDev } from './http.js';

export const COOKIE_NAME = '__Host-irp_session';
export const DEV_COOKIE_NAME = 'irp_session';
export const SESSION_SECONDS = 8 * 60 * 60;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const encoder = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value) {
  const s = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// Compares two strings in time that depends only on their length.
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// Uppercases and strips spaces and dashes, so "abcd-efgh" and "ABCDEFGH" match.
export function normalizeCode(code) {
  return typeof code === 'string' ? code.toUpperCase().replace(/[\s-]/g, '') : '';
}

export async function hashCode(code) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(normalizeCode(code))));
}

// 20 characters from a 31-character alphabet: about 99 bits. Rejection sampling avoids modulo bias.
export function generateCode(groups = 4, size = 5) {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  const chars = [];
  while (chars.length < groups * size) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < limit && chars.length < groups * size) chars.push(CODE_ALPHABET[b % CODE_ALPHABET.length]);
    }
  }
  return Array.from({ length: groups }, (_, i) => chars.slice(i * size, (i + 1) * size).join('')).join('-');
}

const parsed = new Map();

export function readAccessCodes(env = {}) {
  const raw = env.ACCESS_CODES;
  if (!raw) return null;
  if (!parsed.has(raw)) {
    try {
      const value = JSON.parse(raw);
      parsed.set(raw, value && typeof value === 'object' && !Array.isArray(value) ? value : null);
    } catch {
      parsed.set(raw, null);
    }
  }
  return parsed.get(raw);
}

// End of the expires date, in epoch seconds. Invalid dates count as expired.
export function codeExpiry(entry) {
  if (!entry || !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires || '')) return 0;
  const t = Date.parse(`${entry.expires}T23:59:59Z`);
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

// Looks up a submitted code. Compares against every entry so timing does not reveal a match.
export async function findCode(codes, code) {
  const hash = await hashCode(code);
  let match = null;
  for (const [key, entry] of Object.entries(codes)) {
    if (timingSafeEqual(key.toLowerCase(), hash) && !match) match = entry;
  }
  return match;
}

export function findClient(codes, clientId) {
  for (const entry of Object.values(codes)) if (entry && entry.clientId === clientId) return entry;
  return null;
}

// Active means the entry exists, has a clientId and its code has not expired.
export function isActive(entry, now = Date.now()) {
  return Boolean(entry && typeof entry.clientId === 'string' && entry.clientId && codeExpiry(entry) > now / 1000);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function signSession(payload, secret) {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${base64url(new Uint8Array(sig))}`;
}

// Returns the payload if the signature is valid and the session has not expired, else null.
// crypto.subtle.verify compares the signature in constant time.
export async function verifySession(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 512 || !secret) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64url(sig), encoder.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(body)));
    if (typeof payload.cid !== 'string' || !Number.isInteger(payload.exp)) return null;
    if (payload.exp <= Math.floor(now / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function cookieName(env) {
  return isLocalDev(env) ? DEV_COOKIE_NAME : COOKIE_NAME;
}

function cookieFlags(env) {
  return isLocalDev(env) ? 'HttpOnly; SameSite=Strict; Path=/' : 'HttpOnly; Secure; SameSite=Strict; Path=/';
}

export function readCookie(request, name = COOKIE_NAME) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionCookie(token, maxAge, env) {
  return `${cookieName(env)}=${token}; ${cookieFlags(env)}; Max-Age=${maxAge}`;
}

export function clearedCookie(env) {
  return `${cookieName(env)}=; ${cookieFlags(env)}; Max-Age=0`;
}

// Resolves the request's session to an active client, or null.
export async function currentClient(request, env, now = Date.now()) {
  const codes = readAccessCodes(env);
  if (!codes || !env.SESSION_SECRET) return null;
  const session = await verifySession(readCookie(request, cookieName(env)), env.SESSION_SECRET, now);
  if (!session) return null;
  const entry = findClient(codes, session.cid);
  return isActive(entry, now) ? { clientId: entry.clientId, firmName: entry.firmName || '' } : null;
}

// Verifies a Cloudflare Turnstile token with the action and hostnames we expect.
// Tokens are single use, so a captured request cannot be replayed.

const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const UPSTREAM_TIMEOUT_MS = 8000;

export async function verifyTurnstile({ token, ip, secret, action, hostnames }, fetchImpl = fetch) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const res = await fetchImpl(TURNSTILE_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const out = await res.json();
    return out.success === true && out.action === action && hostnames.includes(out.hostname);
  } catch {
    return false;
  }
}

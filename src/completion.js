// Completion notification. When someone downloads their report, AdvisorDefense is emailed their
// name, work email, role, both scores, section scores and the IDs of the questions they missed.
// Their answers never leave the browser. The server adds the client from the session cookie.
//
// The request goes to the Pages Function at /api/completion, which verifies a Cloudflare Turnstile
// token and sends the email (functions/api/completion.js). Notification never blocks the report:
// any failure is swallowed and the PDF still downloads.

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
const TOKEN_TIMEOUT_MS = 20000;

let scriptPromise = null;

export function notificationsEnabled() {
  return Boolean(SITE_KEY);
}

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TURNSTILE_SRC;
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile_missing')));
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error('turnstile_load_failed'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// Renders an invisible-unless-needed Turnstile widget into `container`.
// Returns getToken(), which runs the challenge and resolves with a single-use token.
export function prepareCheck(container) {
  if (!notificationsEnabled() || !container) return { getToken: () => Promise.reject(new Error('disabled')) };
  let widgetId = null;
  let pending = null;

  const ready = loadTurnstile().then((ts) => {
    widgetId = ts.render(container, {
      sitekey: SITE_KEY,
      action: 'completion',
      appearance: 'interaction-only',
      execution: 'execute',
      callback: (token) => pending?.resolve(token),
      'error-callback': () => pending?.reject(new Error('turnstile_error')),
      'expired-callback': () => pending?.reject(new Error('turnstile_expired')),
    });
    return ts;
  });
  // Avoid an unhandled rejection if the script cannot load; getToken reports it instead.
  ready.catch(() => {});

  async function getToken() {
    const ts = await ready;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('turnstile_timeout')), TOKEN_TIMEOUT_MS);
      pending = {
        resolve: (t) => {
          clearTimeout(timer);
          resolve(t);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      ts.reset(widgetId);
      ts.execute(widgetId);
    });
  }

  return { getToken };
}

// Sends the notification. Resolves { ok } and never throws.
export async function submitCompletion(payload, check) {
  if (!notificationsEnabled() || !check) return { ok: false, skipped: true };
  try {
    const turnstileToken = await check.getToken();
    const res = await fetch('/api/completion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, turnstileToken }),
      keepalive: true,
      credentials: 'same-origin',
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

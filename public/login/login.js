// Login page. Exchanges an access code for a session cookie at POST /api/login.
// Turnstile handling follows src/completion.js: invisible unless Cloudflare needs the visitor to interact.

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TOKEN_TIMEOUT_MS = 20000;

const form = document.querySelector('form');
const input = form.code;
const error = document.getElementById('code-error');
const button = form.querySelector('[data-submit]');
const label = button.querySelector('[data-label]');
const slot = form.querySelector('[data-turnstile]');

let widget = null;
let pending = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile_missing')));
    s.onerror = () => reject(new Error('turnstile_load_failed'));
    document.head.appendChild(s);
  });
}

// Resolves with the Turnstile API and widget id, or null when no site key is configured (local dev).
const ready = fetch('/api/login', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
  .then((r) => r.json())
  .then(({ siteKey }) => {
    if (!siteKey) return null;
    return loadTurnstile().then((ts) => {
      widget = ts.render(slot, {
        sitekey: siteKey,
        action: 'login',
        appearance: 'interaction-only',
        execution: 'execute',
        callback: (token) => pending?.resolve(token),
        'error-callback': () => pending?.reject(new Error('turnstile_error')),
        'expired-callback': () => pending?.reject(new Error('turnstile_expired')),
      });
      return ts;
    });
  });
ready.catch(() => {});

async function getToken() {
  const ts = await ready;
  if (!ts) return '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('turnstile_timeout')), TOKEN_TIMEOUT_MS);
    pending = {
      resolve: (t) => (clearTimeout(timer), resolve(t)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    };
    ts.reset(widget);
    ts.execute(widget);
  });
}

function showError(show) {
  error.hidden = !show;
  input.setAttribute('aria-invalid', String(show));
  if (show) input.setAttribute('aria-describedby', 'code-error');
  else input.removeAttribute('aria-describedby');
}

function busy(on) {
  button.disabled = on;
  button.toggleAttribute('aria-busy', on);
  label.textContent = on ? 'Signing in' : 'Sign in';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = input.value.trim();
  if (!code) {
    showError(true);
    input.focus();
    return;
  }
  showError(false);
  busy(true);
  try {
    const turnstileToken = await getToken();
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, turnstileToken }),
      credentials: 'same-origin',
    });
    if (res.ok) {
      window.location.replace('/');
      return;
    }
  } catch {
    // Same generic message for every failure.
  }
  busy(false);
  showError(true);
  input.focus();
});

input.addEventListener('input', () => showError(false));

// Calls to the admin Functions (/api/admin/*). Cloudflare Access signs the admin in; its cookie
// rides along on same-origin requests. Every call returns the parsed body, or throws an Error whose
// message is safe to show.

export class AdminError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function call(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api/admin${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AdminError('Could not reach the server. Check your connection and try again.', 0);
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    // Non-JSON responses fall through to the status checks below.
  }
  if (res.status === 403) throw new AdminError('Your AdvisorDefense sign-in has ended or is not allowed here. Reload the page to sign in again.', 403);
  if (res.status === 404) throw new AdminError('That record no longer exists.', 404);
  if (!res.ok || !data.ok) throw new AdminError(data.error || 'Something went wrong. Try again.', res.status);
  return data;
}

export const api = {
  me: () => call('/me'),
  clients: () => call('/clients'),
  createClient: (input) => call('/clients', { method: 'POST', body: input }),
  client: (id) => call(`/clients/${encodeURIComponent(id)}`),
  changeClient: (id, body) => call(`/clients/${encodeURIComponent(id)}`, { method: 'POST', body }),
  submission: (id, purpose = 'view') => call(`/submissions/${encodeURIComponent(id)}${purpose === 'download' ? '?for=download' : ''}`),
  deleteSubmission: (id) => call(`/submissions/${encodeURIComponent(id)}`, { method: 'POST', body: { action: 'delete' } }),
};

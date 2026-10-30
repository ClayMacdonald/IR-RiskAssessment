// GET /api/client: the signed-in client's firm name and optional content override.
// The middleware has already checked the session and set data.clientId. Only this client's
// override is returned, so one client never sees another client's tailoring.
import { reply } from '../_lib/http.js';
import clients from '../_lib/clients.generated.js';

const ROUTE = '/api/client';

export async function onRequestGet({ data }) {
  return clientResponse(data);
}

export async function onRequest() {
  return reply(ROUTE, 405, 'method_not_allowed', { headers: { Allow: 'GET' } });
}

export function clientResponse(data = {}, overrides = clients) {
  if (!data.clientId) return reply(ROUTE, 401, 'no_session');
  const override = Object.hasOwn(overrides, data.clientId) ? overrides[data.clientId] : null;
  return reply(ROUTE, 200, 'ok', {
    body: { ok: true, clientId: data.clientId, firmName: data.firmName || '', override },
  });
}

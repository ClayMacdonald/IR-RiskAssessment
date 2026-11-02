// Onboards a client without touching code.
// Usage: npm run add-client <clientId> "<Firm Name>" <YYYY-MM-DD>
//
// Prints a new access code once, and the JSON entry to merge into the ACCESS_CODES secret.
// The code itself is never stored. Send it to the client by a separate channel from the URL.
// scripts/dev-setup.mjs imports createClientEntry() to make the local test code.
import { pathToFileURL } from 'node:url';
import { generateCode, hashCode } from '../functions/_lib/session.js';

export function checkClientArgs(clientId, firmName, expires) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(clientId || '') || !firmName || !/^\d{4}-\d{2}-\d{2}$/.test(expires || '')) {
    return 'Usage: npm run add-client <clientId> "<Firm Name>" <YYYY-MM-DD>\nclientId: lowercase letters, digits and dashes, for example "acme-wealth".';
  }
  if (Number.isNaN(Date.parse(`${expires}T00:00:00Z`)) || Date.parse(`${expires}T23:59:59Z`) < Date.now()) {
    return 'expires must be a valid date that has not passed.';
  }
  return null;
}

// Returns { code, entry }, where entry is { "<sha256 of code>": { clientId, firmName, expires } }.
export async function createClientEntry(clientId, firmName, expires) {
  const problem = checkClientArgs(clientId, firmName, expires);
  if (problem) throw new Error(problem);
  const code = generateCode();
  return { code, entry: { [await hashCode(code)]: { clientId, firmName, expires } } };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [clientId, firmName, expires] = process.argv.slice(2);
  const problem = checkClientArgs(clientId, firmName, expires);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  const { code, entry } = await createClientEntry(clientId, firmName, expires);
  console.log(`
Access code for ${firmName} (shown once, not stored):

  ${code}

Merge this entry into the ACCESS_CODES secret (Cloudflare Pages, Settings, Variables and Secrets):

${JSON.stringify(entry, null, 2).slice(2, -2)}

Then redeploy so the new secret takes effect.
`);
}

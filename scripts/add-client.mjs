// Onboards a client without touching code.
// Usage: npm run add-client -- <clientId> "<Firm Name>" <YYYY-MM-DD>
//
// Prints a new access code once, and the JSON entry to merge into the ACCESS_CODES secret.
// The code itself is never stored. Send it to the client by a separate channel from the URL.
import { generateCode, hashCode } from '../functions/_lib/session.js';

const [clientId, firmName, expires] = process.argv.slice(2);

if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(clientId || '') || !firmName || !/^\d{4}-\d{2}-\d{2}$/.test(expires || '')) {
  console.error('Usage: npm run add-client -- <clientId> "<Firm Name>" <YYYY-MM-DD>');
  console.error('clientId: lowercase letters, digits and dashes, for example "acme-wealth".');
  process.exit(1);
}
if (Number.isNaN(Date.parse(`${expires}T00:00:00Z`)) || Date.parse(`${expires}T23:59:59Z`) < Date.now()) {
  console.error('expires must be a valid date that has not passed.');
  process.exit(1);
}

const code = generateCode();
const entry = { [await hashCode(code)]: { clientId, firmName, expires } };

console.log(`
Access code for ${firmName} (shown once, not stored):

  ${code}

Merge this entry into the ACCESS_CODES secret (Cloudflare Pages, Settings, Variables and Secrets):

${JSON.stringify(entry, null, 2).slice(2, -2)}

Then redeploy so the new secret takes effect.
`);

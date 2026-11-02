// Onboards a client from the command line. (The admin dashboard does the same from the browser.)
// Usage: npm run add-client <clientId> "<Firm Name>" <YYYY-MM-DD>
//
// Prints a new access code once, and writes a SQL file that adds the client to the production D1
// database. Rerunning for an existing clientId issues a new code and ends sessions made with the old one.
// The code itself is never stored. Send it to the client by a separate channel from the URL.
// scripts/dev-setup.mjs imports createClientEntry() to make the local test code.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateCode, hashCode } from '../functions/_lib/session.js';
import { upsertClientSql } from './sql.mjs';

export function checkClientArgs(clientId, firmName, expires) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(clientId || '') || !firmName || !/^\d{4}-\d{2}-\d{2}$/.test(expires || '')) {
    return 'Usage: npm run add-client <clientId> "<Firm Name>" <YYYY-MM-DD>\nclientId: lowercase letters, digits and dashes, for example "acme-wealth".';
  }
  if (Number.isNaN(Date.parse(`${expires}T00:00:00Z`)) || Date.parse(`${expires}T23:59:59Z`) < Date.now()) {
    return 'expires must be a valid date that has not passed.';
  }
  return null;
}

// Returns { code, client }, where client is { clientId, firmName, expires, codeHash }.
export async function createClientEntry(clientId, firmName, expires) {
  const problem = checkClientArgs(clientId, firmName, expires);
  if (problem) throw new Error(problem);
  const code = generateCode();
  return { code, client: { clientId, firmName, expires, codeHash: await hashCode(code) } };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [clientId, firmName, expires] = process.argv.slice(2);
  const problem = checkClientArgs(clientId, firmName, expires);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  const { code, client } = await createClientEntry(clientId, firmName, expires);
  const file = join(tmpdir(), `irp-client-${clientId}.sql`);
  writeFileSync(file, `${upsertClientSql({ ...client, actor: 'add-client' })}\n`);
  console.log(`
Access code for ${firmName} (shown once, not stored):

  ${code}

Add the client to the production database (the file holds only the code's hash):

  npx wrangler d1 execute irp-assessment --remote --file "${file}"

The code works as soon as that command finishes. No redeploy needed. Delete the file afterwards.
`);
}

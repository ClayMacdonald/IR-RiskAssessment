// Onboards a client from the command line. (The admin dashboard does the same from the browser.)
// Usage: npm run add-client <clientId> "<Firm Name>" <YYYY-MM-DD>
//
// Prints a new access code once, and writes a SQL file that adds the client to the production D1
// database. Rerunning for an existing clientId issues a new code and ends sessions made with the old one.
// The code itself is never stored. Send it to the client by a separate channel from the URL.
// Validation and code creation live in functions/_lib/session.js, shared with the dashboard.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { clientProblem, createClientEntry } from '../functions/_lib/session.js';
import { upsertClientSql } from './sql.mjs';

export { createClientEntry };

const USAGE = 'Usage: npm run add-client <clientId> "<Firm Name>" <YYYY-MM-DD>, for example acme-wealth "Acme Wealth Partners" 2027-12-31';

export function checkClientArgs(clientId, firmName, expires) {
  const problem = clientProblem({ clientId, firmName, expires });
  return problem && `${problem}\n${USAGE}`;
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
Access code for ${client.firmName} (shown once, not stored):

  ${code}

Add the client to the production database (the file holds only the code's hash):

  npx wrangler d1 execute irp-assessment --remote --file "${file}"

The code works as soon as that command finishes. No redeploy needed. Delete the file afterwards.
`);
}

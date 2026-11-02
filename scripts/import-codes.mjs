// One-time move of clients from the retired ACCESS_CODES secret into D1.
// Usage: npm run import-codes <access-codes.json>
//
// The input is the ACCESS_CODES JSON ({ "<sha256>": { clientId, firmName, expires } }). Cloudflare
// cannot show a secret's value, so use the copy kept when the secret was set. It holds only hashes.
// Writes a SQL file to run with wrangler d1 execute, and prints the command.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { upsertClientSql } from './sql.mjs';

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run import-codes <access-codes.json>');
  process.exit(1);
}

const codes = JSON.parse(readFileSync(input, 'utf8'));
if (!codes || typeof codes !== 'object' || Array.isArray(codes)) {
  console.error('Expected a JSON object of { "<sha256>": { clientId, firmName, expires } }.');
  process.exit(1);
}

const seen = new Set();
const lines = [];
for (const [hash, entry] of Object.entries(codes)) {
  if (seen.has(entry?.clientId)) {
    console.error(`clientId ${entry.clientId} appears more than once. Keep one code per client, then rerun.`);
    process.exit(1);
  }
  seen.add(entry?.clientId);
  lines.push(upsertClientSql({ ...entry, codeHash: hash.toLowerCase(), actor: 'import' }));
}

const file = join(tmpdir(), 'irp-import-codes.sql');
writeFileSync(file, `${lines.join('\n')}\n`);
console.log(`
${lines.length} client${lines.length === 1 ? '' : 's'} ready to import. Run:

  npx wrangler d1 execute irp-assessment --remote --file "${file}"

Then sign in with one existing code to confirm, and delete the ACCESS_CODES secret.
`);

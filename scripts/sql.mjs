// Builds SQL files for wrangler d1 execute from the Functions' own statements (functions/_lib/db.js).
// Values are validated, then inlined as quoted literals.
import { UPSERT_CLIENT_SQL, upsertClientValues } from '../functions/_lib/db.js';

const CLIENT_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;
const HASH = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function inline(sql, values) {
  let i = 0;
  const out = sql.replace(/\?/g, () => sqlLiteral(values[i++]));
  if (i !== values.length) throw new Error('Placeholder count does not match the values.');
  return out;
}

// One upsert per client. Throws on anything that does not look like a client record.
export function upsertClientSql(client) {
  const { clientId, firmName, codeHash, expires } = client;
  if (!CLIENT_ID.test(clientId || '')) throw new Error(`Bad clientId: ${clientId}`);
  if (!firmName || typeof firmName !== 'string') throw new Error(`Missing firm name for ${clientId}`);
  if (!HASH.test(codeHash || '')) throw new Error(`Bad code hash for ${clientId}`);
  if (!DATE.test(expires || '')) throw new Error(`Bad expires date for ${clientId}`);
  return `${inline(UPSERT_CLIENT_SQL, upsertClientValues(client))};`;
}

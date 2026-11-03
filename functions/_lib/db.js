// Client records in Cloudflare D1 (binding DB). Schema: migrations/0001_admin.sql.
//
// Lookups by code go through the unique index on code_hash. The hash is of a ~99-bit random
// code, so the lookup's timing reveals nothing an attacker can use.

export function rowToClient(row) {
  if (!row) return null;
  return {
    clientId: row.client_id,
    firmName: row.firm_name,
    expires: row.expires,
    codeVersion: row.code_version,
    revokedAt: row.revoked_at || null,
  };
}

const CLIENT_COLUMNS = 'client_id, firm_name, expires, code_version, revoked_at';

export async function clientByCodeHash(db, hash) {
  return rowToClient(await db.prepare(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE code_hash = ?`).bind(hash).first());
}

export async function clientById(db, clientId) {
  return rowToClient(await db.prepare(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE client_id = ?`).bind(clientId).first());
}

// Same firm name, ignoring case and surrounding spaces. Used to stop duplicate clients.
export async function clientByFirmName(db, firmName) {
  return rowToClient(
    await db.prepare(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE lower(trim(firm_name)) = lower(trim(?))`).bind(firmName).first()
  );
}

// Inserts a new client, or replaces an existing client's code: the version goes up, so sessions
// made with the old code end, and any revocation is lifted.
// scripts/sql.mjs uses the same statement to write SQL files for wrangler d1 execute.
export const UPSERT_CLIENT_SQL = `INSERT INTO clients (client_id, firm_name, code_hash, expires, created_at, created_by)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT (client_id) DO UPDATE SET
  firm_name = excluded.firm_name, code_hash = excluded.code_hash, expires = excluded.expires,
  code_version = clients.code_version + 1, revoked_at = NULL`;

export function upsertClientValues({ clientId, firmName, codeHash, expires, actor, now = new Date() }) {
  return [clientId, firmName, codeHash, expires, now.toISOString(), actor];
}

export function upsertClientStatement(db, client) {
  return db.prepare(UPSERT_CLIENT_SQL).bind(...upsertClientValues(client));
}

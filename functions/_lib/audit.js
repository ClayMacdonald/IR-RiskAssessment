// Admin audit log (audit_log table). One row per admin view, download, create, change and delete.
// Rows are only ever inserted. detail is a short JSON object, never personal data beyond the
// actor's email: record IDs and counts only.

export function auditStatement(db, { actor, action, clientId = null, detail = null, now = new Date() }) {
  return db
    .prepare('INSERT INTO audit_log (at, actor_email, action, client_id, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(now.toISOString(), actor, action, clientId, detail ? JSON.stringify(detail) : null);
}

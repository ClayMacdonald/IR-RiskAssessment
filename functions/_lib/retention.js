// Retention: completed assessments and audit rows older than retentionYears (src/content/config.json)
// are deleted. Pages Functions have no scheduled jobs, so the purge runs each time the admin
// dashboard opens (GET /api/admin/clients). Each purge that deletes anything writes an audit row.
import appConfig from '../../src/content/config.json' with { type: 'json' };
import { auditStatement } from './audit.js';

export function retentionCutoff(now = new Date(), years = appConfig.retentionYears) {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return cutoff.toISOString();
}

// Returns { submissions, audit } with the number of rows deleted.
export async function purgeExpired(db, actor, now = new Date(), years = appConfig.retentionYears) {
  const cutoff = retentionCutoff(now, years);
  const [subs, audit] = await db.batch([
    db.prepare('DELETE FROM submissions WHERE completed_at < ?').bind(cutoff),
    db.prepare('DELETE FROM audit_log WHERE at < ?').bind(cutoff),
  ]);
  const deleted = { submissions: subs.meta.changes || 0, audit: audit.meta.changes || 0 };
  if (deleted.submissions || deleted.audit) {
    await auditStatement(db, { actor, action: 'retention_purge', detail: { ...deleted, before: cutoff, years }, now }).run();
  }
  return deleted;
}

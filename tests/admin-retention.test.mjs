// Retention purge (on dashboard open) and the activity log endpoint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { purgeExpired, retentionCutoff } from '../functions/_lib/retention.js';
import { listClients } from '../functions/api/admin/clients/index.js';
import { listAudit, PAGE_SIZE } from '../functions/api/admin/audit.js';
import { auditStatement } from '../functions/_lib/audit.js';
import { upsertClientStatement } from '../functions/_lib/db.js';
import config from '../src/content/config.json' with { type: 'json' };
import { createD1 } from './d1.mjs';

const ADMIN = { adminEmail: 'analyst@advisordefense.com' };
const NOW = new Date('2033-03-15T12:00:00Z');

const consoleLog = console.log;
console.log = () => {};
test.after(() => (console.log = consoleLog));

async function setup() {
  const DB = createD1();
  await upsertClientStatement(DB, { clientId: 'acme', firmName: 'Acme', codeHash: 'a'.repeat(64), expires: '2099-12-31', actor: 't', now: new Date('2026-01-01T00:00:00Z') }).run();
  return { DB };
}

async function addRecord(db, id, completedAt) {
  await db
    .prepare(`INSERT INTO submissions (id, client_id, completed_at, name, email, role, irp_version, readiness_score, knowledge_score, sections_json, missed_json, answers_json, bank_json)
              VALUES (?, 'acme', ?, 'P', 'p@example.com', 'CSIRT Lead', 'v1', 90, 90, '[]', '[]', '{}', '{}')`)
    .bind(id, completedAt)
    .run();
}

test('retention is six years and the cutoff is exact', () => {
  assert.equal(config.retentionYears, 6);
  assert.equal(retentionCutoff(NOW), '2027-03-15T12:00:00.000Z');
});

test('opening the dashboard deletes records and log rows older than the retention period, and logs the purge', async () => {
  const env = await setup();
  await addRecord(env.DB, 'a'.repeat(32), '2027-03-15T11:59:59.000Z');
  await addRecord(env.DB, 'b'.repeat(32), '2027-03-15T12:00:00.000Z');
  await addRecord(env.DB, 'c'.repeat(32), '2032-01-01T00:00:00.000Z');
  await auditStatement(env.DB, { actor: 'old@advisordefense.com', action: 'client_view', clientId: 'acme', now: new Date('2026-06-01T00:00:00Z') }).run();

  const res = await listClients(env, ADMIN, NOW);
  const body = await res.json();
  assert.deepEqual(body.purged, { submissions: 1, audit: 1 });
  assert.equal(body.clients[0].completions, 2);
  const left = (await env.DB.prepare('SELECT id FROM submissions ORDER BY id').all()).results.map((r) => r.id);
  assert.deepEqual(left, ['b'.repeat(32), 'c'.repeat(32)], 'exactly at the cutoff is kept');

  const log = (await env.DB.prepare('SELECT actor_email, action, detail FROM audit_log').all()).results;
  assert.equal(log.length, 1);
  assert.equal(log[0].action, 'retention_purge');
  assert.equal(log[0].actor_email, 'analyst@advisordefense.com');
  assert.deepEqual(JSON.parse(log[0].detail), { submissions: 1, audit: 1, before: '2027-03-15T12:00:00.000Z', years: 6 });
});

test('a purge with nothing to delete writes no audit row', async () => {
  const env = await setup();
  await addRecord(env.DB, 'c'.repeat(32), '2032-01-01T00:00:00.000Z');
  assert.deepEqual(await purgeExpired(env.DB, 'x@advisordefense.com', NOW), { submissions: 0, audit: 0 });
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM audit_log').first()).n, 0);
});

test('the activity log lists newest first, pages back and needs an admin', async () => {
  const env = await setup();
  for (let i = 0; i < PAGE_SIZE + 5; i++) {
    await auditStatement(env.DB, { actor: 'a@advisordefense.com', action: 'client_view', clientId: 'acme', detail: { n: i } }).run();
  }
  const first = await (await listAudit(env, ADMIN)).json();
  assert.equal(first.rows.length, PAGE_SIZE);
  assert.equal(first.more, true);
  assert.equal(first.rows[0].detail.n, PAGE_SIZE + 4);
  assert.equal(first.rows[0].firmName, 'Acme');
  const second = await (await listAudit(env, ADMIN, first.rows.at(-1).id)).json();
  assert.equal(second.rows.length, 5);
  assert.equal(second.more, false);
  assert.equal(second.rows.at(-1).detail.n, 0);
  assert.equal((await listAudit(env, {})).status, 403);
});

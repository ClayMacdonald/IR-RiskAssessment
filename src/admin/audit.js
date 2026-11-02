// Activity log: every admin view, download, change, delete and retention purge, newest first.
import config from '../content/config.json';
import { icon } from '../components/icons.js';
import { el, escapeHtml } from '../util.js';
import { api } from './api.js';
import { errorNotice, formatTimestamp } from './format.js';

const ACTIONS = {
  client_create: 'Added the client',
  client_view: 'Viewed the client',
  client_new_code: 'Issued a new code',
  client_set_expiry: 'Changed the expiry',
  client_revoke: 'Revoked access',
  client_preview: 'Previewed as the client',
  client_delete_records: 'Deleted all records',
  submission_view: 'Viewed a record',
  submission_download: 'Downloaded a PDF report',
  submission_delete: 'Deleted a record',
  retention_purge: 'Retention purge',
};

function describe(r) {
  const d = r.detail || {};
  if (r.action === 'client_set_expiry') return `From ${d.from} to ${d.to}`;
  if (r.action === 'client_delete_records') return `${d.deleted} deleted`;
  if (r.action === 'retention_purge') return `${d.submissions} records and ${d.audit} log rows older than ${d.years} years`;
  if (d.submission) return `Record ${d.submission.slice(0, 8)}`;
  return '';
}

function rows(list) {
  return list
    .map(
      (r) => `
      <tr>
        <td data-label="When" class="nowrap">${escapeHtml(formatTimestamp(r.at))}</td>
        <td data-label="Who">${escapeHtml(r.actor)}</td>
        <th scope="row">${escapeHtml(ACTIONS[r.action] || r.action)}</th>
        <td data-label="Client">${r.clientId ? `<a href="#/clients/${encodeURIComponent(r.clientId)}">${escapeHtml(r.firmName || r.clientId)}</a>` : ''}</td>
        <td data-label="Detail">${escapeHtml(describe(r))}</td>
      </tr>`
    )
    .join('');
}

export function renderAudit() {
  const element = el(`
    <div class="container-page admin-page">
      <p class="admin-back"><a href="#/clients">${icon('arrowLeft', 16, 2)} All clients</a></p>
      <div class="title-block">
        <p class="eyebrow">Admin</p>
        <h1>Activity log</h1>
        <p class="lead">Every admin view, download, change and delete. Kept ${config.retentionYears} years, the same as the records.</p>
      </div>
      <section class="card" aria-labelledby="log-title">
        <h2 class="card-title" id="log-title">Recent activity</h2>
        <div data-log aria-busy="true"><p class="admin-loading">Loading</p></div>
      </section>
    </div>`);

  const log = element.querySelector('[data-log]');
  let all = [];

  async function load(before = null) {
    try {
      const res = await api.audit(before);
      all = all.concat(res.rows);
      log.innerHTML = all.length
        ? `<table class="admin-table">
            <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Client</th><th scope="col">Detail</th></tr></thead>
            <tbody>${rows(all)}</tbody>
          </table>
          ${res.more ? '<p class="admin-delete-all"><button type="button" class="btn btn-secondary" data-more>Show older activity</button></p>' : ''}`
        : '<p class="findings-empty">No activity yet.</p>';
      log.querySelector('[data-more]')?.addEventListener('click', () => load(all[all.length - 1].id));
    } catch (err) {
      log.innerHTML = errorNotice(err.message);
    } finally {
      log.removeAttribute('aria-busy');
    }
  }

  load();
  return { element };
}

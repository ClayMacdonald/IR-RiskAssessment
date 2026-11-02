// Client detail: code status and actions (new code, change expiry, revoke), and the client's
// completed assessments with a PDF download and delete for each.
import config from '../content/config.json';
import { readinessBand, knowledgeBand } from '../scoring.js';
import { icon } from '../components/icons.js';
import { el, escapeHtml } from '../util.js';
import { api } from './api.js';
import { downloadReport } from './report.js';
import { chip, codePanel, errorNotice, formatDate, formatTimestamp, statusChip, wireCopy } from './format.js';

function scoreChip(score, band) {
  return score === null || score === undefined ? '<span class="admin-muted">Not asked</span>' : chip(`${score}`, band(score).tone);
}

function submissionRows(submissions) {
  if (!submissions.length) return '<p class="findings-empty">No completed assessments yet.</p>';
  return `
    <table class="admin-table">
      <thead><tr>
        <th scope="col">Person</th><th scope="col">Role</th><th scope="col">Completed</th>
        <th scope="col">Program Readiness</th><th scope="col">IRP Knowledge</th><th scope="col"><span class="sr-only">Actions</span></th>
      </tr></thead>
      <tbody>${submissions
        .map(
          (s) => `
        <tr id="submission-${escapeHtml(s.id)}" data-submission="${escapeHtml(s.id)}">
          <th scope="row">${escapeHtml(s.name)}<span class="admin-sub">${escapeHtml(s.email)}</span></th>
          <td data-label="Role">${escapeHtml(s.role)}</td>
          <td data-label="Completed">${escapeHtml(formatTimestamp(s.completedAt))}</td>
          <td data-label="Program Readiness">${scoreChip(s.readinessScore, readinessBand)}</td>
          <td data-label="IRP Knowledge">${scoreChip(s.knowledgeScore, (v) => knowledgeBand(v, config.knowledgeBands))}</td>
          <td class="admin-row-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-download aria-label="Download the PDF report for ${escapeHtml(s.name)}, ${escapeHtml(formatTimestamp(s.completedAt))}">${icon('download', 16, 2)} PDF</button>
            <button type="button" class="btn btn-text btn-sm btn-danger" data-delete aria-label="Delete the record for ${escapeHtml(s.name)}, ${escapeHtml(formatTimestamp(s.completedAt))}">Delete</button>
          </td>
        </tr>`
        )
        .join('')}</tbody>
    </table>`;
}

function summary(client) {
  return `
    <dl class="admin-facts">
      <div><dt>Client ID</dt><dd><code>${escapeHtml(client.clientId)}</code></dd></div>
      <div><dt>Code</dt><dd>${statusChip(client)}</dd></div>
      <div><dt>Expires</dt><dd>${escapeHtml(formatDate(client.expires))}</dd></div>
    </dl>`;
}

export function renderClient({ clientId, highlight = null }) {
  const element = el(`
    <div class="container-page admin-page">
      <p class="admin-back"><a href="#/clients">${icon('arrowLeft', 16, 2)} All clients</a></p>
      <div class="title-block">
        <p class="eyebrow">Client</p>
        <h1 data-title>${escapeHtml(clientId)}</h1>
        <div data-summary></div>
      </div>
      <div data-body aria-busy="true"><p class="admin-loading">Loading</p></div>
    </div>`);

  const title = element.querySelector('[data-title]');
  const summaryEl = element.querySelector('[data-summary]');
  const body = element.querySelector('[data-body]');
  let client = null;

  function showClient(c) {
    client = c;
    title.textContent = c.firmName;
    summaryEl.innerHTML = summary(c);
    const expiryInput = body.querySelector('#newExpiry');
    if (expiryInput) expiryInput.value = c.expires;
    const revoke = body.querySelector('[data-revoke]');
    if (revoke) revoke.disabled = Boolean(c.revokedAt);
  }

  function render(data) {
    body.innerHTML = `
      <section class="card" aria-labelledby="code-title">
        <h2 class="card-title" id="code-title">Access code</h2>
        <div data-code-status></div>
        <div class="admin-actions">
          <div class="admin-action">
            <h3>Issue a new code</h3>
            <p>For the annual review, or if the code was shared too widely. The old code and everyone signed in with it stop working at once. Also restores a revoked client.</p>
            <button type="button" class="btn btn-secondary" data-new-code>Issue a new code</button>
          </div>
          <form class="admin-action" data-expiry-form novalidate>
            <h3><label for="newExpiry">Change the expiry</label></h3>
            <p>Keeps the current code.</p>
            <div class="admin-inline">
              <input id="newExpiry" name="newExpiry" type="date" required>
              <button type="submit" class="btn btn-secondary">Save expiry</button>
            </div>
          </form>
          <div class="admin-action">
            <h3>Revoke access</h3>
            <p>Blocks sign-in and ends live sessions at once. Saved assessments are kept.</p>
            <button type="button" class="btn btn-secondary btn-danger" data-revoke>Revoke access</button>
          </div>
        </div>
      </section>

      <section class="card" aria-labelledby="subs-title">
        <h2 class="card-title" id="subs-title">Completed assessments</h2>
        <p class="card-intro">Saved when each person downloaded their report. Kept ${config.retentionYears} years. The PDF is rebuilt on this device from the saved answers.</p>
        <div data-subs-status></div>
        <div data-subs>${submissionRows(data.submissions)}</div>
        ${
          data.submissions.length
            ? `<div class="admin-delete-all">
          <button type="button" class="btn btn-text btn-danger" data-delete-all>Delete all ${data.submissions.length} records for this client</button>
        </div>`
            : ''
        }
      </section>`;
    wireSubmissions(data.submissions);
    showClient(data.client);

    const status = body.querySelector('[data-code-status]');

    async function change(payload, done) {
      status.innerHTML = '';
      try {
        const res = await api.changeClient(clientId, payload);
        showClient(res.client);
        done(res);
      } catch (err) {
        status.innerHTML = errorNotice(err.message);
      }
    }

    body.querySelector('[data-new-code]').addEventListener('click', () => {
      if (!window.confirm(`Issue a new code for ${client.firmName}? The current code stops working at once.`)) return;
      change({ action: 'new_code' }, (res) => {
        status.innerHTML = codePanel(res.client.firmName, res.code);
        wireCopy(status);
        status.querySelector('.code-panel').focus();
      });
    });

    body.querySelector('[data-expiry-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      const expires = e.currentTarget.newExpiry.value;
      change({ action: 'set_expiry', expires }, (res) => {
        status.innerHTML = `<p class="admin-ok" role="status">Expiry set to ${escapeHtml(formatDate(res.client.expires))}.</p>`;
      });
    });

    body.querySelector('[data-revoke]').addEventListener('click', () => {
      if (!window.confirm(`Revoke access for ${client.firmName}? Sign-in stops and everyone signed in is signed out.`)) return;
      change({ action: 'revoke' }, () => {
        status.innerHTML = '<p class="admin-ok" role="status">Access revoked. Issue a new code to restore it.</p>';
      });
    });
  }

  function wireSubmissions(submissions) {
    const subsStatus = body.querySelector('[data-subs-status]');
    const subs = body.querySelector('[data-subs]');

    for (const row of subs.querySelectorAll('[data-submission]')) {
      const id = row.dataset.submission;
      const s = submissions.find((x) => x.id === id);
      const download = row.querySelector('[data-download]');
      download.addEventListener('click', async () => {
        subsStatus.innerHTML = '';
        download.disabled = true;
        try {
          await downloadReport(id);
        } catch (err) {
          subsStatus.innerHTML = errorNotice(err.message);
        } finally {
          download.disabled = false;
        }
      });
      row.querySelector('[data-delete]').addEventListener('click', async () => {
        if (!window.confirm(`Delete the record for ${s.name}? This cannot be undone.`)) return;
        subsStatus.innerHTML = '';
        try {
          await api.deleteSubmission(id);
          reload(`Deleted the record for ${s.name}.`);
        } catch (err) {
          subsStatus.innerHTML = errorNotice(err.message);
        }
      });
    }

    const all = body.querySelector('[data-delete-all]');
    if (all) {
      all.addEventListener('click', async () => {
        if (!window.confirm(`Delete all ${submissions.length} records for ${client.firmName}? This cannot be undone.`)) return;
        try {
          const res = await api.changeClient(clientId, { action: 'delete_records' });
          reload(`Deleted ${res.deleted} records.`);
        } catch (err) {
          subsStatus.innerHTML = errorNotice(err.message);
        }
      });
    }

    if (highlight) {
      const target = subs.querySelector(`[data-submission="${CSS.escape(highlight)}"]`);
      if (target) {
        target.classList.add('is-target');
        target.scrollIntoView({ block: 'center' });
      }
    }
  }

  // Reloads the records after a delete and confirms it in place.
  async function reload(message) {
    try {
      const data = await api.client(clientId);
      render(data);
      const subsStatus = body.querySelector('[data-subs-status]');
      subsStatus.innerHTML = `<p class="admin-ok" role="status" tabindex="-1">${escapeHtml(message)}</p>`;
      subsStatus.firstElementChild.focus();
    } catch (err) {
      body.innerHTML = errorNotice(err.message);
    }
  }

  api
    .client(clientId)
    .then(render)
    .catch((err) => {
      body.innerHTML = errorNotice(err.message);
    })
    .finally(() => body.removeAttribute('aria-busy'));

  return { element };
}

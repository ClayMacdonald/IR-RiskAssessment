// Clients screen: every client firm with its code status and completions, and a form to add one.
import config from '../content/config.json';
import { icon } from '../components/icons.js';
import { el, escapeHtml } from '../util.js';
import { api } from './api.js';
import { codePanel, errorNotice, formatDate, formatTimestamp, oneYearFromToday, statusChip, wireCopy } from './format.js';

function rows(clients) {
  if (!clients.length) return '<p class="findings-empty">No clients yet. Add the first one above.</p>';
  return `
    <table class="admin-table">
      <thead><tr>
        <th scope="col">Firm</th><th scope="col">Client ID</th><th scope="col">Code</th>
        <th scope="col">Expires</th><th scope="col" class="num-col">Completions</th><th scope="col">Last completion</th>
      </tr></thead>
      <tbody>${clients
        .map(
          (c) => `
        <tr>
          <th scope="row"><a href="#/clients/${encodeURIComponent(c.clientId)}">${escapeHtml(c.firmName)}</a></th>
          <td data-label="Client ID"><code>${escapeHtml(c.clientId)}</code></td>
          <td data-label="Code">${statusChip(c)}</td>
          <td data-label="Expires">${escapeHtml(formatDate(c.expires))}</td>
          <td data-label="Completions" class="num num-col">${c.completions}</td>
          <td data-label="Last completion">${c.lastCompletedAt ? escapeHtml(formatTimestamp(c.lastCompletedAt)) : 'None yet'}</td>
        </tr>`
        )
        .join('')}</tbody>
    </table>`;
}

export function renderClients({ navigate }) {
  const element = el(`
    <div class="container-page admin-page">
      <div class="title-block">
        <p class="eyebrow">Admin</p>
        <h1>Clients</h1>
        <p class="lead">Access codes and completed assessments for each client firm.</p>
        <p class="admin-retention">Records are kept ${config.retentionYears} years. Older records are deleted when this page opens. <a href="#/audit">Activity log</a></p>
        <div data-purged></div>
      </div>

      <section class="card" aria-labelledby="add-title">
        <h2 class="card-title" id="add-title">Add a client</h2>
        <form class="admin-form" novalidate data-form>
          <div class="field-grid">
            <div class="field">
              <label for="firmName">Firm name</label>
              <input id="firmName" name="firmName" type="text" maxlength="150" autocomplete="off" required>
            </div>
            <div class="field">
              <label for="expires">Code expires</label>
              <input id="expires" name="expires" type="date" required value="${oneYearFromToday()}" aria-describedby="expires-hint">
              <p class="field-hint" id="expires-hint">The code works through the end of this day (UTC). Usually one year, to the next annual IRP review.</p>
            </div>
          </div>
          <div data-form-status></div>
          <div class="card-footer">
            <div class="card-footer-end">
              <button type="submit" class="btn btn-primary" data-create>Create client and code</button>
            </div>
          </div>
        </form>
        <div data-created></div>
      </section>

      <section class="card" aria-labelledby="list-title">
        <h2 class="card-title" id="list-title">All clients</h2>
        <div data-list aria-busy="true"><p class="admin-loading">Loading clients</p></div>
      </section>
    </div>`);

  const form = element.querySelector('[data-form]');
  const list = element.querySelector('[data-list]');
  const formStatus = element.querySelector('[data-form-status]');
  const created = element.querySelector('[data-created]');
  const createBtn = element.querySelector('[data-create]');

  async function load() {
    try {
      const { clients, purged } = await api.clients();
      list.innerHTML = rows(clients);
      if (purged?.submissions) {
        element.querySelector('[data-purged]').innerHTML = `<p class="admin-ok" role="status">Deleted ${purged.submissions} record${purged.submissions === 1 ? '' : 's'} older than ${config.retentionYears} years.</p>`;
      }
    } catch (err) {
      list.innerHTML = errorNotice(err.message);
    } finally {
      list.removeAttribute('aria-busy');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formStatus.innerHTML = '';
    created.innerHTML = '';
    createBtn.disabled = true;
    try {
      const res = await api.createClient({
        firmName: form.firmName.value.trim(),
        expires: form.expires.value,
      });
      form.reset();
      form.expires.value = oneYearFromToday();
      created.innerHTML = `${codePanel(res.firmName, res.code)}
        <p class="field-hint">Client ID: <code data-new-client-id>${escapeHtml(res.clientId)}</code></p>
        <p class="admin-next"><a href="#/clients/${encodeURIComponent(res.clientId)}">Open ${escapeHtml(res.firmName)} ${icon('arrowRight', 16, 2)}</a></p>`;
      wireCopy(created);
      created.querySelector('.code-panel').focus();
      load();
    } catch (err) {
      formStatus.innerHTML = errorNotice(err.message);
      if (err.data?.clientId) {
        formStatus.insertAdjacentHTML('beforeend', `<p class="admin-next"><a href="#/clients/${encodeURIComponent(err.data.clientId)}">Open the existing client ${icon('arrowRight', 16, 2)}</a></p>`);
      }
    } finally {
      createBtn.disabled = false;
    }
  });

  load();
  return { element, navigate };
}

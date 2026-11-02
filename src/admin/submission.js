// One completed assessment: the page the completion email links to (#/submissions/{id}).
// Shows the person, both scores and each section, with the PDF download.
import config from '../content/config.json';
import { readinessBand, knowledgeBand } from '../scoring.js';
import { scoreRing } from '../components/scoreRing.js';
import { icon } from '../components/icons.js';
import { el, escapeHtml } from '../util.js';
import { api } from './api.js';
import { downloadReport } from './report.js';
import { chip, errorNotice, formatTimestamp } from './format.js';

function sectionRows(s) {
  const names = Object.fromEntries(s.bank.sections.map((x) => [x.id, x.name]));
  return `
    <table class="admin-table">
      <thead><tr><th scope="col">Lifecycle section</th><th scope="col">Knowledge</th><th scope="col">Readiness</th></tr></thead>
      <tbody>${s.sections
        .map(
          (r) => `
        <tr>
          <th scope="row">${escapeHtml(names[r.id] || `Section ${r.id}`)}</th>
          <td data-label="Knowledge">${r.total ? chip(`${r.correct} of ${r.total} correct`, knowledgeBand(Math.round((r.correct / r.total) * 100), config.knowledgeBands).tone) : '<span class="admin-muted">None asked</span>'}</td>
          <td data-label="Readiness">${r.readiness === null ? '<span class="admin-muted">None asked</span>' : chip(`${r.readiness}%`, readinessBand(r.readiness).tone)}</td>
        </tr>`
        )
        .join('')}</tbody>
    </table>`;
}

export function renderSubmission({ id }) {
  const element = el(`
    <div class="container-page admin-page">
      <p class="admin-back" data-back><a href="#/clients">${icon('arrowLeft', 16, 2)} All clients</a></p>
      <div class="title-block">
        <p class="eyebrow">Completed assessment</p>
        <h1 data-title>Loading</h1>
        <div data-summary></div>
      </div>
      <div data-body aria-busy="true"></div>
    </div>`);

  const body = element.querySelector('[data-body]');

  api
    .submission(id)
    .then(({ submission: s }) => {
      element.querySelector('[data-title]').textContent = `${s.name}, ${s.firmName}`;
      element.querySelector('[data-back]').innerHTML = `<a href="#/clients/${encodeURIComponent(s.clientId)}">${icon('arrowLeft', 16, 2)} ${escapeHtml(s.firmName)}</a>`;
      element.querySelector('[data-summary]').innerHTML = `
        <dl class="admin-facts">
          <div><dt>Role</dt><dd>${escapeHtml(s.role)}</dd></div>
          <div><dt>Work email</dt><dd>${escapeHtml(s.email)}</dd></div>
          <div><dt>Completed</dt><dd>${escapeHtml(formatTimestamp(s.completedAt))}</dd></div>
          <div><dt>Questions</dt><dd>${escapeHtml(s.irpVersion)}</dd></div>
        </dl>`;
      body.innerHTML = `
        <section class="card" aria-labelledby="scores-title">
          <h2 class="card-title" id="scores-title">Scores</h2>
          <div class="admin-scores">
            <div data-ring="readiness"></div>
            <div data-ring="knowledge"></div>
          </div>
          <div data-status></div>
          <div class="card-footer">
            <div class="card-footer-end">
              <button type="button" class="btn btn-primary" data-download>${icon('download', 18, 2)} Download the PDF report</button>
            </div>
          </div>
        </section>
        <section class="card" aria-labelledby="sections-title">
          <h2 class="card-title" id="sections-title">By section</h2>
          ${sectionRows(s)}
        </section>`;

      const rings = [
        ['readiness', s.readinessScore, readinessBand, 'Program Readiness'],
        ['knowledge', s.knowledgeScore, (v) => knowledgeBand(v, config.knowledgeBands), 'IRP Knowledge'],
      ];
      for (const [key, score, band, label] of rings) {
        const slot = body.querySelector(`[data-ring="${key}"]`);
        if (score === null) {
          slot.innerHTML = `<p class="admin-muted">${label}: not asked</p>`;
          continue;
        }
        const b = band(score);
        const figure = el(`<figure class="admin-score"><figcaption>${label}</figcaption>
          <span class="badge badge-${b.tone}"><span class="badge-dot" aria-hidden="true"></span>${escapeHtml(b.label)}</span></figure>`);
        figure.querySelector('figcaption').after(scoreRing({ score, band: b, label, size: 120 }));
        slot.replaceWith(figure);
      }

      const status = body.querySelector('[data-status]');
      const download = body.querySelector('[data-download]');
      download.addEventListener('click', async () => {
        status.innerHTML = '';
        download.disabled = true;
        try {
          await downloadReport(id);
        } catch (err) {
          status.innerHTML = errorNotice(err.message);
        } finally {
          download.disabled = false;
        }
      });
    })
    .catch((err) => {
      element.querySelector('[data-title]').textContent = 'Record not available';
      body.innerHTML = errorNotice(err.message);
    })
    .finally(() => body.removeAttribute('aria-busy'));

  return { element };
}

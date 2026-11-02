import config from '../content/config.json';
import { notificationsEnabled, prepareCheck, submitCompletion } from '../completion.js';
import { completionPayload } from '../payload.js';
import { buildResults } from '../scoring.js';
import { icon } from '../components/icons.js';
import { el } from '../util.js';

const REPORT_CONTENTS = [
  'Your name, role, firm and the date and time you finished',
  'Program Readiness and IRP Knowledge scores',
  'The crosswalk from your IRP to Reg S-P',
  'Every question, your answer and the IRP answer',
  'Findings and next steps',
];

// Shown before download. Must name every field completionPayload() sends (see tests/smoke.mjs).
export const DISCLOSURE =
  'When you download, AdvisorDefense receives your name, work email, role, your two scores, your score for each section and which questions you missed (by question ID, not your answers). Your answers and the report stay on your device.';

const SPINNER =
  '<svg class="spinner" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="13 44" stroke-linecap="round"/></svg>';

export function renderReport({ state, go }) {
  const element = el(`
    <div class="container-gate">
      <div class="title-block">
        <p class="eyebrow">Your report</p>
        <h1>Download your report</h1>
        <p class="lead">A dated PDF for the firm's compliance file. It is built on your device.</p>
      </div>
      <div class="gate-grid">
        <div class="card form-card">
          <div data-status tabindex="-1" data-focus-target></div>
          <p class="report-intro">Your report is ready. Download it, then give a copy to the Chief Compliance Officer for the firm's records.</p>
          ${
            notificationsEnabled()
              ? `<p class="privacy-row completion-notice">${icon('info', 16)}<span>${DISCLOSURE}</span></p>
          <div class="turnstile-slot" data-turnstile></div>`
              : ''
          }
          <div class="card-footer">
            <button type="button" class="btn btn-text" data-back>${icon('arrowLeft', 18, 2)} Back</button>
            <div class="card-footer-end">
              <button type="button" class="btn btn-primary" data-submit>${icon('download', 18, 2)} <span data-label>Download my report</span></button>
            </div>
          </div>
        </div>
        <aside class="card report-aside" aria-labelledby="aside-title">
          <div class="page-thumb" aria-hidden="true">
            <span class="thumb-band"></span>
            <span class="thumb-line w80"></span>
            <span class="thumb-line w60"></span>
            <span class="thumb-line thumb-line-warn w70"></span>
            <span class="thumb-line w50"></span>
            <span class="thumb-line w65"></span>
          </div>
          <h2 id="aside-title" class="aside-title">What's in the report</h2>
          <ul class="check-list">${REPORT_CONTENTS.map((c) => `<li>${icon('check', 16, 2.25)}<span>${c}</span></li>`).join('')}</ul>
          <p class="aside-foot">${icon('lock', 16)}<span>PDF generated on your device</span></p>
        </aside>
      </div>
    </div>`);

  const submitBtn = element.querySelector('[data-submit]');
  const label = submitBtn.querySelector('[data-label]');
  const status = element.querySelector('[data-status]');
  // Bot check for the notification. Renders nothing unless Cloudflare needs the person to interact.
  const check = notificationsEnabled() ? prepareCheck(element.querySelector('[data-turnstile]')) : null;

  // Notifies AdvisorDefense once per visit. Runs alongside the PDF and never blocks it.
  function notifyOnce(results) {
    if (state.notified) return;
    state.notified = true;
    submitCompletion(completionPayload(state.details, results), check);
  }

  async function download() {
    const results = buildResults({ bank: state.bank, answers: state.answers }, config.knowledgeBands);
    notifyOnce(results);
    // jsPDF is loaded only when needed to keep the first page light.
    const { generateReport } = await import('../pdf.js');
    await generateReport(state, results);
    state.reportDownloaded = true;
  }

  async function submit() {
    submitBtn.style.minWidth = `${submitBtn.offsetWidth}px`;
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    submitBtn.querySelector('.icon').outerHTML = SPINNER;
    label.textContent = 'Preparing your report';
    await download();
    showSuccess();
  }

  function showSuccess() {
    element.querySelector('.card-footer-end').remove();
    status.innerHTML = `
      <div class="notice notice-success" role="status">
        <span class="notice-disc">${icon('check', 14, 2.5)}</span>
        <div>
          <p class="notice-title">Report downloaded</p>
          <p>Check your downloads folder. Questions? Contact AdvisorDefense at <a href="mailto:${config.email}">${config.email}</a>.</p>
          <div class="notice-actions">
            <button type="button" class="btn btn-secondary" data-again>${icon('download', 18, 2)} Download again</button>
          </div>
        </div>
      </div>`;
    status.querySelector('[data-again]').addEventListener('click', download);
    status.focus();
  }

  submitBtn.addEventListener('click', submit, { once: true });
  element.querySelector('[data-back]').addEventListener('click', () => go('results'));

  return { element };
}

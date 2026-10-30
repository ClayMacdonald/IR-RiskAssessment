import config from '../content/config.json';
import { leadNotificationsEnabled, prepareLeadCheck, submitLead } from '../lead.js';
import { buildResults } from '../scoring.js';
import { icon } from '../components/icons.js';
import { el, escapeHtml } from '../util.js';

const ROLES = ['CCO', 'Owner or Principal', 'Operations', 'Other'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REPORT_CONTENTS = [
  'Your overall score and band',
  'Score by section',
  'Every question and your answer',
  'Likely exam findings',
  'Next steps to close each gap',
];

const SPINNER =
  '<svg class="spinner" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="13 44" stroke-linecap="round"/></svg>';

export function renderGate({ state, go }) {
  const lead = state.lead;
  const name = lead.name || state.details.name;
  const roleOptions = ['<option value="">Select one</option>']
    .concat(ROLES.map((r) => `<option${r === lead.role ? ' selected' : ''}>${escapeHtml(r)}</option>`))
    .join('');

  const element = el(`
    <div class="container-gate">
      <div class="title-block">
        <p class="eyebrow">Full report</p>
        <h1>Get your full report</h1>
        <p class="lead">Your PDF includes every question, the finding an examiner would likely write, and the next steps to close each gap.</p>
      </div>
      <div class="gate-grid">
        <form class="card form-card" novalidate>
          <div data-status tabindex="-1" data-focus-target></div>
          <div class="field">
            <label for="leadName">Your name</label>
            <input id="leadName" name="leadName" type="text" autocomplete="name" required value="${escapeHtml(name)}">
          </div>
          <div class="field">
            <label for="email">Work email</label>
            <input id="email" name="email" type="email" autocomplete="email" required value="${escapeHtml(lead.email)}">
            <p class="field-error" id="email-error" hidden>${icon('alert', 16)}<span>Enter a valid work email address.</span></p>
          </div>
          <div class="field">
            <label for="role">Your role</label>
            <select id="role" name="role" required>${roleOptions}</select>
          </div>
          ${
            leadNotificationsEnabled()
              ? `<p class="privacy-row lead-notice">${icon('info', 16)}<span>When you download, your name, work email, role, firm name and score are sent to AdvisorDefense so we can follow up. Your answers stay on your device.</span></p>
          <div class="turnstile-slot" data-turnstile></div>`
              : ''
          }
          <div class="card-footer">
            <button type="button" class="btn btn-text" data-back>${icon('arrowLeft', 18, 2)} Back</button>
            <div class="card-footer-end">
              <span class="disabled-hint" id="gate-hint">Complete all fields to download</span>
              <button type="button" class="btn btn-primary" data-submit disabled aria-describedby="gate-hint">${icon('download', 18, 2)} <span data-label>Download my report</span></button>
            </div>
          </div>
        </form>
        <aside class="card report-aside" aria-labelledby="aside-title">
          <div class="page-thumb" aria-hidden="true">
            <span class="thumb-band"></span>
            <span class="thumb-line w80"></span>
            <span class="thumb-line w60"></span>
            <span class="thumb-line thumb-line-warn w70"></span>
            <span class="thumb-line w50"></span>
            <span class="thumb-line w65"></span>
          </div>
          <h3 id="aside-title">What's in the report</h3>
          <ul class="check-list">${REPORT_CONTENTS.map((c) => `<li>${icon('check', 16, 2.25)}<span>${c}</span></li>`).join('')}</ul>
          <p class="aside-foot">${icon('lock', 16)}<span>PDF generated on your device</span></p>
        </aside>
      </div>
    </div>`);

  const form = element.querySelector('form');
  const submitBtn = element.querySelector('[data-submit]');
  const label = submitBtn.querySelector('[data-label]');
  const hint = element.querySelector('#gate-hint');
  const emailError = element.querySelector('#email-error');
  const status = element.querySelector('[data-status]');
  let downloaded = false;
  // Bot check for the lead notification. Renders nothing unless Cloudflare needs the visitor to interact.
  const leadCheck = leadNotificationsEnabled() ? prepareLeadCheck(element.querySelector('[data-turnstile]')) : null;

  function read() {
    return { name: form.leadName.value.trim(), email: form.email.value.trim(), role: form.role.value };
  }

  function update() {
    const v = read();
    state.lead = v;
    submitBtn.disabled = !(v.name && EMAIL_RE.test(v.email) && v.role);
    hint.hidden = !submitBtn.disabled;
  }

  function showEmailError(show) {
    emailError.hidden = !show;
    form.email.setAttribute('aria-invalid', String(show));
    if (show) form.email.setAttribute('aria-describedby', 'email-error');
    else form.email.removeAttribute('aria-describedby');
  }

  form.email.addEventListener('blur', () => {
    const v = form.email.value.trim();
    showEmailError(v !== '' && !EMAIL_RE.test(v));
  });
  form.email.addEventListener('input', () => showEmailError(false));

  // Notifies AdvisorDefense once per visit. Runs alongside the PDF and never blocks it.
  function notifyOnce(results) {
    if (state.leadNotified) return;
    state.leadNotified = true;
    submitLead({ ...state.lead, firmName: state.details.firmName, score: results.score }, leadCheck);
  }

  async function download() {
    const results = buildResults(state);
    notifyOnce(results);
    // jsPDF is loaded only when needed to keep the first page light.
    const { generateReport } = await import('../pdf.js');
    await generateReport(state, results);
    state.reportDownloaded = true;
  }

  async function submit() {
    update();
    if (submitBtn.disabled) return;
    submitBtn.style.minWidth = `${submitBtn.offsetWidth}px`;
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    submitBtn.querySelector('.icon').outerHTML = SPINNER;
    label.textContent = 'Preparing your report';
    await download();
    downloaded = true;
    showSuccess();
  }

  function showSuccess() {
    element.querySelector('.card-footer-end').remove();
    status.innerHTML = `
      <div class="notice notice-success" role="status">
        <span class="notice-disc">${icon('check', 14, 2.5)}</span>
        <div>
          <p class="notice-title">Report downloaded</p>
          <p>Your report has been downloaded. Check your downloads folder.</p>
          <div class="notice-actions">
            <a class="btn btn-primary" href="${config.bookingUrl}" target="_blank" rel="noopener noreferrer">${icon('calendar', 18)} Book a 30-minute review</a>
            <button type="button" class="btn btn-secondary" data-again>${icon('download', 18, 2)} Download again</button>
          </div>
        </div>
      </div>`;
    status.querySelector('[data-again]').addEventListener('click', download);
    status.focus();
  }

  form.addEventListener('input', () => !downloaded && update());
  form.addEventListener('change', () => !downloaded && update());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!downloaded) submit();
  });
  submitBtn.addEventListener('click', submit);
  element.querySelector('[data-back]').addEventListener('click', () => go('results'));
  update();

  return { element };
}

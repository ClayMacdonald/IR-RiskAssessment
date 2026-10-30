import { ROLES, audienceFor } from '../roles.js';
import { questionsFor } from '../scoring.js';
import { icon } from '../components/icons.js';
import { el, escapeHtml } from '../util.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function roleOptions(value) {
  return ['<option value="">Select one</option>']
    .concat(ROLES.map((r) => `<option${r.label === value ? ' selected' : ''}>${escapeHtml(r.label)}</option>`))
    .join('');
}

export function renderDetails({ state, go }) {
  const d = state.details;
  const csirtCount = questionsFor(state.bank, 'CSIRT Lead').length;
  const staffCount = questionsFor(state.bank, 'Staff (Supervised Person)').length;

  const element = el(`
    <div class="container">
      <div class="title-block">
        <p class="eyebrow">Step 1 of 3</p>
        <h1>About you</h1>
        <p class="lead">Your report is a dated training and readiness record, so it shows your name, role and firm.</p>
      </div>
      <form class="card form-card" novalidate>
        <div class="field-grid">
          <div class="field">
            <label for="name">Your name</label>
            <input id="name" name="name" type="text" autocomplete="name" maxlength="100" required value="${escapeHtml(d.name)}">
          </div>
          <div class="field">
            <label for="email">Work email</label>
            <input id="email" name="email" type="email" autocomplete="email" maxlength="254" required value="${escapeHtml(d.email)}">
            <p class="field-error" id="email-error" hidden>${icon('alert', 16)}<span>Enter a valid work email address.</span></p>
          </div>
          <div class="field field-full">
            <label for="firmName">Firm name</label>
            <input id="firmName" name="firmName" type="text" autocomplete="organization" maxlength="150" required value="${escapeHtml(d.firmName)}">
          </div>
          <div class="field field-full">
            <label for="role">Your role</label>
            <select id="role" name="role" required aria-describedby="role-hint">${roleOptions(d.role)}</select>
            <p class="field-hint" id="role-hint">CSIRT members and firm leadership answer ${csirtCount} questions (about 20 minutes). Staff answer ${staffCount} (about 8 minutes).</p>
          </div>
        </div>
        <p class="privacy-row">${icon('lock', 16)}<span>Your answers stay on this device. Before you download your report, the next screens show exactly what is sent to AdvisorDefense.</span></p>
        <div class="card-footer">
          <button type="button" class="btn btn-text" data-back>${icon('arrowLeft', 18, 2)} Back</button>
          <div class="card-footer-end">
            <span class="disabled-hint" id="details-hint">Complete all four fields to continue</span>
            <button type="button" class="btn btn-primary" data-next disabled aria-describedby="details-hint">Continue ${icon('arrowRight', 18, 2)}</button>
          </div>
        </div>
      </form>
    </div>`);

  const form = element.querySelector('form');
  const next = element.querySelector('[data-next]');
  const hint = element.querySelector('#details-hint');
  const emailError = element.querySelector('#email-error');

  function read() {
    return {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      firmName: form.firmName.value.trim(),
      role: form.role.value,
    };
  }

  function update() {
    const v = read();
    next.disabled = !(v.name && EMAIL_RE.test(v.email) && v.firmName && audienceFor(v.role));
    hint.hidden = !next.disabled;
    state.details = v;
  }

  function showEmailError(show) {
    emailError.hidden = !show;
    form.email.setAttribute('aria-invalid', String(show));
    if (show) form.email.setAttribute('aria-describedby', 'email-error');
    else form.email.removeAttribute('aria-describedby');
  }

  function submit() {
    update();
    if (!next.disabled) go('question', { questionIndex: 0 });
  }

  form.email.addEventListener('blur', () => {
    const v = form.email.value.trim();
    showEmailError(v !== '' && !EMAIL_RE.test(v));
  });
  form.email.addEventListener('input', () => showEmailError(false));
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      submit();
    }
  });
  next.addEventListener('click', submit);
  element.querySelector('[data-back]').addEventListener('click', () => go('intro'));
  update();

  return { element };
}

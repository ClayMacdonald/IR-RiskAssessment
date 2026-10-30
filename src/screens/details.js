import { AUM_OPTIONS, EXAM_OPTIONS } from '../scoring.js';
import { icon } from '../components/icons.js';
import { el, escapeHtml } from '../util.js';

function selectOptions(options, value) {
  return ['<option value="">Select one</option>']
    .concat(options.map((o) => `<option${o === value ? ' selected' : ''}>${escapeHtml(o)}</option>`))
    .join('');
}

export function renderDetails({ state, go }) {
  const d = state.details;
  const element = el(`
    <div class="container">
      <div class="title-block">
        <p class="eyebrow">Step 1 of 3</p>
        <h1>A few details before we begin</h1>
        <p class="lead">We use these to tailor your results to your firm's compliance date.</p>
      </div>
      <form class="card form-card" novalidate>
        <div class="field-grid">
          <div class="field">
            <label for="firmName">Firm name</label>
            <input id="firmName" name="firmName" type="text" autocomplete="organization" required value="${escapeHtml(d.firmName)}">
          </div>
          <div class="field">
            <label for="name">Your name</label>
            <input id="name" name="name" type="text" autocomplete="name" required value="${escapeHtml(d.name)}">
          </div>
          <div class="field field-full">
            <label for="aum">Regulatory AUM</label>
            <select id="aum" name="aum" required>${selectOptions(AUM_OPTIONS, d.aum)}</select>
          </div>
          <div class="field field-full">
            <label for="examined">Has your firm been examined by the SEC since your Reg S-P compliance date?</label>
            <select id="examined" name="examined" required>${selectOptions(EXAM_OPTIONS, d.examined)}</select>
          </div>
        </div>
        <p class="privacy-row">${icon('lock', 16)}<span>Nothing is sent or stored unless you request the full report at the end.</span></p>
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

  function read() {
    return {
      firmName: form.firmName.value.trim(),
      name: form.name.value.trim(),
      aum: form.aum.value,
      examined: form.examined.value,
    };
  }

  function update() {
    const values = read();
    next.disabled = !Object.values(values).every(Boolean);
    hint.hidden = !next.disabled;
    state.details = values;
  }

  function submit() {
    update();
    if (!next.disabled) go('question', { questionIndex: 0 });
  }

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
  element.querySelector('[data-back]').addEventListener('click', () => go('landing'));
  update();

  return { element };
}

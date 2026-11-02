import { icon } from '../components/icons.js';
import { el, escapeHtml } from '../util.js';

// Three real rows from the bank show how an IRP section answers a Reg S-P requirement.
const TIE_EXAMPLES = [2, 4, 6];

export function renderIntro({ state, go }) {
  const { bank, details } = state;
  const ties = bank.sections
    .filter((s) => TIE_EXAMPLES.includes(s.id))
    .map(
      (s) => `
        <li class="tie-row">
          <span class="tie-label">${escapeHtml(s.name)}</span>
          <span class="tie-irp">Your IRP: ${escapeHtml(s.irp_sections)}</span>
          <span class="tie-rule">Reg S-P: ${escapeHtml(s.regsp_requirement)}</span>
        </li>`
    )
    .join('');

  const element = el(`
    <div class="landing">
      <section class="hero" aria-labelledby="hero-title">
        <div class="container-page hero-grid">
          <div class="hero-copy">
            <span class="hero-rule" aria-hidden="true"></span>
            ${details.firmName ? `<p class="eyebrow">Prepared for ${escapeHtml(details.firmName)}</p>` : ''}
            <h1 id="hero-title" class="display">IRP and Reg S-P Readiness</h1>
            <p class="lead hero-lead">Check that your CSIRT knows what your Incident Response Plan says, and see how each part of the plan meets amended Regulation S-P.</p>
            <div class="hero-actions">
              <button type="button" class="btn btn-accent btn-lg" data-start>Start the assessment ${icon('arrowRight', 18, 2)}</button>
            </div>
            <ul class="hero-stats">
              <li class="stat"><span class="stat-value num">${bank.questions.length}</span><span class="stat-label">Questions</span></li>
              <li class="stat"><span class="stat-value num stat-accent">${bank.sections.length}</span><span class="stat-label">Sections</span></li>
              <li class="stat"><span class="stat-value num">10<span class="stat-unit"> min</span></span><span class="stat-label">Approximate time</span></li>
            </ul>
            <ul class="trust-strip">
              <li>${icon('lock', 18)} Shared only with AdvisorDefense</li>
              <li>${icon('document', 18)} PDF made on your device</li>
              <li>${icon('shield', 18)} Written against ${escapeHtml(bank.irpVersion)}</li>
            </ul>
          </div>
          <div class="hero-preview">
            <div class="preview-card tie-card">
              <h2 class="tie-title">How your IRP meets Reg S-P</h2>
              <ul class="tie-list">${ties}</ul>
              <p class="tie-foot">Every question shows the IRP section it tests and the rule it supports.</p>
            </div>
          </div>
        </div>
      </section>
    </div>`);

  element.querySelector('[data-start]').addEventListener('click', () => go('details'));
  return { element };
}

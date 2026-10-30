import facts from '../content/facts.json';
import { QUESTIONS, SECTIONS, band } from '../scoring.js';
import { icon } from '../components/icons.js';
import { el, escapeHtml } from '../util.js';

const FACT_ICONS = ['calendar', 'search', 'document'];

// Illustrative values for the static preview card. Clearly labeled as a sample.
const SAMPLE = { firm: 'Example Wealth Partners', score: 72, sections: [83, 67, 50, 100] };

function previewCard() {
  const b = band(SAMPLE.score);
  const rows = SECTIONS.map((s, i) => {
    const pct = SAMPLE.sections[i];
    return `
      <div class="preview-row">
        <div class="preview-row-top"><span>${escapeHtml(s.name)}</span><span class="num">${pct}%</span></div>
        <div class="bar-track bar-track-thin"><div class="bar-fill bar-${band(pct).tone}" data-pct="${pct}"></div></div>
      </div>`;
  }).join('');

  return `
    <div class="preview-card" aria-hidden="true">
      <div class="preview-top">
        <span class="preview-label">Sample results</span>
        <span class="chip chip-neutral">Example</span>
      </div>
      <p class="preview-firm">${SAMPLE.firm}</p>
      <div class="preview-score">
        <div class="preview-ring">
          <svg viewBox="0 0 160 160" focusable="false">
            <circle class="ring-track" cx="80" cy="80" r="68" fill="none" stroke-width="14"/>
            <circle class="ring-value ring-${b.tone}" data-ring="${SAMPLE.score}" cx="80" cy="80" r="68" fill="none" stroke-width="14" stroke-linecap="round" transform="rotate(-90 80 80)"/>
          </svg>
          <span class="preview-ring-number num">${SAMPLE.score}</span>
        </div>
        <span class="chip chip-${b.tone}">${b.label}</span>
      </div>
      <div class="preview-rows">${rows}</div>
      <div class="preview-foot">
        <p>What an examiner would likely note</p>
        <span class="skeleton"></span>
        <span class="skeleton skeleton-short"></span>
      </div>
    </div>`;
}

export function renderLanding({ go }) {
  const cards = facts.facts
    .map(
      (f, i) => `
      <article class="fact-card">
        <span class="fact-icon">${icon(FACT_ICONS[i % FACT_ICONS.length], 20)}</span>
        <h3>${escapeHtml(f.title)}</h3>
        <p>${escapeHtml(f.body)}</p>
      </article>`
    )
    .join('');

  const element = el(`
    <div class="landing">
      <section class="hero" aria-labelledby="hero-title">
        <div class="container-page hero-grid">
          <div class="hero-copy">
            <span class="hero-rule" aria-hidden="true"></span>
            <h1 id="hero-title" class="display"><span class="nowrap">Reg S-P</span> <span class="nowrap">Readiness Score</span></h1>
            <p class="lead hero-lead">The SEC's amendments to Regulation S-P are in force, and examiners are testing for them. See how your firm would score, in the language of an exam.</p>
            <div class="hero-actions">
              <button type="button" class="btn btn-accent btn-lg" data-start>Start the assessment ${icon('arrowRight', 18, 2)}</button>
            </div>
            <ul class="hero-stats">
              <li class="stat"><span class="stat-value num">${QUESTIONS.length}</span><span class="stat-label">Questions</span></li>
              <li class="stat"><span class="stat-value num stat-accent">${SECTIONS.length}</span><span class="stat-label">Sections</span></li>
              <li class="stat"><span class="stat-value num">10<span class="stat-unit"> min</span></span><span class="stat-label">Approximate time</span></li>
            </ul>
            <ul class="trust-strip">
              <li>${icon('shield', 18)} Built for RIAs</li>
              <li>${icon('lock', 18)} Your answers stay in your browser</li>
              <li>${icon('check', 18)} No account required</li>
            </ul>
          </div>
          <div class="hero-preview">${previewCard()}</div>
        </div>
      </section>
      <section class="facts" aria-labelledby="facts-title">
        <div class="container-page">
          <h2 id="facts-title" class="eyebrow facts-eyebrow">Why it matters now</h2>
          <div class="fact-grid">${cards}</div>
        </div>
      </section>
    </div>`);

  element.querySelectorAll('.bar-fill').forEach((b) => (b.style.width = `${b.dataset.pct}%`));
  const ring = element.querySelector('[data-ring]');
  const c = 2 * Math.PI * 68;
  ring.style.strokeDasharray = String(c);
  ring.style.strokeDashoffset = String(c * (1 - Number(ring.dataset.ring) / 100));
  element.querySelector('[data-start]').addEventListener('click', () => go('details'));
  return { element };
}

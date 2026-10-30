import config from '../content/config.json';
import { band, buildResults, examinedRecently } from '../scoring.js';
import { scoreRing } from '../components/scoreRing.js';
import { icon } from '../components/icons.js';
import { el, escapeHtml } from '../util.js';

const SECTION_STATUS = { success: 'Exam-ready', warning: 'Gaps noted', danger: 'High exposure' };

export function renderResults({ state, go }) {
  const r = buildResults(state);

  const rows = r.sections
    .map((s) => {
      const tone = band(s.percent).tone;
      return `
      <div class="section-row">
        <div class="section-row-top">
          <span class="section-row-name">${escapeHtml(s.name)}</span>
          <span class="section-row-pct num">${s.percent}%</span>
        </div>
        <div class="bar-track" role="img" aria-label="${escapeHtml(s.name)}: ${s.percent} percent, ${SECTION_STATUS[tone]}">
          <div class="bar-fill bar-${tone}" data-pct="${s.percent}"></div>
        </div>
        <p class="section-row-status status-${tone}" aria-hidden="true"><span class="status-dot"></span>${SECTION_STATUS[tone]}</p>
      </div>`;
    })
    .join('');

  // Finding titles are always visible. The wording and service stay blurred until the report is downloaded.
  const locked = !state.reportDownloaded;
  const findingBody = (q) => {
    const body = `
            <p class="finding-text">${escapeHtml(q.exam_finding)}</p>
            <p class="finding-service">Related service: <strong>${escapeHtml(q.mapped_service)}</strong></p>`;
    return locked
      ? `<div class="finding-locked" aria-hidden="true">${body}</div><p class="sr-only">Finding details are included in the full report.</p>`
      : body;
  };
  const n = r.findings.length;

  const findings = n
    ? `<div class="findings-wrap${locked ? ' is-locked' : ''}">
        <ol class="finding-list">${r.findings
          .map(
            (q, i) => `
          <li class="finding">
            <span class="finding-num num" aria-hidden="true">${i + 1}</span>
            <div>
              <h3>${escapeHtml(q.title)}</h3>${findingBody(q)}
            </div>
          </li>`
          )
          .join('')}</ol>
        ${
          locked
            ? `<div class="lock-card">
          <span class="lock-icon">${icon('lock', 22)}</span>
          <h3>${n} ${n === 1 ? 'finding' : 'findings'} locked</h3>
          <p>Download the full report to see how an examiner would likely word each finding and the related next step.</p>
          <button type="button" class="btn btn-primary" data-unlock>Get the full report ${icon('arrowRight', 18, 2)}</button>
        </div>`
            : ''
        }
      </div>`
    : `<div class="notice notice-success"><span class="notice-disc">${icon('check', 14, 2.5)}</span><div><p>Based on your answers, an examiner would not likely note gaps in these areas. Keep the evidence current.</p></div></div>`;

  const examNote = examinedRecently(state.details.examined)
    ? `<div class="callout callout-info callout-exam">${icon('document', 20)}<p>Compare these findings against any deficiency letter or document request you received.</p></div>`
    : '';

  const element = el(`
    <div class="container-results">
      <div class="title-block">
        <p class="eyebrow">Step 3 of 3</p>
        <h1 class="results-title">${escapeHtml(state.details.firmName)}: Reg S-P Readiness Score</h1>
        <p class="results-meta">${icon('calendar', 16)}<span>Your firm's compliance date was ${r.complianceDate}.</span></p>
      </div>

      <section class="card score-card" aria-label="Score summary">
        <div class="score-main">
          <div data-ring></div>
          <span class="badge badge-${r.band.tone}"><span class="badge-dot" aria-hidden="true"></span>${r.band.label}</span>
        </div>
        <div class="score-sections">
          <h2 class="card-title">Score by section</h2>
          <div class="section-rows">${rows}</div>
        </div>
      </section>

      <section class="card findings-card" aria-labelledby="findings-title">
        <div class="card-head">
          <h2 class="card-title" id="findings-title">What an examiner would likely note</h2>
          ${r.findings.length ? `<span class="chip chip-neutral">Top ${r.findings.length}</span>` : ''}
        </div>
        ${findings}
        ${examNote}
      </section>

      <section class="cta-panel" aria-labelledby="cta-title">
        <div>
          <h2 id="cta-title">Your full report</h2>
          <ul class="cta-list">
            <li>${icon('check', 16, 2.25)} Every question and your answer</li>
            <li>${icon('check', 16, 2.25)} The full wording of each finding</li>
            <li>${icon('check', 16, 2.25)} Next steps to close each gap</li>
          </ul>
        </div>
        <div class="cta-actions">
          <button type="button" class="btn btn-accent btn-lg" data-report>Get the full report ${icon('arrowRight', 18, 2)}</button>
          <a class="btn btn-on-dark-secondary btn-lg" href="${config.bookingUrl}" target="_blank" rel="noopener noreferrer">${icon('calendar', 18)} Book a 30-minute review</a>
        </div>
      </section>

      <div class="results-bottom">
        <button type="button" class="btn btn-text" data-back>${icon('arrowLeft', 18, 2)} Back</button>
        <p class="disclaimer">${config.disclaimer}</p>
      </div>
    </div>`);

  element.querySelector('[data-ring]').replaceWith(scoreRing({ score: r.score, band: r.band }));

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bars = element.querySelectorAll('.bar-fill');
  if (reduced) bars.forEach((b) => (b.style.width = `${b.dataset.pct}%`));
  else
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        bars.forEach((b, i) => {
          b.style.transitionDelay = `${i * 60}ms`;
          b.style.width = `${b.dataset.pct}%`;
        })
      )
    );

  element.querySelector('[data-report]').addEventListener('click', () => go('gate'));
  element.querySelector('[data-unlock]')?.addEventListener('click', () => go('gate'));
  element
    .querySelector('[data-back]')
    .addEventListener('click', () => go('question', { questionIndex: state.questionIndex }));

  return { element };
}

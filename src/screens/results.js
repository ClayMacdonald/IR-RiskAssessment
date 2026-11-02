import config from '../content/config.json';
import { buildResults, readinessBand, knowledgeBand, correctIndex } from '../scoring.js';
import { scoreRing } from '../components/scoreRing.js';
import { icon } from '../components/icons.js';
import { el, escapeHtml, formatWhen } from '../util.js';
import { shortRule } from './question.js';

const TOP_GAPS = 5;

function scoreBlock(id, title, result, note) {
  return `
    <section class="card score-panel" aria-labelledby="${id}">
      <h2 class="card-title" id="${id}">${title}</h2>
      <div class="score-main">
        <div data-ring="${id}"></div>
        <span class="badge badge-${result.band.tone}"><span class="badge-dot" aria-hidden="true"></span>${escapeHtml(result.band.label)}</span>
      </div>
      <p class="score-note">${note}</p>
    </section>`;
}

function crosswalkRows(rows, showReadiness) {
  return rows
    .map((r) => {
      // A section can be knowledge-only or readiness-only. Show a chip for each kind it has.
      const knowledge = r.knowledge
        ? `<span class="chip chip-${knowledgeBand(Math.round((r.knowledge.correct / r.knowledge.total) * 100), config.knowledgeBands).tone}">${r.knowledge.correct} of ${r.knowledge.total} correct</span>`
        : '';
      const readiness = r.readiness
        ? `<span class="chip chip-${readinessBand(r.readiness.percent).tone}">${r.readiness.percent}% readiness</span>`
        : '';
      return `
        <tr>
          <th scope="row">${escapeHtml(r.name)}</th>
          <td data-label="Your IRP">${escapeHtml(r.irp_sections)}</td>
          <td data-label="Reg S-P requirement">${escapeHtml(r.regsp_requirement)}</td>
          <td data-label="Your result" class="xw-result">${knowledge}${showReadiness ? readiness : ''}</td>
        </tr>`;
    })
    .join('');
}

function refs(q) {
  return `
    <dl class="finding-refs">
      <div><dt>Your IRP</dt><dd>${escapeHtml(q.irp_ref)}</dd></div>
      <div><dt>Reg S-P</dt><dd>${escapeHtml(shortRule(q.regsp_ref))}</dd></div>
    </dl>`;
}

function gapItems(gaps, answers) {
  return gaps
    .map(
      ({ q }, i) => `
      <li class="finding">
        <span class="finding-num num" aria-hidden="true">${i + 1}</span>
        <div>
          <h4>${escapeHtml(q.title)}</h4>
          <p class="finding-answer">Your answer: ${escapeHtml(q.options[answers[q.id]]?.label ?? 'Not answered')}</p>
          <p class="finding-text">${escapeHtml(q.exam_finding)}</p>
          ${refs(q)}
        </div>
      </li>`
    )
    .join('');
}

function missedGroups(groups, answers) {
  return groups
    .map(
      (g) => `
      <div class="missed-group">
        <h4 class="missed-section">${escapeHtml(g.section.name)}</h4>
        <ul class="finding-list">${g.questions
          .map(
            (q) => `
          <li class="finding finding-missed">
            <span class="finding-num" aria-hidden="true">${icon('info', 16, 2)}</span>
            <div>
              <h5>${escapeHtml(q.title)}</h5>
              <p class="finding-q">${escapeHtml(q.question)}</p>
              <p class="finding-answer">Your answer: ${escapeHtml(q.options[answers[q.id]]?.label ?? 'Not answered')}</p>
              <p class="finding-correct"><strong>IRP answer:</strong> ${escapeHtml(q.options[correctIndex(q)].label)}</p>
              <p class="finding-text">${escapeHtml(q.explanation)}</p>
              ${refs(q)}
            </div>
          </li>`
          )
          .join('')}</ul>
      </div>`
    )
    .join('');
}

export function renderResults({ state, go }) {
  const { details, answers } = state;
  const r = buildResults({ bank: state.bank, answers }, config.knowledgeBands);
  const showReadiness = Boolean(r.readiness);

  const knowledgeNote = `${r.knowledge.correct} of ${r.knowledge.total} questions answered the way your IRP says.`;
  const readinessNote = 'How an examiner would likely see the firm\'s program, from your answers.';

  const gaps = r.gaps.slice(0, TOP_GAPS);
  const gapsHtml = showReadiness
    ? `<h3 class="findings-sub">Program readiness gaps</h3>
       ${gaps.length ? `<ol class="finding-list">${gapItems(gaps, answers)}</ol>` : '<p class="findings-empty">No readiness gaps from your answers. Keep the evidence current.</p>'}`
    : '';
  const missedHtml = `<h3 class="findings-sub">Knowledge to review</h3>
    ${r.missed.length ? missedGroups(r.missedBySection, answers) : '<p class="findings-empty">You answered every knowledge question the way your IRP says.</p>'}`;

  const element = el(`
    <div class="container-results">
      <div class="title-block">
        <p class="eyebrow">Step 3 of 3</p>
        <h1 class="results-title">${escapeHtml(details.firmName)}: IRP and Reg S-P readiness</h1>
        <p class="results-meta">${icon('calendar', 16)}<span>${escapeHtml(details.name)}, ${escapeHtml(details.role)}. Completed ${escapeHtml(formatWhen(state.completedAt))}.</span></p>
        <p class="results-meta">${icon('document', 16)}<span>Questions written against ${escapeHtml(state.bank.irpVersion)}.</span></p>
      </div>

      <div class="score-pair${showReadiness ? '' : ' score-pair-single'}">
        ${showReadiness ? scoreBlock('readiness-title', 'Program Readiness', r.readiness, readinessNote) : ''}
        ${scoreBlock('knowledge-title', 'IRP Knowledge', r.knowledge, knowledgeNote)}
      </div>

      <section class="card crosswalk-card" aria-labelledby="xw-title">
        <h2 class="card-title" id="xw-title">How your IRP meets Reg S-P</h2>
        <p class="card-intro">Each part of the incident response lifecycle, the IRP sections that cover it, the Reg S-P requirement those sections satisfy, and your result.</p>
        <table class="crosswalk">
          <thead><tr><th scope="col">Lifecycle section</th><th scope="col">Your IRP</th><th scope="col">Reg S-P requirement</th><th scope="col">Your result</th></tr></thead>
          <tbody>${crosswalkRows(r.crosswalk, showReadiness)}</tbody>
        </table>
      </section>

      <section class="card findings-card" aria-labelledby="findings-title">
        <h2 class="card-title" id="findings-title">What to work on</h2>
        ${gapsHtml}
        ${missedHtml}
      </section>

      <section class="cta-panel" aria-labelledby="cta-title">
        <div>
          <h2 id="cta-title">Your report</h2>
          <ul class="cta-list">
            <li>${icon('check', 16, 2.25)} Both scores and the crosswalk</li>
            <li>${icon('check', 16, 2.25)} Every question, your answer and the IRP answer</li>
            <li>${icon('check', 16, 2.25)} A dated record for the firm's compliance file</li>
          </ul>
        </div>
        <div class="cta-actions">
          <button type="button" class="btn btn-accent btn-lg" data-report>Get the PDF report ${icon('arrowRight', 18, 2)}</button>
        </div>
      </section>

      <div class="results-bottom">
        <button type="button" class="btn btn-text" data-back>${icon('arrowLeft', 18, 2)} Back</button>
        <p class="disclaimer">${escapeHtml(config.disclaimer)}</p>
      </div>
    </div>`);

  if (showReadiness) {
    element.querySelector('[data-ring="readiness-title"]').replaceWith(
      scoreRing({ score: r.readiness.score, band: r.readiness.band, label: 'Program Readiness' })
    );
  }
  element.querySelector('[data-ring="knowledge-title"]').replaceWith(
    scoreRing({ score: r.knowledge.score, band: r.knowledge.band, label: 'IRP Knowledge' })
  );

  element.querySelector('[data-report]').addEventListener('click', () => go('report'));
  element.querySelector('[data-back]').addEventListener('click', () => go('question', { questionIndex: r.questions.length - 1 }));

  return { element };
}

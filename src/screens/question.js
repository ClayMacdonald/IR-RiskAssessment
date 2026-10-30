import { QUESTIONS, SECTIONS } from '../scoring.js';
import { optionCards } from '../components/optionCards.js';
import { icon } from '../components/icons.js';
import { el, escapeHtml } from '../util.js';

export function renderQuestion({ state, go }) {
  const index = state.questionIndex;
  const q = QUESTIONS[index];
  const total = QUESTIONS.length;
  const isLast = index === total - 1;

  const sectionPos = SECTIONS.findIndex((s) => s.id === q.section);
  const section = SECTIONS[sectionPos];
  const inSection = QUESTIONS.filter((x) => x.section === q.section);
  const posInSection = inSection.indexOf(q) + 1;

  // One segment per section, sized by its question count. Each segment shows answered and current questions.
  const segments = SECTIONS.map((s) => {
    const qs = QUESTIONS.filter((x) => x.section === s.id);
    const ticks = qs
      .map((x) => {
        const i = QUESTIONS.indexOf(x);
        const cls = i === index ? 'is-current' : state.answers[x.id] != null ? 'is-done' : '';
        return `<span class="seg-tick ${cls}"></span>`;
      })
      .join('');
    return `<span class="seg seg-${qs.length}">${ticks}</span>`;
  }).join('');

  const element = el(`
    <div class="container">
      <div class="q-progress">
        <div class="q-progress-top">
          <span class="q-counter num">Question ${index + 1} of ${total}</span>
          <span class="q-percent num" data-percent></span>
        </div>
        <div class="seg-bar" role="progressbar" aria-label="Assessment progress" aria-valuemin="0" aria-valuemax="100">${segments}</div>
      </div>
      <div class="section-heading">
        <p class="eyebrow">Section ${sectionPos + 1} of ${SECTIONS.length} · Question ${posInSection} of ${inSection.length}</p>
        <p class="section-name">${escapeHtml(section.name)}</p>
      </div>
      <div class="card question-card">
        <h1 class="question-title" id="q-title">${escapeHtml(q.title)}</h1>
        <p class="question-text" id="q-text">${escapeHtml(q.question)}</p>
        <div data-options></div>
        ${q.help ? `<p class="question-help" id="q-help"><strong>Why this matters:</strong> ${escapeHtml(q.help)}</p>` : ''}
      </div>
      <div class="q-nav">
        <button type="button" class="btn btn-text" data-back>${icon('arrowLeft', 18, 2)} Back</button>
        <button type="button" class="btn btn-primary" data-next>${isLast ? 'See my score' : 'Next'} ${icon('arrowRight', 18, 2)}</button>
      </div>
    </div>`);

  const next = element.querySelector('[data-next]');
  const percentEl = element.querySelector('[data-percent]');
  const bar = element.querySelector('.seg-bar');
  const currentTick = element.querySelector('.seg-tick.is-current');

  function sync() {
    const answered = QUESTIONS.filter((x) => state.answers[x.id] != null).length;
    const percent = Math.round((answered / total) * 100);
    percentEl.textContent = `${percent}% complete`;
    bar.setAttribute('aria-valuenow', String(percent));
    bar.setAttribute('aria-valuetext', `Question ${index + 1} of ${total}, ${section.name}, ${percent} percent complete`);
    next.disabled = state.answers[q.id] == null;
    currentTick.classList.toggle('is-answered', state.answers[q.id] != null);
  }

  function advance() {
    if (state.answers[q.id] == null) return;
    if (isLast) go('results');
    else go('question', { questionIndex: index + 1 });
  }

  const cards = optionCards({
    options: q.options,
    selected: state.answers[q.id],
    labelledBy: 'q-title',
    onSelect: (i) => {
      state.answers[q.id] = i;
      sync();
    },
    onSubmit: advance,
  });
  cards.element.setAttribute('aria-describedby', q.help ? 'q-text q-help' : 'q-text');
  element.querySelector('[data-options]').replaceWith(cards.element);

  next.addEventListener('click', advance);
  element.querySelector('[data-back]').addEventListener('click', () => {
    if (index === 0) go('details');
    else go('question', { questionIndex: index - 1 });
  });
  sync();

  return { element, focus: cards.focus };
}

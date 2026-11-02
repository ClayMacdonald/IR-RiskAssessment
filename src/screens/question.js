import { optionCards } from '../components/optionCards.js';
import { icon } from '../components/icons.js';
import { el, escapeHtml } from '../util.js';

// "17 CFR 248.30(a)(4)(iii): timing of notice" -> "17 CFR 248.30(a)(4)(iii)". "none: ..." -> IRP control only.
export function shortRule(ref) {
  return ref.startsWith('none:') ? 'IRP control, no Reg S-P requirement' : ref.split(':')[0];
}

export function renderQuestion({ state, go }) {
  const { questions } = state.bank;
  const index = Math.min(state.questionIndex, questions.length - 1);
  const q = questions[index];
  const total = questions.length;
  const isLast = index === total - 1;

  const sections = state.bank.sections.filter((s) => questions.some((x) => x.section === s.id));
  const sectionPos = sections.findIndex((s) => s.id === q.section);
  const section = sections[sectionPos];
  const inSection = questions.filter((x) => x.section === q.section);
  const posInSection = inSection.indexOf(q) + 1;

  // Shuffled display order for knowledge questions. Answers are stored as bank indexes.
  const order = state.optionOrder[q.id] || q.options.map((_, i) => i);
  const displayed = order.map((i) => q.options[i]);
  const selectedPos = state.answers[q.id] == null ? null : order.indexOf(state.answers[q.id]);

  // One segment per section, sized by its question count.
  const segments = sections
    .map((s) => {
      const qs = questions.filter((x) => x.section === s.id);
      const ticks = qs
        .map((x) => {
          const i = questions.indexOf(x);
          const cls = i === index ? 'is-current' : state.answers[x.id] != null ? 'is-done' : '';
          return `<span class="seg-tick ${cls}"></span>`;
        })
        .join('');
      return `<span class="seg seg-${Math.min(qs.length, 8)}">${ticks}</span>`;
    })
    .join('');

  const kind = q.type === 'knowledge' ? 'IRP knowledge' : 'Program readiness';

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
        <p class="eyebrow">Section ${sectionPos + 1} of ${sections.length} · Question ${posInSection} of ${inSection.length}</p>
        <p class="section-name">${escapeHtml(section.name)}</p>
      </div>
      <div class="card question-card">
        <p class="q-kind q-kind-${q.type}">${kind}</p>
        <h1 class="question-title" id="q-title">${escapeHtml(q.title)}</h1>
        <p class="question-text" id="q-text">${escapeHtml(q.question)}</p>
        <div data-options></div>
        ${q.type === 'readiness' && q.help ? `<p class="question-help" id="q-help"><strong>Why this matters:</strong> ${escapeHtml(q.help)}</p>` : ''}
        <dl class="question-refs" id="q-refs">
          <div><dt>Tests your IRP</dt><dd>${escapeHtml(q.irp_ref)}</dd></div>
          <div><dt>Reg S-P</dt><dd>${escapeHtml(shortRule(q.regsp_ref))}</dd></div>
        </dl>
      </div>
      <div class="q-nav">
        <button type="button" class="btn btn-text" data-back>${icon('arrowLeft', 18, 2)} Back</button>
        <button type="button" class="btn btn-primary" data-next>${isLast ? 'See my results' : 'Next'} ${icon('arrowRight', 18, 2)}</button>
      </div>
    </div>`);

  const next = element.querySelector('[data-next]');
  const percentEl = element.querySelector('[data-percent]');
  const bar = element.querySelector('.seg-bar');
  const currentTick = element.querySelector('.seg-tick.is-current');

  function sync() {
    const answered = questions.filter((x) => state.answers[x.id] != null).length;
    const percent = Math.round((answered / total) * 100);
    percentEl.textContent = `${percent}% complete`;
    bar.setAttribute('aria-valuenow', String(percent));
    bar.setAttribute('aria-valuetext', `Question ${index + 1} of ${total}, ${section.name}, ${percent} percent complete`);
    next.disabled = state.answers[q.id] == null;
    currentTick.classList.toggle('is-answered', state.answers[q.id] != null);
  }

  function advance() {
    if (state.answers[q.id] == null) return;
    if (isLast) go('results', { completedAt: new Date() });
    else go('question', { questionIndex: index + 1 });
  }

  const cards = optionCards({
    options: displayed,
    selected: selectedPos,
    labelledBy: 'q-title',
    onSelect: (pos) => {
      state.answers[q.id] = order[pos];
      sync();
    },
    onSubmit: advance,
  });
  const describedBy = ['q-text', q.type === 'readiness' && q.help ? 'q-help' : null].filter(Boolean).join(' ');
  cards.element.setAttribute('aria-describedby', describedBy);
  element.querySelector('[data-options]').replaceWith(cards.element);

  next.addEventListener('click', advance);
  element.querySelector('[data-back]').addEventListener('click', () => {
    if (index === 0) go('details');
    else go('question', { questionIndex: index - 1 });
  });
  sync();

  return { element, focus: cards.focus };
}

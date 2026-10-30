import { icon } from './icons.js';

const STEPS = ['Your details', 'Assessment', 'Results'];
const STEP_FOR_SCREEN = { details: 0, question: 1, results: 2, report: 2 };

// Slim progress strip under the header. Hidden on the intro screen.
export function renderStepper(screen) {
  const current = STEP_FOR_SCREEN[screen];
  if (current == null) return null;
  const width = screen === 'results' ? 'container-results' : screen === 'report' ? 'container-gate' : 'container';

  const items = STEPS.map((label, i) => {
    const state = i < current ? 'complete' : i === current ? 'current' : 'upcoming';
    const disc = state === 'complete' ? icon('check', 14, 2.5) : String(i + 1);
    const connector = i < STEPS.length - 1 ? `<span class="step-connector${i < current ? ' is-complete' : ''}" aria-hidden="true"></span>` : '';
    return `
      <li class="step step-${state}"${state === 'current' ? ' aria-current="step"' : ''}>
        <span class="step-disc" aria-hidden="true">${disc}</span>
        <span class="step-label">${label}${state === 'complete' ? '<span class="sr-only"> (completed)</span>' : ''}</span>
      </li>${connector}`;
  }).join('');

  const nav = document.createElement('nav');
  nav.className = 'stepper-bar';
  nav.setAttribute('aria-label', 'Assessment progress');
  nav.innerHTML = `<div class="${width}"><ol class="stepper">${items}</ol></div>`;
  return nav;
}

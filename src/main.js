import '@fontsource/open-sans/latin-400.css';
import '@fontsource/open-sans/latin-600.css';
import '@fontsource/open-sans/latin-700.css';
import './styles/brand.css';
import './styles/base.css';
import './styles/components.css';

import { state } from './state.js';
import { renderHeader } from './components/header.js';
import { renderFooter } from './components/footer.js';
import { renderStepper } from './components/stepper.js';
import { renderLanding } from './screens/landing.js';
import { renderDetails } from './screens/details.js';
import { renderQuestion } from './screens/question.js';
import { renderResults } from './screens/results.js';
import { renderGate } from './screens/gate.js';

const screens = {
  landing: renderLanding,
  details: renderDetails,
  question: renderQuestion,
  results: renderResults,
  gate: renderGate,
};

const app = document.getElementById('app');
const stepperSlot = document.createElement('div');
const main = document.createElement('main');
main.id = 'main';
main.tabIndex = -1;
app.replaceChildren(renderHeader(), stepperSlot, main, renderFooter());

let firstRender = true;

export function go(screen, patch = {}) {
  Object.assign(state, patch, { screen });
  render();
}

function render() {
  document.body.dataset.screen = state.screen;
  const stepper = renderStepper(state.screen);
  stepperSlot.replaceChildren(...(stepper ? [stepper] : []));

  const view = screens[state.screen]({ state, go });
  main.replaceChildren(view.element);
  window.scrollTo(0, 0);

  // After navigation, move focus into the new screen so keyboard and screen reader users land in the right place.
  if (firstRender) {
    firstRender = false;
    return;
  }
  if (view.focus) view.focus();
  else {
    const target = main.querySelector('h1');
    if (target) {
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  }
}

render();

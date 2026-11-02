import '@fontsource/open-sans/latin-400.css';
import '@fontsource/open-sans/latin-600.css';
import '@fontsource/open-sans/latin-700.css';
import './styles/brand.css';
import './styles/base.css';
import './styles/components.css';

import base from './content/questions.json';
import config from './content/config.json';
import { state } from './state.js';
import { buildBank } from './bank.js';
import { optionOrders } from './scoring.js';
import { renderHeader } from './components/header.js';
import { renderFooter } from './components/footer.js';
import { renderStepper } from './components/stepper.js';
import { renderIntro } from './screens/intro.js';
import { renderDetails } from './screens/details.js';
import { renderQuestion } from './screens/question.js';
import { renderResults } from './screens/results.js';
import { renderReport } from './screens/report.js';
import { el } from './util.js';

const screens = {
  intro: renderIntro,
  details: renderDetails,
  question: renderQuestion,
  results: renderResults,
  report: renderReport,
};

const app = document.getElementById('app');
const stepperSlot = document.createElement('div');
const main = document.createElement('main');
main.id = 'main';
main.tabIndex = -1;

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

// Loads this client's firm name and content override. A missing or expired session goes back to sign-in.
async function start() {
  app.replaceChildren(renderHeader(), stepperSlot, main, renderFooter());
  try {
    const res = await fetch('/api/client', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    if (res.status === 401) {
      window.location.replace('/login/');
      return;
    }
    if (!res.ok) throw new Error('client_unavailable');
    const client = await res.json();
    state.clientId = client.clientId;
    state.preview = client.preview === true;
    state.details.firmName = client.firmName || '';
    state.bank = buildBank(base, client.override, config.irpVersion);
  } catch {
    main.replaceChildren(
      el(`<div class="container"><div class="title-block">
        <h1>We could not load the assessment</h1>
        <p class="lead">Check your connection and reload the page. If it keeps happening, contact AdvisorDefense at ${config.email}.</p>
      </div></div>`)
    );
    return;
  }
  if (state.preview) {
    app.insertBefore(
      el(`<aside class="pv-banner" aria-label="Preview mode"><p><strong>Preview mode.</strong> Nothing is saved or sent. Close this tab when you are done.</p></aside>`),
      stepperSlot
    );
  }
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  state.optionOrder = optionOrders(state.bank.questions, seed);
  render();
}

start();

// Admin dashboard for AdvisorDefense staff, served from /admin/ behind Cloudflare Access.
// Hash routes: #/clients (default), #/clients/{id}, #/submissions/{id} (linked from the
// completion email) and #/audit. Nothing is kept in the browser beyond the current screen.
import '@fontsource/open-sans/latin-400.css';
import '@fontsource/open-sans/latin-600.css';
import '@fontsource/open-sans/latin-700.css';
import '../styles/brand.css';
import '../styles/base.css';
import '../styles/components.css';
import './admin.css';

import { logoSvg } from '../logo.js';
import { icon } from '../components/icons.js';
import { el, escapeHtml } from '../util.js';
import { api } from './api.js';
import { renderClients } from './clients.js';
import { renderClient } from './client.js';
import { renderSubmission } from './submission.js';
import { renderAudit } from './audit.js';

const app = document.getElementById('app');
const main = document.createElement('main');
main.id = 'main';
main.tabIndex = -1;

let firstRender = true;

function header(email) {
  return el(`
    <header class="site-header">
      <div class="site-header-inner">
        <div class="header-brand">
          <a class="logo-link" href="#/clients">${logoSvg({ className: 'logo logo-header', label: true })}</a>
          <span class="header-divider" aria-hidden="true"></span>
          <span class="header-product">IRP Assessment Admin</span>
        </div>
        <div class="admin-user">
          <span class="admin-email">${escapeHtml(email)}</span>
          <a class="header-link" href="/cdn-cgi/access/logout">${icon('lock', 16, 2)}<span>Sign out</span></a>
        </div>
      </div>
    </header>`);
}

export function navigate(hash) {
  if (window.location.hash === hash) route();
  else window.location.hash = hash;
}

function route() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  let view;
  if (parts[0] === 'clients' && parts[1]) view = renderClient({ clientId: parts[1], navigate });
  else if (parts[0] === 'submissions' && parts[1]) view = renderSubmission({ id: parts[1], navigate });
  else if (parts[0] === 'audit') view = renderAudit();
  else view = renderClients({ navigate });
  main.replaceChildren(view.element);
  window.scrollTo(0, 0);
  if (firstRender) {
    firstRender = false;
    return;
  }
  // After navigation, move focus to the new screen's heading.
  const target = main.querySelector('h1');
  if (target) {
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
}

async function start() {
  try {
    const { email } = await api.me();
    app.replaceChildren(header(email), main);
    window.addEventListener('hashchange', route);
    route();
  } catch (err) {
    app.replaceChildren(
      el(`<main id="main" class="container-page admin-page"><div class="title-block">
        <h1>Admin sign-in needed</h1>
        <p class="lead">${escapeHtml(err.message)}</p>
      </div></main>`)
    );
  }
}

start();

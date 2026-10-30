import config from '../content/config.json';
import { logoSvg } from '../logo.js';
import { icon } from './icons.js';

// Sign out clears the session cookie on the server, then returns to the sign-in page.
// Answers live only in memory, so leaving the page discards them.
export function renderHeader() {
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="site-header-inner">
      <div class="header-brand">
        <span class="logo-link">${logoSvg({ className: 'logo logo-header', label: true })}</span>
        <span class="header-divider" aria-hidden="true"></span>
        <span class="header-product">${config.productName}</span>
      </div>
      <button type="button" class="header-link header-signout" data-signout>${icon('lock', 16, 2)}<span>Sign out</span></button>
    </div>`;
  header.querySelector('[data-signout]').addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      window.location.replace('/login/');
    }
  });
  return header;
}

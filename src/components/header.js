import config from '../content/config.json';
import { logoSvg } from '../logo.js';
import { icon } from './icons.js';

export function renderHeader() {
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="site-header-inner">
      <div class="header-brand">
        <a class="logo-link" href="${config.siteUrl}" aria-label="AdvisorDefense home">${logoSvg({ className: 'logo logo-header', label: false })}</a>
        <span class="header-divider" aria-hidden="true"></span>
        <span class="header-product">Reg S-P Readiness Score</span>
      </div>
      <a class="header-link" href="${config.siteUrl}">${icon('arrowLeft', 16, 2)}<span><span class="header-link-back">Back to </span>AdvisorDefense.com</span></a>
    </div>`;
  return header;
}

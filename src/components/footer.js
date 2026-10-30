import config from '../content/config.json';
import { logoSvg } from '../logo.js';
import { icon } from './icons.js';

export function renderFooter() {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  const tel = config.phone.replace(/[^0-9]/g, '');
  footer.innerHTML = `
    <div class="site-footer-inner">
      <div class="footer-top">
        <div class="footer-brand">
          ${logoSvg({ variant: 'reversed', className: 'logo logo-footer' })}
          <p class="footer-tagline">AdvisorDefense · ${config.tagline}</p>
        </div>
        <div class="footer-contact">
          <a href="tel:+1${tel}">${icon('phone', 16)}<span>${config.phone}</span></a>
          <a href="mailto:${config.email}">${icon('mail', 16)}<span>${config.email}</span></a>
        </div>
      </div>
      <div class="footer-rule" aria-hidden="true"></div>
      <p class="footer-disclaimer">${config.disclaimer}</p>
      <p class="footer-copy">© ${new Date().getFullYear()} AdvisorDefense</p>
    </div>`;
  return footer;
}

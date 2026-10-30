const R = 68;
const C = 2 * Math.PI * R;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Circular score gauge. Geometry and animation are set through element.style (CSP-safe).
export function scoreRing({ score, band, size = 168 }) {
  const wrap = document.createElement('div');
  wrap.className = `score-ring score-ring-${size < 150 ? 'sm' : 'lg'}`;
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', `Overall score ${score} out of 100, ${band.label}`);
  wrap.innerHTML = `
    <svg viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      <circle class="ring-track" cx="80" cy="80" r="${R}" fill="none" stroke-width="12"/>
      <circle class="ring-value ring-${band.tone}" cx="80" cy="80" r="${R}" fill="none" stroke-width="12" stroke-linecap="round" transform="rotate(-90 80 80)"/>
    </svg>
    <div class="ring-center" aria-hidden="true">
      <span class="ring-number num">${score}</span>
      <span class="ring-out-of">/ 100</span>
    </div>`;

  const value = wrap.querySelector('.ring-value');
  const number = wrap.querySelector('.ring-number');
  const target = C * (1 - score / 100);
  value.style.strokeDasharray = String(C);

  // A round line cap would still draw a dot at 0, so hide the arc entirely.
  if (score === 0) value.style.visibility = 'hidden';

  if (reducedMotion() || score === 0) {
    value.style.strokeDashoffset = String(target);
    return wrap;
  }

  value.style.strokeDashoffset = String(C);
  number.textContent = '0';
  requestAnimationFrame(() => {
    value.style.transition = 'stroke-dashoffset 700ms cubic-bezier(0.2, 0, 0, 1)';
    value.style.strokeDashoffset = String(target);
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / 700, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      number.textContent = String(Math.round(score * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return wrap;
}

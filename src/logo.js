import { MARK_STROKE, MARK_BOWL, WORD_ADVISOR, WORD_DEFENSE } from './brand/logoPaths.js';

// Logo variants built from the official SVG paths. Only fills change, shapes never do.
// Fills use literal hex read from brand.css tokens, because a <style> block or CSS var()
// inside the SVG would be blocked by the CSP or lost when rasterized for the PDF.

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function fillsFor(variant) {
  if (variant === 'reversed') {
    const white = token('--ad-surface');
    const gray = token('--ad-logo-gray');
    return { stroke: white, bowl: gray, advisor: white, defense: gray };
  }
  return {
    stroke: token('--ad-logo-navy'),
    bowl: token('--ad-logo-gray-mark'),
    advisor: token('--ad-logo-navy-text'),
    defense: token('--ad-logo-gray'),
  };
}

const paths = (list, fill) => list.map((d) => `<path fill="${fill}" d="${d}"/>`).join('');

function markGroup(f) {
  return paths(MARK_STROKE, f.stroke) + paths(MARK_BOWL, f.bowl);
}

function wordGroup(f) {
  return paths(WORD_ADVISOR, f.advisor) + paths(WORD_DEFENSE, f.defense);
}

// Horizontal lockup: the mark is scaled to 112 units tall, the wordmark (70 units)
// is centered beside it with a gap of half the wordmark height.
export const LOCKUP_VIEWBOX = { width: 881, height: 112 };

export function logoSvg({ variant = 'color', layout = 'horizontal', height, className = 'logo', label = true } = {}) {
  const f = fillsFor(variant);
  const a11y = label ? 'role="img" aria-label="AdvisorDefense"' : 'aria-hidden="true" focusable="false"';
  const xmlns = 'xmlns="http://www.w3.org/2000/svg"';
  if (layout === 'mark') {
    const h = height ? ` height="${height}" width="${Math.round(height * (318 / 263))}"` : '';
    return `<svg ${xmlns} class="${className}" viewBox="222 9 318 263"${h} ${a11y}>${markGroup(f)}</svg>`;
  }
  const { width: vw, height: vh } = LOCKUP_VIEWBOX;
  const h = height ? ` height="${height}" width="${Math.round((height * vw) / vh)}"` : '';
  return `<svg ${xmlns} class="${className}" viewBox="0 0 ${vw} ${vh}"${h} ${a11y}>
    <g transform="translate(-95.6 -4.0) scale(0.4275)">${markGroup(f)}</g>
    <g transform="translate(158.7 -269.8)">${wordGroup(f)}</g>
  </svg>`;
}

// Rasterizes the reversed lockup to a PNG data URL for the PDF header.
export async function loadLogoForPdf() {
  try {
    const { width: vw, height: vh } = LOCKUP_VIEWBOX;
    const scale = 3;
    const svg = logoSvg({ variant: 'reversed', label: false }).replace(
      '<svg ',
      `<svg width="${vw * scale}" height="${vh * scale}" `
    );
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = vw * scale;
      canvas.height = vh * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return { dataUrl: canvas.toDataURL('image/png'), width: vw, height: vh };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

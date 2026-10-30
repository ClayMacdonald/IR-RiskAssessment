import { escapeHtml } from '../util.js';

const CHECK_SVG =
  '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Accessible radio group of answer cards. Arrow keys move and select, Enter or Space selects.
export function optionCards({ options, selected, labelledBy, onSelect, onSubmit }) {
  const group = document.createElement('div');
  group.className = 'options';
  group.setAttribute('role', 'radiogroup');
  if (labelledBy) group.setAttribute('aria-labelledby', labelledBy);

  const buttons = options.map((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option';
    btn.setAttribute('role', 'radio');
    btn.innerHTML = `<span class="option-indicator" aria-hidden="true">${CHECK_SVG}</span><span class="option-label">${escapeHtml(opt.label)}</span>`;
    btn.addEventListener('click', () => select(i));
    btn.addEventListener('keydown', (e) => onKey(e, i));
    group.append(btn);
    return btn;
  });

  let current = selected;

  function sync() {
    buttons.forEach((b, i) => {
      const checked = i === current;
      b.setAttribute('aria-checked', String(checked));
      b.tabIndex = checked || (current == null && i === 0) ? 0 : -1;
    });
  }

  function select(i, focus = false) {
    current = i;
    sync();
    if (focus) buttons[i].focus();
    onSelect(i);
  }

  function onKey(e, i) {
    const last = buttons.length - 1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      select(i === last ? 0 : i + 1, true);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      select(i === 0 ? last : i - 1, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // First Enter selects. Enter on the already selected card advances.
      if (current === i && onSubmit) onSubmit();
      else select(i);
    } else if (e.key === ' ') {
      e.preventDefault();
      select(i);
    }
  }

  sync();
  return { element: group, focus: () => buttons[current ?? 0].focus() };
}

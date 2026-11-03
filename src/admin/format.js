// Small display helpers shared by the admin screens.
import { escapeHtml } from '../util.js';

// Code status from the client record. A code works through the end of its expiry date (UTC).
export function codeStatus(client, now = Date.now()) {
  if (client.revokedAt) return { label: 'Revoked', tone: 'danger' };
  if (Date.parse(`${client.expires}T23:59:59Z`) < now) return { label: 'Expired', tone: 'warning' };
  return { label: 'Active', tone: 'success' };
}

export function chip(label, tone) {
  return `<span class="chip chip-${tone}">${escapeHtml(label)}</span>`;
}

export function statusChip(client) {
  const s = codeStatus(client);
  return chip(s.label, s.tone);
}

// "Dec 31, 2027" for a YYYY-MM-DD date, read as a calendar date (no time zone shift).
export function formatDate(ymd) {
  if (!ymd) return '';
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Local date and time for an ISO timestamp.
export function formatTimestamp(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function oneYearFromToday() {
  return new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

// The one-time code panel shown after creating a client or issuing a new code.
export function codePanel(firmName, code) {
  return `
    <div class="notice notice-success code-panel" role="status" tabindex="-1">
      <div>
        <p class="notice-title">Access code for ${escapeHtml(firmName)}</p>
        <p>Shown once and not stored. Copy it now and send it to the client separately from the link, for example by phone.</p>
        <p class="code-value num" data-code>${escapeHtml(code)}</p>
        <div class="notice-actions">
          <button type="button" class="btn btn-secondary" data-copy>Copy code</button>
          <span class="copy-status" data-copy-status aria-live="polite"></span>
        </div>
      </div>
    </div>`;
}

export function wireCopy(root) {
  const button = root.querySelector('[data-copy]');
  if (!button) return;
  button.addEventListener('click', async () => {
    const status = root.querySelector('[data-copy-status]');
    try {
      await navigator.clipboard.writeText(root.querySelector('[data-code]').textContent.trim());
      status.textContent = 'Copied';
    } catch {
      status.textContent = 'Copy did not work. Select the code and copy it by hand.';
    }
  });
}

export function errorNotice(message) {
  return `<p class="field-error admin-error" role="alert"><span>${escapeHtml(message)}</span></p>`;
}

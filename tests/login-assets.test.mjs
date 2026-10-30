// The login page ships copies of the design system (it cannot load the gated bundle).
// Fails if they drift from src/. Fix with: npm run sync:login
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('login page styles are exact copies of src/styles', () => {
  for (const f of ['brand.css', 'base.css', 'components.css']) {
    assert.equal(readFileSync(`public/login/${f}`, 'utf8'), readFileSync(`src/styles/${f}`, 'utf8'), `${f} drifted`);
  }
});

test('login page has no inline scripts, inline styles or third-party assets', () => {
  const html = readFileSync('public/login/index.html', 'utf8');
  assert.ok(!/<script(?![^>]*\bsrc=)/.test(html), 'inline script');
  assert.ok(!/<style|style=/.test(html), 'inline style');
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(url.startsWith('/') || url.startsWith('mailto:'), `external asset ${url}`);
  }
});

test('login page uses only colors defined in brand.css', () => {
  const tokens = new Set([...readFileSync('src/styles/brand.css', 'utf8').matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase()));
  const css = readFileSync('public/login/login.css', 'utf8') + readFileSync('public/login/logo.svg', 'utf8');
  for (const [hex] of css.matchAll(/#[0-9A-Fa-f]{6}\b/g)) assert.ok(tokens.has(hex.toUpperCase()), `${hex} is not a brand token`);
});

// Copies the shared design system into public/login/ so the login page matches the app
// without loading anything from the gated bundle. Run after changing any of the sources:
//   npm run sync:login
// tests/login-assets.test.mjs fails if the copies drift.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'public/login';
mkdirSync(`${OUT}/fonts`, { recursive: true });

for (const f of ['brand.css', 'base.css', 'components.css']) copyFileSync(`src/styles/${f}`, `${OUT}/${f}`);
for (const w of [400, 600, 700]) {
  const name = `open-sans-latin-${w}-normal.woff2`;
  copyFileSync(`node_modules/@fontsource/open-sans/files/${name}`, `${OUT}/fonts/${name}`);
}

// logo.js reads fills from CSS tokens at runtime. Feed it the tokens from brand.css.
const tokens = Object.fromEntries(
  [...readFileSync('src/styles/brand.css', 'utf8').matchAll(/(--ad-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]])
);
globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => tokens[name] || '' });
const { logoSvg } = await import('../src/logo.js');
writeFileSync(`${OUT}/logo.svg`, logoSvg({ className: 'logo', label: true }).replace(/\n\s*/g, '') + '\n');

console.log(`Synced styles, fonts and logo into ${OUT}/`);

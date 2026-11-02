// One-time local setup: npm run dev:setup
// - Creates .dev.vars from .dev.vars.example if it does not exist, and adds any keys it is missing.
// - Generates a random SESSION_SECRET if it is still the placeholder.
// - Sets ALLOWED_ORIGINS to the local ports (scripts/dev-ports.mjs).
// - Applies the migrations to the local D1 database, adds a local test client and the smoke-test
//   client, and prints the local code once.
// Safe to rerun: it keeps your SESSION_SECRET and local data, and issues a new local code (the old
// one stops working).
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClientEntry } from './add-client.mjs';
import { hashCode } from '../functions/_lib/session.js';
import { LOCAL_ORIGINS, SMOKE_CODE, VITE_URL } from './dev-ports.mjs';
import { applyLocalMigrations, executeLocal } from './local-d1.mjs';
import { upsertClientSql } from './sql.mjs';

// ACCESS_CODES moved to the D1 clients table.
const RETIRED = ['DEV_SKIP_TURNSTILE', 'ACCESS_CODES'];
const PLACEHOLDER = 'replace-me';

const created = !existsSync('.dev.vars');
if (created) copyFileSync('.dev.vars.example', '.dev.vars');

let text = readFileSync('.dev.vars', 'utf8');
const example = readFileSync('.dev.vars.example', 'utf8');
const keyRe = (key) => new RegExp(`^${key}=.*$`, 'm');
const get = (key) => (text.match(keyRe(key)) || [])[0]?.slice(key.length + 1);
const set = (key, value) => {
  text = keyRe(key).test(text) ? text.replace(keyRe(key), () => `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
};

// Bring an older .dev.vars up to date with the example. Retired keys go, with the comment above them.
for (const [line, key] of example.matchAll(/^([A-Z_]+)=.*$/gm)) if (get(key) === undefined) text = `${text.trimEnd()}\n${line}\n`;
for (const key of RETIRED) text = text.replace(new RegExp(`(^#.*\\n)*^${key}=.*\\n?`, 'm'), '');

if (!get('SESSION_SECRET') || get('SESSION_SECRET') === PLACEHOLDER) set('SESSION_SECRET', randomBytes(48).toString('base64url'));
set('ALLOWED_ORIGINS', LOCAL_ORIGINS.join(','));

writeFileSync('.dev.vars', text.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');

const nextYear = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const { code, client } = await createClientEntry('local-dev', 'Local Dev Advisors', nextYear);
const smoke = { clientId: 'smoke-test', firmName: 'Smoke Test Advisors', expires: '2099-12-31', codeHash: await hashCode(SMOKE_CODE) };
console.log('Setting up the local database...');
applyLocalMigrations();
executeLocal([client, smoke].map((c) => upsertClientSql({ ...c, actor: 'dev-setup' })).join('\n'));

const line = '='.repeat(58);
console.log(`
${created ? 'Created' : 'Updated'} .dev.vars (git-ignored, local test values only).
Local database ready (.wrangler/state, git-ignored).

${line}
  Your local access code (shown once, not stored):

      ${code}

  Firm: Local Dev Advisors. Valid until ${nextYear}.
${line}

Next: npm run dev, then open ${VITE_URL} and sign in with the code above.
Lost it? Run npm run dev:setup again for a new one.
`);

// Runs the Pages Functions locally with Wrangler, reading secrets from .dev.vars.
//   node scripts/dev-api.mjs          serves public/ plus Functions, for npm run dev (Vite in front)
//   node scripts/dev-api.mjs dist     serves the production build plus Functions (npm run pages, smoke test)
// Wrangler 4 has no proxy mode, so it serves a directory and Vite proxies /api to it.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { API_PORT } from './dev-ports.mjs';
import { LOCAL_D1_ID, PERSIST_DIR, WRANGLER, applyLocalMigrations } from './local-d1.mjs';

const dir = process.argv[2] || 'public';
// Pinned so local runs are repeatable. Keep it in step with the Pages project's compatibility date.
const COMPATIBILITY_DATE = '2026-10-23';

if (!existsSync('.dev.vars')) {
  console.error('No .dev.vars found. Run "npm run dev:setup" once, then try again.');
  process.exit(1);
}
if (dir === 'dist' && !existsSync('dist/index.html')) {
  console.error('No build found. Run "npm run build" first.');
  process.exit(1);
}

// The Functions import the compiled client overrides, so make sure they exist.
await import('./build-clients.mjs');

// Wrangler's package exports do not expose bin/, so use the installed file directly.
if (!existsSync(WRANGLER)) {
  console.error('Wrangler is not installed. Run npm install.');
  process.exit(1);
}

// New migrations apply on every start, so the local database always matches the schema.
applyLocalMigrations();

const args = [
  WRANGLER, 'pages', 'dev', dir,
  '--port', String(API_PORT),
  '--ip', '127.0.0.1',
  '--show-interactive-dev-session=false',
  `--compatibility-date=${COMPATIBILITY_DATE}`,
  '--d1', `DB=${LOCAL_D1_ID}`,
  '--persist-to', PERSIST_DIR,
];
const child = spawn(process.execPath, args, { stdio: 'inherit' });

const stop = () => child.kill('SIGTERM');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

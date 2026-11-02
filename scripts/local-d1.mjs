// The local D1 database that npm run dev and npm run pages bind as DB.
// Migrations and seed data go through wrangler.dev.toml; the Pages dev server binds the same
// database ID and persistence folder, so both see one database. Production is set up in the
// Cloudflare dashboard (see README, "Deploy").
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const LOCAL_D1_ID = 'irp-assessment-local';
export const PERSIST_DIR = join('.wrangler', 'state');
export const WRANGLER = join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const LOCAL_ARGS = ['DB', '--local', '--config', 'wrangler.dev.toml', '--persist-to', PERSIST_DIR];

function wrangler(args) {
  const res = spawnSync(process.execPath, [WRANGLER, ...args], { encoding: 'utf8', env: { ...process.env, CI: '1' } });
  if (res.status !== 0) {
    throw new Error(`wrangler ${args.slice(0, 3).join(' ')} failed:\n${res.stdout || ''}${res.stderr || ''}`);
  }
  return res.stdout;
}

// Applies any migrations not yet applied. Safe to run every time.
export function applyLocalMigrations() {
  wrangler(['d1', 'migrations', 'apply', ...LOCAL_ARGS]);
}

// Runs SQL against the local database from a temporary file, so values never pass through a shell.
export function executeLocal(sql) {
  const dir = mkdtempSync(join(tmpdir(), 'irp-d1-'));
  try {
    const file = join(dir, 'seed.sql');
    writeFileSync(file, sql);
    wrangler(['d1', 'execute', ...LOCAL_ARGS, '--file', file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

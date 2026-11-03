// End-to-end smoke test against the production build served by the real Pages runtime
// (wrangler pages dev), so the access gate, the Functions and the _headers CSP all apply.
//
// Usage (see README, "Smoke test"):
//   VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run build
//   npm run pages                      # serves dist/ at http://127.0.0.1:8799 using .dev.vars
//   npm run test:smoke                 # in another terminal
//
// node tests/smoke.mjs [baseUrl] [outputDir]. Code: SMOKE_CODE env, default from scripts/dev-ports.mjs (dev:setup registers it).
//
// Runs:
//   A  CSIRT Lead, desktop, keyboard only, mixed answers, 200% zoom check, Download again
//   B  Chief Compliance Officer, phone, mouse, all correct, completion notification fails (502)
//   C  Operations, 320px, mouse, all worst answers
//   D  Secondary Lead, desktop, keyboard only, forced colors and reduced motion
//   E  Admin flow: create (or re-key) a client in /admin/, complete the assessment with its code
//      through the real completion Function, then find the record, download the admin PDF and
//      compare it with the person's, preview as the client, and axe every admin screen.
// Plus unauthenticated checks: bundle, API and pages blocked before sign-in; generic error for a bad code.
// Locally the admin side uses ADMIN_DEV_EMAIL (local dev mode). The Access JWT checks, and admin
// routes refusing client sessions, are covered by tests/admin.test.mjs.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFParse } from 'pdf-parse';
import base from '../src/content/questions.json' with { type: 'json' };
import config from '../src/content/config.json' with { type: 'json' };
import { buildBank } from '../src/bank.js';
import { buildResults, correctIndex } from '../src/scoring.js';
import { completionPayload } from '../src/payload.js';
import { API_URL, SMOKE_CODE } from '../scripts/dev-ports.mjs';

const BASE = process.argv[2] || API_URL;
const OUT = process.argv[3] || 'smoke-output';
const CODE = process.env.SMOKE_CODE || SMOKE_CODE;
const FIRM = 'Smoke Test Advisors';
mkdirSync(OUT, { recursive: true });

// The page loads Turnstile from this URL. The test serves a stand-in that issues a fixed token.
const TURNSTILE_JS = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const FAKE_TURNSTILE = `window.turnstile = {
  _w: {}, _n: 0,
  render(el, o) { const id = 'w' + (++this._n); this._w[id] = o; return id; },
  reset() {},
  execute(id) { const o = this._w[id]; setTimeout(() => o.callback('fake-token-' + id), 30); },
  remove() {},
};`;

const CSP = readFileSync('public/_headers', 'utf8').match(/Content-Security-Policy: (.+)/)[1].trim();
const BANNED = [/\u2014/, /\u2013/, /--/, /\bcompliant\b/i, /\bcertified\b/i, /\bpass(ed|es|ing)?\b/i, /\bfail(s|ed|ing|ure)?\b/i];
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const bank = buildBank(base, null, config.irpVersion);

let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
}
const bannedHits = (text) => BANNED.filter((re) => re.test(text)).map(String);

// ---------- answer plans: question -> bank option index ----------
const wrongIndex = (q) => (correctIndex(q) + 1) % q.options.length;
const PLANS = {
  mixed: (q, i) => (q.type === 'knowledge' ? (i % 3 === 2 ? wrongIndex(q) : correctIndex(q)) : i % 3),
  best: (q) => (q.type === 'knowledge' ? correctIndex(q) : 0),
  worst: (q) => (q.type === 'knowledge' ? wrongIndex(q) : q.options.length - 1),
  twoWrong: (q, i) => (q.type === 'readiness' ? 1 : i < 2 ? wrongIndex(q) : correctIndex(q)),
};

async function run(name, { role, width, keyboard = false, plan, completionStatus = 200, forcedColors, reducedMotion, zoomCheck = false, again = false, code = CODE, firm = FIRM, realCompletion = false }) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    acceptDownloads: true,
    ...(forcedColors ? { forcedColors: 'active' } : {}),
    ...(reducedMotion ? { reducedMotion: 'reduce' } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  const external = [];
  const completions = [];
  // A run that makes the notification fail on purpose expects the browser to log that status.
  const expectedNoise = completionStatus === 200 ? null : new RegExp(`status of ${completionStatus}`);
  page.on('console', (m) => m.type() === 'error' && !expectedNoise?.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url === TURNSTILE_JS) {
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }, body: FAKE_TURNSTILE });
    }
    if (url === `${BASE}/api/completion`) {
      completions.push(route.request().postDataJSON());
      // The admin run sends the completion to the real Function so the record is stored.
      if (realCompletion) return route.continue();
      return route.fulfill({ status: completionStatus, contentType: 'application/json', body: JSON.stringify({ ok: completionStatus === 200 }) });
    }
    if (!url.startsWith(BASE)) {
      external.push(url);
      return route.abort();
    }
    return route.continue();
  });

  const shot = async (label) => {
    await page.waitForTimeout(reducedMotion ? 50 : 250);
    await page.screenshot({ path: join(OUT, `${name}-${label}.png`), fullPage: true });
  };
  const axe = async (label) => {
    await page.waitForTimeout(reducedMotion ? 50 : 250);
    // Under forced colors the OS replaces the palette, so axe cannot measure contrast. Runs A to C cover it.
    const builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
    if (forcedColors) builder.disableRules(['color-contrast']);
    const r = await builder.analyze();
    const v = r.violations.map((x) => `${x.id} (${x.nodes.length})`);
    check(v.length === 0, `${name}: axe clean on ${label}${v.length ? `: ${v.join(', ')}` : ''}`);
  };
  const noHorizontalScroll = async (label) => {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(over <= 0, `${name}: no horizontal scroll on ${label} at ${page.viewportSize().width}px (${over}px over)`);
  };
  // Keyboard only: Tab until the target has focus.
  const tabTo = async (selector, max = 80) => {
    for (let i = 0; i < max; i++) {
      if (await page.evaluate((s) => document.activeElement?.matches(s), selector)) return true;
      await page.keyboard.press('Tab');
    }
    return false;
  };
  const activate = async (selector) => {
    if (keyboard) {
      check(await tabTo(selector), `${name}: reached ${selector} by keyboard`);
      await page.keyboard.press('Enter');
    } else await page.click(selector);
  };
  const type = async (selector, value) => {
    if (keyboard) {
      check(await tabTo(selector), `${name}: reached ${selector} by keyboard`);
      await page.keyboard.type(value);
    } else await page.fill(selector, value);
  };

  // ---------- sign in ----------
  await page.goto(`${BASE}/`);
  await page.waitForSelector('#code');
  check(page.url() === `${BASE}/login/`, `${name}: unauthenticated visit lands on the sign-in page`);
  await axe('login');
  await type('#code', code);
  if (keyboard) await page.keyboard.press('Enter');
  else await page.click('[data-submit]');
  await page.waitForURL(`${BASE}/`);
  const mainResponse = await page.request.get(`${BASE}/`);
  check(mainResponse.headers()['content-security-policy'] === CSP, `${name}: production CSP from _headers is served`);

  // ---------- intro ----------
  await page.waitForSelector('[data-start]');
  check((await page.textContent('h1')).trim() === 'IRP and Reg S-P Readiness', `${name}: intro H1`);
  check((await page.textContent('.hero')).includes(`Prepared for ${firm}`), `${name}: firm name prefilled from the access code`);
  await shot('1-intro');
  await axe('intro');
  await activate('[data-start]');

  // ---------- details ----------
  await page.waitForSelector('#name');
  check(await page.isDisabled('[data-next]'), `${name}: Continue disabled until complete`);
  check((await page.inputValue('#firmName')) === firm, `${name}: firm field prefilled`);
  await type('#name', 'Jordan Example');
  await type('#email', 'not-an-email');
  if (keyboard) await page.keyboard.press('Tab');
  else await page.locator('#email').blur();
  check(await page.isVisible('#email-error'), `${name}: invalid email shows an error`);
  await axe('details with error');
  await page.fill('#email', '');
  await type('#email', 'jordan@smoketest.example');
  if (keyboard) {
    check(await tabTo('#role'), `${name}: reached role by keyboard`);
    const idx = (await page.locator('#role option').allTextContents()).indexOf(role);
    for (let k = 0; k < idx; k++) await page.keyboard.press('ArrowDown');
  } else await page.selectOption('#role', role);
  check((await page.inputValue('#role')) === role, `${name}: role selected`);
  const roleList = await page.locator('#role option').allTextContents();
  check(!roleList.some((r) => /staff|supervised/i.test(r)), `${name}: no staff role offered`);
  check(!(await page.isDisabled('[data-next]')), `${name}: Continue enabled when complete`);
  await shot('2-details');
  await axe('details');
  await activate('[data-next]');

  // ---------- questions ----------
  const qs = bank.questions;
  const answers = {};
  for (let i = 0; i < qs.length; i++) {
    await page.waitForSelector(`.q-counter >> text=Question ${i + 1} of ${qs.length}`);
    const title = (await page.textContent('#q-title')).trim();
    const q = qs.find((x) => x.title === title);
    check(Boolean(q), `${name}: Q${i + 1} "${title}" is from the ${role} path`);
    if (!q) break;
    check(await page.isDisabled('[data-next]'), `${name}: Q${i + 1} Next disabled before answer`);
    const refs = await page.textContent('.question-refs');
    check(refs.includes(q.irp_ref) && refs.includes('Reg S-P'), `${name}: Q${i + 1} shows the IRP section and rule`);
    if (q.type === 'knowledge') check((await page.locator('.question-help').count()) === 0, `${name}: Q${i + 1} gives no hint`);

    const target = plan(q, i);
    answers[q.id] = target;
    const labels = (await page.locator('.option-label').allTextContents()).map((s) => s.trim());
    const pos = labels.indexOf(q.options[target].label);
    if (keyboard) {
      // Focus starts on the first option. Arrows move and select, Space selects the first, Enter advances.
      for (let k = 0; k < pos; k++) await page.keyboard.press('ArrowDown');
      if (pos === 0) await page.keyboard.press(' ');
      check((await page.locator('.option[aria-checked="true"] .option-label').textContent()).trim() === q.options[target].label, `${name}: Q${i + 1} selected with keyboard`);
      if (i === 0 || i === qs.length - 1 || q.type === 'readiness') await axe(`question ${i + 1} answered`);
      if (i === 0) await shot('3-question-01');
      await page.keyboard.press('Enter');
    } else {
      if (i === 0) await axe('question 1 unanswered');
      await page.locator('.option').nth(pos).click();
      if (i === 0) await shot('3-question-01');
      if (i === qs.length - 1) check((await page.textContent('[data-next]')).trim() === 'See my results', `${name}: last button reads See my results`);
      await page.click('[data-next]');
    }
  }

  // ---------- results ----------
  const expected = buildResults({ bank, answers }, config.knowledgeBands);
  await page.waitForSelector('.crosswalk');
  await page.waitForTimeout(reducedMotion ? 50 : 900);
  await shot('4-results');
  await axe('results');
  const rings = await page.locator('.score-ring').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  const ringScore = (label) => Number((rings.find((r) => r.startsWith(label)) || '').match(/(\d+) out of/)?.[1]);
  check(ringScore('IRP Knowledge') === expected.knowledge.score, `${name}: IRP Knowledge ${expected.knowledge.score} shown`);
  if (expected.readiness) check(ringScore('Program Readiness') === expected.readiness.score, `${name}: Program Readiness ${expected.readiness.score} shown`);
  else check(rings.length === 1, `${name}: Knowledge only when no readiness questions`);
  const rows = await page.locator('.crosswalk tbody tr').count();
  check(rows === expected.crosswalk.length, `${name}: crosswalk has ${expected.crosswalk.length} rows`);
  check((await page.locator('.finding-missed').count()) === expected.missed.length, `${name}: ${expected.missed.length} missed knowledge questions listed`);
  const resultsText = await page.textContent('main');
  for (const q of expected.missed) {
    check(resultsText.includes(q.options[correctIndex(q)].label) && resultsText.includes(q.explanation), `${name}: missed "${q.title}" shows IRP answer and explanation`);
  }
  check(bannedHits(resultsText).length === 0, `${name}: results copy clean ${bannedHits(resultsText)}`);
  await noHorizontalScroll('results');
  if (zoomCheck) {
    // 200% zoom on a 1280px window lays out like a 640px viewport.
    await page.setViewportSize({ width: 640, height: 900 });
    await noHorizontalScroll('results at 200% zoom');
    await shot('4-results-200pct');
    await page.setViewportSize({ width, height: 900 });
  }
  await activate('[data-report]');

  // ---------- report ----------
  await page.waitForSelector('[data-submit]');
  const notice = await page.textContent('.completion-notice');
  for (const phrase of ['your name', 'work email', 'role', 'answers', `${config.retentionYears} years`, 'built on your device']) {
    check(notice.includes(phrase), `${name}: disclosure names "${phrase}"`);
  }
  check(bannedHits(notice).length === 0, `${name}: disclosure copy clean`);
  await shot('5-report');
  await axe('report');
  const [download] = await Promise.all([page.waitForEvent('download'), activate('[data-submit]')]);
  const file = join(OUT, `${name}-${download.suggestedFilename()}`);
  await download.saveAs(file);
  await page.waitForSelector('.notice-success');
  await shot('6-downloaded');
  await axe('report downloaded');
  if (again) {
    const [d2] = await Promise.all([page.waitForEvent('download'), page.click('[data-again]')]);
    check(Boolean(d2), `${name}: Download again works`);
  }
  await page.waitForTimeout(300);

  // ---------- completion notification ----------
  check(completions.length === 1, `${name}: exactly one completion notification (${completions.length})`);
  const sent = completions[0] || {};
  const want = { ...completionPayload({ name: 'Jordan Example', email: 'jordan@smoketest.example', role }, bank, answers), turnstileToken: sent.turnstileToken };
  check(JSON.stringify(sent) === JSON.stringify(want), `${name}: completion carries exactly the disclosed fields`);
  check(!('clientId' in sent) && !('readinessScore' in sent) && !('knowledgeScore' in sent), `${name}: completion has no clientId or scores (the server scores)`);
  if (completionStatus !== 200) check(true, `${name}: report downloaded although the notification returned ${completionStatus}`);

  // ---------- PDF ----------
  const pdfText = (await new PDFParse({ data: readFileSync(file) }).getText()).text;
  writeFileSync(`${file}.txt`, pdfText);
  // pdf-parse adds "-- N of M --" page markers, and letter-spaced labels come out as "I R P".
  // Compare with all whitespace removed.
  const body = pdfText.replace(/^-- \d+ of \d+ --$/gm, '');
  const squash = (t) => t.replace(/\s+/g, '');
  const flat = squash(body);
  const has = (t) => flat.includes(squash(t));
  for (const s of ['IRP AND REG S-P READINESS REPORT', firm, 'Jordan Example', role, config.irpVersion, 'How the IRP meets Reg S-P', `Confidential. Prepared for ${firm}.`, 'Page 1 of', `AdvisorDefense keeps these answers for ${config.retentionYears} years`]) {
    check(has(s), `${name}: PDF contains "${s}"`);
  }
  check(has(`IRP KNOWLEDGE ${expected.knowledge.score} / 100 ${expected.knowledge.band.label}`), `${name}: PDF Knowledge score and band`);
  if (expected.readiness) check(has(`PROGRAM READINESS ${expected.readiness.score} / 100 ${expected.readiness.band.label}`), `${name}: PDF Readiness score and band`);
  else check(!has('PROGRAM READINESS'), `${name}: PDF has no readiness score when none asked`);
  for (const row of expected.crosswalk) {
    const k = !row.knowledge || has(`Knowledge: ${row.knowledge.correct} of ${row.knowledge.total}`);
    const r = !row.readiness || has(`Readiness: ${row.readiness.percent}%`);
    check(has(row.name) && k && r, `${name}: PDF crosswalk row ${row.name}`);
  }
  check(qs.every((q) => has(q.title)), `${name}: PDF lists every question`);
  check(bannedHits(body).length === 0, `${name}: PDF copy clean ${bannedHits(body)}`);

  // ---------- page health ----------
  const csp = await page.evaluate(() => window.__csp);
  check(csp.length === 0, `${name}: no CSP violations ${csp.join('; ')}`);
  check(errors.length === 0, `${name}: no console errors ${errors.join(' | ')}`);
  check(external.length === 0, `${name}: no third-party requests ${external.join(', ')}`);
  const inlineStyles = await page.evaluate(() => document.querySelectorAll('style:not([data-vite-dev-id])').length);
  check(inlineStyles === 0, `${name}: no <style> elements`);
  await browser.close();
  return { pdfText: body, expected };
}

// ---------- admin ----------
// The dashboard makes the client ID from the firm name.
const ADMIN_CLIENT = { clientId: 'smoke-admin-advisors', firmName: 'Smoke Admin Advisors' };

async function adminFlow() {
  const name = 'E-admin';
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const axe = async (label) => {
    await page.waitForTimeout(250);
    const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    const v = r.violations.map((x) => `${x.id} (${x.nodes.length})`);
    check(v.length === 0, `${name}: axe clean on ${label}${v.length ? `: ${v.join(', ')}` : ''}`);
  };
  const readCode = async () => (await page.textContent('[data-code]')).trim();
  const clientUrl = `${BASE}/admin/#/clients/${ADMIN_CLIENT.clientId}`;

  // ---------- clients: create, or issue a new code if an earlier run made it ----------
  await page.goto(`${BASE}/admin/`);
  await page.waitForSelector('[data-list] .admin-table, [data-list] .findings-empty');
  check((await page.request.get(`${BASE}/admin/`)).headers()['content-security-policy'] === CSP, `${name}: admin page has the production CSP`);
  await axe('clients');
  let code;
  if (await page.locator(`.admin-table a[href="#/clients/${ADMIN_CLIENT.clientId}"]`).count()) {
    await page.goto(clientUrl);
    await page.waitForSelector('[data-new-code]');
    if (await page.locator('[data-delete-all]').count()) {
      await page.click('[data-delete-all]');
      await page.waitForSelector('text=Deleted');
    }
    await page.click('[data-new-code]');
    await page.waitForSelector('.code-panel');
    code = await readCode();
  } else {
    await page.fill('#firmName', ADMIN_CLIENT.firmName);
    check((await page.locator('#clientId').count()) === 0, `${name}: no client ID field to fill in`);
    await page.click('[data-create]');
    await page.waitForSelector('.code-panel');
    code = await readCode();
    check((await page.textContent('[data-new-client-id]')) === ADMIN_CLIENT.clientId, `${name}: client ID made from the firm name`);
    await axe('client created');
  }
  check(/^[A-HJKMNP-Z2-9]{5}(-[A-HJKMNP-Z2-9]{5}){3}$/.test(code), `${name}: access code shown once`);

  // ---------- the person completes it with that code ----------
  const person = await run('E-admin-person', { role: 'Owner or Principal', width: 1280, plan: PLANS.mixed, code, firm: ADMIN_CLIENT.firmName, realCompletion: true });

  // ---------- the record ----------
  // Reload: going to the same hash URL would not fetch the records again.
  await page.goto(clientUrl);
  await page.reload();
  const row = page.locator('tr[data-submission]', { hasText: 'Jordan Example' });
  await row.waitFor();
  check((await page.locator('tr[data-submission]').count()) === 1, `${name}: exactly one record stored`);
  const rowText = await row.textContent();
  check(rowText.includes('jordan@smoketest.example') && rowText.includes('Owner or Principal'), `${name}: record shows the person and role`);
  check(
    rowText.includes(String(person.expected.knowledge.score)) && rowText.includes(String(person.expected.readiness.score)),
    `${name}: record shows the server's scores`
  );
  await axe('client detail');

  const [download] = await Promise.all([page.waitForEvent('download'), row.locator('[data-download]').click()]);
  const file = join(OUT, `E-admin-${download.suggestedFilename()}`);
  await download.saveAs(file);
  const adminText = (await new PDFParse({ data: readFileSync(file) }).getText()).text.replace(/^-- \d+ of \d+ --$/gm, '');
  writeFileSync(`${file}.txt`, adminText);
  // Same report except the time: the person's copy is dated when they finished, the admin copy when
  // the record was saved.
  const undated = (t) => t.replace(/[A-Z][a-z]+ \d{1,2}, \d{4}( at)? \d{1,2}:\d{2}\s?[AP]M/g, '<when>').replace(/\s+/g, '');
  check(undated(adminText) === undated(person.pdfText), `${name}: admin PDF matches the person's PDF apart from the time`);

  // ---------- the record page the email links to ----------
  const id = await row.getAttribute('data-submission');
  await page.goto(`${BASE}/admin/#/submissions/${id}`);
  await page.waitForSelector('.admin-score');
  check((await page.textContent('h1')).includes(`Jordan Example, ${ADMIN_CLIENT.firmName}`), `${name}: record page title`);
  await axe('record page');

  // ---------- preview ----------
  await page.goto(clientUrl);
  await page.waitForSelector('[data-preview]');
  const [tab] = await Promise.all([context.waitForEvent('page'), page.click('[data-preview]')]);
  await tab.waitForSelector('.pv-banner');
  check((await tab.textContent('.pv-banner')).includes('Nothing is saved or sent'), `${name}: preview banner shows`);
  const answers = Object.fromEntries(bank.questions.map((q) => [q.id, 0]));
  const pv = await tab.request.post(`${BASE}/api/completion`, {
    data: { ...completionPayload({ name: 'Preview Person', email: 'p@advisordefense.com', role: 'CSIRT Lead' }, bank, answers), turnstileToken: 't' },
    headers: { Origin: BASE },
  });
  check(pv.status() === 200 && (await pv.json()).preview === true, `${name}: preview completion is skipped by the server`);
  await tab.close();
  await page.reload();
  await page.waitForSelector('tr[data-submission]');
  check((await page.locator('tr[data-submission]').count()) === 1, `${name}: preview stored no record`);

  // ---------- activity log ----------
  await page.goto(`${BASE}/admin/#/audit`);
  await page.waitForSelector('[data-log] .admin-table');
  const log = await page.textContent('[data-log]');
  for (const action of ['Downloaded a PDF report', 'Previewed as the client', 'Viewed a record']) {
    check(log.includes(action), `${name}: activity log has "${action}"`);
  }
  await axe('activity log');

  check(errors.length === 0, `${name}: no console errors ${errors.join(' | ')}`);
  await browser.close();
}

// ---------- unauthenticated ----------
async function unauthenticated() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const req = context.request;
  // Nothing from reference/ ships, and no _routes.json can exempt paths from the middleware.
  const shipped = readdirSync('dist', { recursive: true }).map(String);
  check(!shipped.some((f) => /reference|RegS-P-main|\.docx$|irp-template/i.test(f)), 'build: nothing from reference/ in dist');
  check(!shipped.includes('_routes.json'), 'build: no _routes.json in dist');
  check(!shipped.some((f) => f.startsWith('src')), 'build: no source files in dist');

  const html = readFileSync('dist/index.html', 'utf8');
  const bundle = html.match(/src="(\/assets\/[^"]+\.js)"/)[1];
  const css = html.match(/href="(\/assets\/[^"]+\.css)"/)?.[1];

  const asset = await req.get(`${BASE}${bundle}`, { maxRedirects: 0 });
  check(asset.status() === 401, `unauth: bundle with the question bank blocked (${asset.status()})`);
  check(!(await asset.text()).includes('notice_deadline'), 'unauth: no question content in the response');
  if (css) check((await req.get(`${BASE}${css}`, { maxRedirects: 0 })).status() === 401, 'unauth: app stylesheet blocked');
  const page = await req.get(`${BASE}/`, { maxRedirects: 0, headers: { Accept: 'text/html' } });
  check(page.status() === 302 && page.headers().location === '/login/', 'unauth: app page redirects to /login/');
  check((await req.get(`${BASE}/api/client`, { maxRedirects: 0 })).status() === 401, 'unauth: /api/client is 401');
  check((await req.post(`${BASE}/api/completion`, { data: {}, headers: { Origin: BASE } })).status() === 401, 'unauth: /api/completion is 401');
  check((await req.get(`${BASE}/login/`)).status() === 200, 'unauth: sign-in page is public');
  check((await req.get(`${BASE}/login/`)).headers()['content-security-policy'] === CSP, 'unauth: sign-in page has the production CSP');

  // A wrong code: generic message, no session.
  const p = await context.newPage();
  await p.route(TURNSTILE_JS, (r) => r.fulfill({ status: 200, headers: { 'content-type': 'text/javascript' }, body: FAKE_TURNSTILE }));
  await p.goto(`${BASE}/login/`);
  await p.fill('#code', 'WRONG-WRONG-WRONG-WRONG');
  await p.click('[data-submit]');
  await p.waitForSelector('#code-error:not([hidden])');
  const msg = await p.textContent('#code-error');
  check(/could not sign you in/.test(msg) && !/expired|unknown|exist/i.test(msg), 'unauth: wrong code gets the generic message');
  check(p.url() === `${BASE}/login/`, 'unauth: wrong code stays on sign-in');
  const r = await new AxeBuilder({ page: p }).withTags(AXE_TAGS).analyze();
  check(r.violations.length === 0, `unauth: axe clean on sign-in error state ${r.violations.map((v) => v.id).join(', ')}`);
  const cookies = await context.cookies();
  check(!cookies.some((c) => /irp_session$/.test(c.name)), 'unauth: no session cookie after a wrong code');
  await browser.close();
}

await unauthenticated();
await run('A-csirt-desktop-keyboard', { role: 'CSIRT Lead', width: 1280, keyboard: true, plan: PLANS.mixed, zoomCheck: true, again: true });
await run('B-cco-phone', { role: 'Chief Compliance Officer', width: 390, plan: PLANS.best, completionStatus: 502 });
await run('C-operations-320', { role: 'Operations', width: 320, plan: PLANS.worst });
await run('D-secondary-desktop-keyboard-forced', { role: 'Secondary Lead', width: 1280, keyboard: true, plan: PLANS.twoWrong, forcedColors: true, reducedMotion: true });
await adminFlow();

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

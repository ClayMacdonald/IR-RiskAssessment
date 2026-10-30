// End-to-end click-through: landing, details, 14 questions, results, gate, PDF.
// Usage: node tests/smoke.mjs [baseUrl] [screenshotDir]
// With SMOKE_CSP=1, applies the CSP from public/_headers to every response so violations surface as errors.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFParse } from 'pdf-parse';

const BASE = process.argv[2] || 'http://localhost:5173';
const OUT = process.argv[3] || 'smoke-output';
mkdirSync(OUT, { recursive: true });

// Lead notification mocks. The page loads Turnstile from this URL; the test serves a stand-in that
// issues a fixed token, so no request reaches Cloudflare. /api/lead is answered by the test too.
const TURNSTILE_JS = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const FAKE_TURNSTILE = `window.turnstile = {
  _w: {}, _n: 0,
  render(el, o) { const id = 'w' + (++this._n); this._w[id] = o; window.__tsOptions = o; return id; },
  reset() {},
  execute(id) { const o = this._w[id]; setTimeout(() => o.callback('fake-token-' + id), 30); },
  remove() {},
};`;

const CSP = readFileSync('public/_headers', 'utf8').match(/Content-Security-Policy: (.+)/)[1].trim();
const BANNED = [/—/, /–/, /--/, /\bcompliant\b/i, /\bcertified\b/i, /\bpass(ed|es|ing)?\b/i];
// The fact card "There is no certification and no pass" is intentional copy approved by the client.
const ALLOWED = [/no certification and no pass/i, /No certificate, no pass/i, /Compliance dates have passed/i];

let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
}

function bannedHits(text) {
  let t = text;
  ALLOWED.forEach((re) => (t = t.replace(new RegExp(re.source, 'gi'), '')));
  return BANNED.filter((re) => re.test(t)).map(String);
}

async function run(name, { aum, examined, answers, keyboard, width, leadStatus = 200 }) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const external = [];
  const leads = [];
  let turnstileLoads = 0;
  // Vite dev HMR websocket messages are dev server noise, not app errors.
  const devNoise = /WebSocket|\[vite\]|Vite server/;
  page.on('console', (m) => m.type() === 'error' && !devNoise.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url === TURNSTILE_JS) {
      turnstileLoads++;
      const headers = { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' };
      return route.fulfill({ status: 200, headers, body: FAKE_TURNSTILE });
    }
    if (url === `${BASE}/api/lead`) {
      leads.push({ method: route.request().method(), headers: route.request().headers(), body: route.request().postDataJSON() });
      return route.fulfill({ status: leadStatus, contentType: 'application/json', body: JSON.stringify({ ok: leadStatus === 200 }) });
    }
    if (!url.startsWith(BASE)) {
      external.push(url);
      return route.abort();
    }
    const response = await route.fetch();
    const headers = { ...response.headers() };
    // Vite dev injects inline styles, so CSP is enforced only against the production build (npm run preview).
    if (process.env.SMOKE_CSP === '1') headers['content-security-policy'] = CSP;
    await route.fulfill({ response, headers });
  });

  // Short wait so the 180ms screen fade-in has finished before capturing.
  const shot = async (label) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, `${name}-${label}.png`), fullPage: true });
  };

  await page.goto(BASE);
  await page.waitForSelector('h1');
  check((await page.textContent('h1')) === 'Reg S-P Readiness Score', `${name}: landing H1`);
  check((await page.locator('.fact-card').count()) === 3, `${name}: three fact cards`);
  await shot('1-landing');
  await page.click('[data-start]');

  // Details
  check(await page.isDisabled('[data-next]'), `${name}: Continue disabled until complete`);
  await page.fill('#firmName', 'Example Wealth Partners');
  await page.fill('#name', 'Jordan Example');
  await page.selectOption('#aum', aum);
  check(await page.isDisabled('[data-next]'), `${name}: Continue still disabled with exam question blank`);
  await page.selectOption('#examined', examined);
  await shot('2-details');
  await page.click('[data-next]');

  // Questions
  for (let i = 0; i < answers.length; i++) {
    await page.waitForSelector(`.q-counter >> text=Question ${i + 1} of ${answers.length}`);
    check(await page.isDisabled('[data-next]'), `${name}: Q${i + 1} Next disabled before answer`);
    const help = (await page.textContent('.question-help')) || '';
    check(help.startsWith('Why this matters: ') && help.length > 30, `${name}: Q${i + 1} shows a Why this matters line`);
    if (keyboard) {
      // Focus starts on the first option. Arrow down to the target, which selects it, then Enter twice advances.
      for (let k = 0; k < answers[i]; k++) await page.keyboard.press('ArrowDown');
      if (answers[i] === 0) await page.keyboard.press('Enter');
      const checked = await page.locator('.option[aria-checked="true"]').count();
      check(checked === 1, `${name}: Q${i + 1} selected with keyboard`);
      await shot(`3-question-${String(i + 1).padStart(2, '0')}`);
      await page.keyboard.press('Enter');
    } else {
      await page.locator('.option').nth(answers[i]).click();
      await shot(`3-question-${String(i + 1).padStart(2, '0')}`);
      if (i === answers.length - 1) {
        check((await page.textContent('[data-next]')).trim() === 'See my score', `${name}: last button reads See my score`);
      }
      await page.click('[data-next]');
    }
  }

  // Results
  await page.waitForSelector('.score-ring');
  await page.waitForTimeout(900); // let the score ring and bars finish animating before the screenshot
  await shot('4-results');
  const results = {
    h1: await page.textContent('h1'),
    score: parseInt((await page.getAttribute('.score-ring', 'aria-label')).match(/Overall score (\d+)/)[1], 10),
    band: (await page.textContent('.badge')).trim(),
    body: await page.textContent('main'),
    findings: await page.locator('.finding').count(),
    examNote: await page.locator('.callout-exam').count(),
    locked: await page.locator('.finding-locked').count(),
    lockCard: await page.locator('.lock-card').count(),
    titlesVisible: await page.locator('.finding h3').allInnerTexts(),
  };
  // Review the results layout at every breakpoint, then return to the run's width.
  results.geometry = {};
  for (const w of [768, 1024, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    await shot(`4-results-${w}`);
    // Layout checks: the badge stays left of the section divider, and the lock card is centered on the findings.
    results.geometry[w] = await page.evaluate(() => {
      const box = (sel) => document.querySelector(sel)?.getBoundingClientRect();
      const badge = box('.score-main .badge');
      const sections = box('.score-sections');
      const wrap = box('.findings-wrap.is-locked');
      const card = box('.lock-card');
      return {
        badgeClear: badge.right <= sections.left || badge.bottom <= sections.top,
        lockOffset: wrap && card ? Math.abs(wrap.left + wrap.width / 2 - (card.left + card.width / 2)) : 0,
        lockVOffset: wrap && card ? Math.abs(wrap.top + wrap.height / 2 - (card.top + card.height / 2)) : 0,
      };
    });
  }
  await page.setViewportSize({ width, height: 900 });
  // Use the lock card's button when present, so it is exercised too.
  await page.click(results.lockCard ? '[data-unlock]' : '[data-report]');

  // Gate
  check((await page.inputValue('#leadName')) === 'Jordan Example', `${name}: gate name prefilled`);
  const notice = (await page.textContent('.lead-notice')) || '';
  check(/name, work email, role, firm name and score are sent to AdvisorDefense/.test(notice), `${name}: gate discloses what is sent`);
  check(bannedHits(notice).length === 0, `${name}: gate notice copy clean`);
  await page.fill('#email', 'not-an-email');
  await page.selectOption('#role', 'CCO');
  check(await page.isDisabled('[data-submit]'), `${name}: submit disabled with invalid email`);
  await page.fill('#email', 'jordan@examplewealth.com');
  await shot('5-gate');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-submit]')]);
  const pdfPath = join(OUT, `${name}-${download.suggestedFilename()}`);
  await download.saveAs(pdfPath);
  await page.waitForSelector('.notice-success');
  // Download again must not send a second notification.
  const [again] = await Promise.all([page.waitForEvent('download'), page.click('[data-again]')]);
  check(Boolean(again), `${name}: download again works`);
  await page.waitForTimeout(300);

  const parser = new PDFParse({ data: readFileSync(pdfPath) });
  // Drop the page separators pdf-parse inserts ("-- 1 of 5 --"), which are not PDF content.
  const pdfText = (await parser.getText()).text.replace(/^-- \d+ of \d+ --$/gm, '');
  await parser.destroy();
  writeFileSync(join(OUT, `${name}-pdf.txt`), pdfText);

  // After the download, going back to results shows the findings unlocked.
  await page.click('[data-back]');
  await page.waitForSelector('.score-ring');
  results.lockedAfter = await page.locator('.finding-locked').count();
  results.lockCardAfter = await page.locator('.lock-card').count();
  await shot('6-results-unlocked');

  // In the failure run the browser logs the deliberate /api/lead error status. Nothing else is allowed.
  const unexpected = errors.filter((e) => !(leadStatus !== 200 && e.includes(`status of ${leadStatus}`)));
  check(unexpected.length === 0, `${name}: no console errors or CSP violations ${unexpected.length ? JSON.stringify(unexpected) : ''}`);
  check(external.length === 0, `${name}: no external requests ${external.length ? JSON.stringify(external) : ''}`);
  check(turnstileLoads === 1, `${name}: Turnstile script loaded once (got ${turnstileLoads})`);
  check(leads.length === 1, `${name}: exactly one lead notification (got ${leads.length})`);
  const lead = leads[0] || { body: {}, headers: {} };
  check(lead.method === 'POST' && /application\/json/.test(lead.headers['content-type'] || ''), `${name}: lead is a JSON POST`);
  check(
    JSON.stringify(Object.keys(lead.body).sort()) === JSON.stringify(['email', 'firmName', 'name', 'role', 'score', 'turnstileToken']),
    `${name}: lead sends only name, email, role, firm, score and token (got ${Object.keys(lead.body)})`
  );
  check(lead.body.name === 'Jordan Example' && lead.body.email === 'jordan@examplewealth.com' && lead.body.role === 'CCO' &&
    lead.body.firmName === 'Example Wealth Partners', `${name}: lead fields match the form`);
  check(String(lead.body.turnstileToken).startsWith('fake-token-'), `${name}: lead carries the Turnstile token`);
  const opts = await page.evaluate(() => window.__tsOptions && { action: window.__tsOptions.action, appearance: window.__tsOptions.appearance, sitekey: window.__tsOptions.sitekey });
  check(opts && opts.action === 'lead' && opts.appearance === 'interaction-only' && Boolean(opts.sitekey), `${name}: Turnstile rendered with action lead, interaction-only`);
  await browser.close();
  return { results, pdfText, pdfPath, lead };
}

// Run A: small firm, exam Yes, mixed answers by mouse at phone width.
const a = await run('A-small-mobile', {
  aum: '$100M to $500M',
  examined: 'Yes',
  answers: [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1],
  keyboard: false,
  width: 375,
});
check(a.results.h1 === 'Example Wealth Partners: Reg S-P Readiness Score', 'A: results H1 uses firm name');
// Sections: IRP 5/8 (63%), Notification 3/6, Vendors 4/8, Safeguards 3/6. Average 53.1.
check(a.results.score === 53, `A: overall score 53 (got ${a.results.score})`);
check(a.lead.body.score === 53, 'A: lead score matches results');
check(a.results.band === 'High exposure', 'A: band High exposure');
check(a.results.body.includes('June 3, 2026'), 'A: compliance date June 3, 2026');
check(a.results.findings === 3, 'A: three findings');
check(a.results.body.indexOf('Practice run') < a.results.body.indexOf('Deciding not to notify') &&
  a.results.body.indexOf('Deciding not to notify') < a.results.body.indexOf('Vendor due diligence'), 'A: findings are lowest score, question order');
check(a.results.examNote === 1, 'A: exam comparison note shown');
check(a.results.locked === 3 && a.results.lockCard === 1, 'A: finding details locked behind one lock card');
check(a.results.titlesVisible.join('|') === 'Practice run|Deciding not to notify|Vendor due diligence', 'A: finding titles stay readable');
check(a.results.lockedAfter === 0 && a.results.lockCardAfter === 0, 'A: findings unlock after the report downloads');
check(bannedHits(a.results.body).length === 0, `A: results copy clean ${bannedHits(a.results.body)}`);
for (const s of ['Example Wealth Partners', 'Jordan Example, CCO', 'June 3, 2026', '56', 'High exposure',
  'Incident Response Plan 63%', 'Safeguards and Records 50%', 'YOUR ANSWER', 'LIKELY EXAM FINDING',
  'Related AdvisorDefense service:', 'Next steps', 'Compare these findings', 'not a determination of regulatory compliance',
  'Page 1 of', '(800) 456-5357', 'Sales@AdvisorDefense.com', 'Confidential. Prepared for Example Wealth Partners']) {
  check(a.pdfText.replace(/\s+/g, ' ').includes(s), `A: PDF contains "${s}"`);
}
check((a.pdfText.match(/YOUR ANSWER/g) || []).length === 14, 'A: PDF lists all 14 answers');
check(bannedHits(a.pdfText).length === 0, `A: PDF copy clean ${bannedHits(a.pdfText)}`);

// Run B: large firm, no exam, all best answers by keyboard at desktop width.
const b = await run('B-large-desktop', {
  aum: '$1.5B or more',
  examined: 'No',
  answers: Array(14).fill(0),
  keyboard: true,
  width: 1280,
});
check(b.results.score === 100, `B: overall score 100 (got ${b.results.score})`);
check(b.results.band === 'Exam-ready', 'B: band Exam-ready');
check(b.results.body.includes('December 3, 2025'), 'B: compliance date December 3, 2025');
check(b.results.findings === 0, 'B: no findings');
check(b.results.lockCard === 0, 'B: no lock card when there are no findings');
check(b.results.examNote === 0, 'B: no exam comparison note');
check(b.pdfText.includes('No gap noted'), 'B: PDF notes no gaps');

for (const [w, g] of Object.entries(a.results.geometry)) {
  check(g.badgeClear, `A: band badge clear of section divider at ${w}px`);
  check(g.lockOffset <= 2 && g.lockVOffset <= 2, `A: lock card centered on findings at ${w}px (off by ${g.lockOffset.toFixed(1)}, ${g.lockVOffset.toFixed(1)})`);
}

// Run C: the longest band label ("Gaps an examiner would note"), where the badge used to overlap the divider.
const c = await run('C-gaps-desktop', {
  aum: '$500M to $1.5B',
  examined: 'An exam is underway now',
  answers: [0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0],
  keyboard: false,
  width: 1280,
  leadStatus: 502,
});
check(c.lead.body.score === 79, 'C: lead score matches results');
check(c.pdfText.includes('Example Wealth Partners'), 'C: report still downloads when the notification fails');
// Sections: IRP 6/8, Notification 5/6, Vendors 6/8, Safeguards 5/6. Average 79.2.
check(c.results.score === 79, `C: overall score 79 (got ${c.results.score})`);
check(c.results.band === 'Gaps an examiner would note', 'C: band Gaps an examiner would note');
check(c.results.examNote === 1, 'C: exam underway shows comparison note');
for (const [w, g] of Object.entries(c.results.geometry)) {
  check(g.badgeClear, `C: band badge clear of section divider at ${w}px`);
  check(g.lockOffset <= 2 && g.lockVOffset <= 2, `C: lock card centered on findings at ${w}px`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

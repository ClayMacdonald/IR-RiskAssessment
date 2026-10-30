# IRP and Reg S-P Readiness Assessment: Build Plan

This plan becomes `docs/plan.md` as the first commit after approval.

## Context

AdvisorDefense delivers a written IRP to each Incident Response Risk Assessment client and reviews it every year. Nothing today shows that the client's people actually know the IRP, or ties the IRP to amended Reg S-P (17 CFR 248.30, Release 34-100155). This tool does both in one gated flow. Every question shows the IRP section it tests and the Reg S-P requirement that section satisfies. The PDF becomes a dated training and readiness record for the client's compliance file, and is re-run at each annual review.

Base: the public Reg S-P Readiness Score app (`RegS-P-main.zip`). Source of truth for "the firm's IRP": `Incident_Response_Plan_2026_XXXXXXXX.docx` (v1.0, sections 1 to 4, Appendices A to F).

Decisions taken: default access-control pattern (no Tabletop repo); domain `irp.advisordefense.com`; IRP extraction by a dependency-free Node script (Python is broken on this machine, pandoc not installed).

## Inputs and reference handling

- Copy the zip contents to `reference/RegS-P-main/` and the .docx to `reference/`. Add `reference/` to `.gitignore`. A build test asserts no file under `dist/` came from `reference/`.
- `scripts/extract-irp.mjs`: unzips `word/document.xml` with Node `zlib` (no deps), writes `reference/irp-template.md` with heading levels, list items and tables. Already proven read-only during planning.

## Architecture

Static Vite app (vanilla JS, jsPDF) on Cloudflare Pages, plus Pages Functions. Node 22. No framework, analytics, CDNs or third-party fonts. Answers live only in the in-memory `state` object (same as `src/state.js` today).

### Access control (default pattern)

- `functions/_middleware.js` runs on every request (no `_routes.json` exclusions; a test asserts none exists in `dist/`). Public allowlist only: `GET /login`, `/login/*` static files, `POST /api/login`, `/favicon.svg`. Everything else, including `/`, `/assets/*` (the bundle holding questions.json) and `/api/*`: HTML requests get a 302 to `/login`, other requests get 401 JSON.
- Login page is plain static files in `public/login/` (`index.html`, `login.css`, `login.js`), not part of the Vite graph, so the gated bundle never leaks. `login.css` carries only the tokens it needs; a unit test checks its hex values match `brand.css`.
- `ACCESS_CODES` secret: JSON `{ "<sha256 hex of code>": { "clientId", "firmName", "expires": "YYYY-MM-DD" } }`. Codes are 20 random base32 characters (about 100 bits), so plain SHA-256 is sufficient; PBKDF2 adds nothing at that entropy. Lookup compares hashes in constant time across all entries. Expired codes rejected. One generic error message.
- `POST /api/login`: origin check, JSON, size cap, Turnstile (`action: login`), then sets `__Host-irp_session` = `base64url(payload).HMAC-SHA256(SESSION_SECRET)`; payload `{ cid, exp }` only; `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`. Constant-time signature check. `POST /api/logout` clears it.
- Middleware re-checks the code's own `expires` on each request (via `clientId` lookup) so expiring a code ends live sessions. It sets `context.data.clientId` for downstream Functions.
- Rate limiting: Cloudflare rule on `POST /api/login` documented in README. [VERIFY] the zone's plan allows another rule alongside the Reg S-P `/api/lead` rule (Free plan permits one).
- `scripts/add-client.mjs <clientId> "<Firm Name>" <YYYY-MM-DD>`: prints the code once and the JSON entry to merge into the secret.
- README section: switching to Cloudflare Access (one-time PIN, policy per client email domain), and what to delete from the middleware if we do.
- Shared helpers in `functions/_lib/` (session sign/verify, `reply()` and `clean()` lifted from `functions/api/lead.js`, Turnstile verify).

### Per-client tailoring (minimum build)

- `src/content/clients/<clientId>.json`: optional overrides for `facts` (CSIRT role titles, criticality times and cadence, carrier name, IRP version and date), `hide: [questionIds]`, `add: [questions]`.
- Overrides must not ship in the shared bundle (one client would see another's). `scripts/build-clients.mjs` (prebuild) compiles them into `functions/_lib/clients.generated.js`. `GET /api/client` returns only the session client's override plus `firmName` from `ACCESS_CODES`. The app merges it over defaults after load. Question text uses `{{placeholders}}` (e.g. `{{level1Response}}`) resolved from `facts`, so a tailored response time flows into question, options and explanation together.
- Ship with no client files. README documents the format.

## Reuse vs change from the Reg S-P app

| Keep as is | Adapt | New |
|---|---|---|
| `brand.css`, `base.css`, `components.css`, `logo.js`, `brand/`, `icons.js`, `scoreRing.js`, `optionCards.js`, `footer.js`, `header.js`, `util.js`, `vite.config.js`, `_headers` CSP, design-spec tokens and QA checklist | `stepper.js` (Details / Assessment / Results), `scoring.js` (two types, routing), `state.js`, `details.js` (role, email; firm prefilled), `question.js` (no feedback for knowledge items), `results.js` (two scores, crosswalk, findings unlocked: no lead gate), `gate.js` becomes the report screen (no lock; disclosure + download), `lead.js` to `completion.js`, `functions/api/lead.js` to `functions/api/completion.js`, `pdf.js`, `smoke.mjs`, `content.test.mjs`, README | `_middleware.js`, `api/login.js`, `api/logout.js`, `api/client.js`, `public/login/*`, `scripts/*`, `src/content/clients/`, `docs/*` |

Removed: AUM and "examined" fields, compliance-date logic, landing sales copy and facts (replaced by a short gated intro), "Book a review" CTAs become a quiet contact line (clients are already engaged).

## Content model

`questions.json` extends the Reg S-P schema: `type` (`readiness` | `knowledge`), `audience` (`csirt` | `staff`), `irp_ref`, `regsp_ref` (or `"none: <reason>"`), `tie_in`, `mapped_service`. Knowledge: 4 options, exactly one `correct: true`, `explanation`. Readiness: points 2/1/0, `exam_finding`. Option order is shuffled per session for knowledge items (deterministic seed so Back keeps order). `sections[]` also carries `irp_sections` and `regsp_requirement` for the crosswalk.

Roles on details: CCO, Owner or Principal, CSIRT Lead, Secondary Lead, Operations map to `csirt`; Supervised Person (staff) maps to `staff`.

`config.json` adds `irpVersion` ("2026 template v1.0"), `knowledgeBands` (90 / 70), title band text, contact (`(800) 456-5357`, `Sales@AdvisorDefense.com`, per sources.md item 16; confirm a Support line instead?).

### Question outline (draft about 32; staff path 11; K = knowledge, R = readiness; S = also staff)

1. **Roles and Readiness** (IRP 2.3, App D, App E): K/S report to the CSIRT; K/S honest mistakes are excusable, failing to report is the violation (2.3.2); K both leads unavailable: any member leads, logged (App D); K AdvisorDefense is an embedded CSIRT member (App D); K CSIRT list lives in App D; R CSIRT names and contacts current; R tabletop in last 12 months with updates (Best practice per Release discussion of (a)(3)).
2. **Detection and Reporting** (2.1, 2.5, App E Q1, Q3, Q5, Q6): K/S misdirected email is an incident, if in doubt report; K/S report as soon as aware; K/S clicked a link: report, change password from a different trusted device; K/S forward suspicious email as an attachment; K vendor breach notice must go to the CSIRT (2.5).
3. **Assessment and Scoping** (2.2, 2.4, 3.3, 3.7): K Level 1: 60 minutes, hourly updates; K Level 2: 4 hours, every 2 hours; K Level 3: 48 hours, daily; K/S which data set is sensitive customer information (2.2 vs 248.30(d)(9)); R know which clients' data each system holds (adapts `data_location`).
4. **Containment and Evidence Preservation** (3.1, 3.2, 3.4 to 3.6, App E Q4, Q7, Q8): K/S do not power off or reimage, disconnect only when instructed; K/S never pay; K/S law enforcement only when CSIRT directs, except personal danger; K/S media: "not in a position to comment"; K no retaliation (3.4); K consider halting fund transfers (3.4); K disable log overwrite, protect snapshots (3.2); K carrier first, breach counsel via carrier, forensics through counsel (3.1, 3.6, App C; regsp_ref "none: insurance and privilege are not Reg S-P requirements"); R carrier hotline and policy terms known.
5. **Recovery and Post-Incident Review** (3.8, 3.10, App A): K after-action review for all incidents, held promptly after close; K heightened monitoring of all systems (smokescreen); R lessons learned documented and IRP updated; R IRP reviewed in last 12 months.
6. **Customer Notification** (2.6, 3.9.3, App F): K as soon as practicable, no later than 30 days after becoming aware ((a)(4)(iii)); K no-notice determination after reasonable investigation, basis documented ((a)(4)(i), 3.7); K Attorney General delay (Section 4 plus (a)(4)(iii)); R written process and owner (adapts `notice_clock`); R documented no-notice decisions (adapts `notice_no_notice`); R notice template checked against the rule (adapts `notice_ready`, cites App F).
7. **Service Provider Oversight** (2.7, App A vendor playbook): K vendor notice no later than 72 hours ((a)(5)(i)(B)); K vendor notice starts the firm's response and the firm stays responsible for notice ((a)(5)); R vendor inventory; R due diligence and monitoring; R 72-hour commitments (adapt `vendor_*`, reworded, not verbatim).
8. **Recordkeeping** (Section 3 intro, Section 4, App B): K what must be kept for a notification determination (basis, AG documentation, copy of notice; 275.204-2(a)(25)); K incident log kept in compliance files; R records producible on request (adapts `exam_evidence`).

Held out pending your decision: retention period question, notice-contents question, "notify everyone in the affected system" question (see discrepancies).

## Scoring and results

- Program Readiness: readiness items only, same math as `src/scoring.js` (section percent, average of sections that have readiness items, bands 85 / 60). Staff never see it.
- IRP Knowledge: percent correct of knowledge items shown to that person; bands from `config.json`: 90+ "Ready to respond", 70 to 89 "Refresher recommended", below 70 "Retraining needed".
- Results: two score cards side by side (one for staff); crosswalk table (section, IRP section, Reg S-P requirement, readiness %, knowledge x of y); findings grouped by section (lowest readiness answers, then every missed knowledge item with correct answer, explanation, irp_ref, regsp_ref).
- PDF (`src/pdf.js` layout rules kept): band "IRP AND REG S-P READINESS REPORT"; name, role, firm, completed date and time, IRP version; both scores and bands; crosswalk; every question with person's answer and the correct answer; findings; next steps; contact; disclaimer; footer "Confidential. Prepared for {Firm}." and "Page X of Y".

## Completion notification

`functions/api/completion.js` from `lead.js`: same origin, JSON, 4 KB cap, Turnstile (`action: completion`), escaping, Resend, outcome-only logs. Requires a valid session; `clientId` from `context.data`, never the body. Body: name, work email, role, readiness score or null, knowledge score, section scores, missed question IDs (validated against the known ID list). Disclosure line before download names exactly those fields. Sent once per visit, fire-and-forget; PDF never waits on it.

## Accuracy work

- `src/content/sources.md`: same format and statuses. Reuse Verified rows from the Reg S-P log (items 6, 7, 8, 10, 11, 13, 19, 21, 22). Re-check each against Release 34-100155 and eCFR during the content step; anything not re-opened is [VERIFY].
- `docs/irp-template-discrepancies.md`, found so far:
  1. **Retention.** IRP Section 4: "On-site for 2 years, easily accessible for a total of 6 years", cites Rule 204-2(a). Reg S-P app source log (item 13, Verified): five years, first two easily accessible (275.204-2(a)(25), 204-2(e)). Recommend: "five years from the end of the fiscal year of the last entry, the first two in an appropriate office". Re-verify on eCFR.
  2. **Notice contents.** IRP 3.9.1 uses GDPR terms ("data protection officer", "controller", "data subjects") and omits rule elements ((a)(4)(iv): date or range, account review, fraud alerts, credit reports, FTC and usa.gov guidance). App F covers most but not usa.gov. Recommend replacing the four bullets with the (a)(4)(iv) list.
  3. **30-day trigger wording.** App A Data Breach: "no later than 30 days after determining". Rule and IRP 2.6: "after becoming aware". Recommend App A match 2.6.
  4. **Unidentifiable individuals.** IRP is silent on notifying everyone in the affected system ((a)(4)(ii)). Gap, not conflict. Recommend one sentence in 2.6.
  5. **72-hour wording.** IRP 2.7: "within 72 hours". Rule: "as soon as possible, but no later than 72 hours". Also frames it as the provider's duty to "comply with Reg S-P" rather than the firm's oversight duty. Low severity; I plan to keep the question citing 2.7 with rule wording unless you say otherwise.
  6. **Adoption date.** IRP 2.6: "May 15, 2024". Release 34-100155 is dated May 16, 2024. [VERIFY].
  7. **Numbering.** The TOC shows 1 to 4 with subsections and Appendices A to F, but the "INTRODUCTION" heading has numbering switched off in the XML while its subsections show 1.1 to 1.3. The TOC may be stale. Need a visual check in Word. Cross-references in text ("Section 3", Appendices B, D, E, F) are consistent.
  8. **Annual review.** The IRP has a revision history but no statement that it is reviewed annually. The service promises it. Recommend adding it to Document Information.
  9. **Personal name.** App C lists an AdvisorDefense individual's name and phone. Questions use role titles only.

## Tests

- Unit (`node --test`): middleware (no cookie, bad signature, expired session, expired code, valid flow, `/assets/*` blocked before login, allowlist works); login (hash match, generic error, Turnstile mocked, cookie flags); completion (clientId from session, body clientId ignored, validation, Turnstile and Resend mocked); content schema and copy lint (dashes, banned words incl. compliant, certified, pass, fail; required refs; exactly one correct; 2/1/0); scoring both types; audience routing; client override merge; login.css token parity.
- Smoke (Playwright, run against `wrangler pages dev dist` with `.dev.vars` test secrets so the real middleware runs): login with test code; CSIRT and Staff paths at 390px and 1280px; keyboard-only run; PDF text contains crosswalk and scores; exactly one completion per visit; report downloads when completion returns 502; unauthenticated `/assets/*.js` returns 401; production CSP enforced; axe on every screen state.
- New dev dependencies: `wrangler` (local Functions), `@axe-core/playwright`. Nothing new at runtime.

## Build order and commits

1. `docs/plan.md`, scaffold copy, renames, `.gitignore`, extraction script and `reference/irp-template.md`.
2. Access control (middleware, login, logout, session lib, login page, add-client script) plus its tests.
3. Content schema, `sources.md`, discrepancies doc, draft bank, `npm run review:export` producing `docs/question-review.md`.
4. Scoring and routing; client override plumbing.
5. Screens; results and crosswalk.
6. PDF.
7. Completion notification.
8. Remaining tests, README (env var and secret table, key rotation for Resend, Turnstile, SESSION_SECRET and access codes, zone exclusions, Cloudflare Access switch), `docs/roadmap.md`.

## Env vars and secrets (README table)

`ACCESS_CODES`, `SESSION_SECRET`, `TURNSTILE_SECRET_KEY`, `VITE_TURNSTILE_SITE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `COMPLETION_NOTIFY_EMAIL`, `ALLOWED_ORIGINS` (default `https://irp.advisordefense.com,https://<project>.pages.dev`), `NODE_VERSION=22`.

## Verification

- `npm run test:unit` and `npm run test:smoke` (both paths, both widths, keyboard, CSP build) all green.
- Design-spec QA checklist: axe each state, keyboard run, 320px, 200% zoom, forced colors, reduced motion, no `style=""` in HTML strings, copy lint.
- `curl` against `wrangler pages dev`: `/assets/index-*.js` without cookie returns 401; `/` redirects to `/login`.
- Manual: open the PDF and confirm crosswalk, scores, footer and IRP version.

## Open questions for you (non-blocking; defaults in parentheses)

1. Contact line in the app and PDF: Sales line from the Reg S-P app, or Support@AdvisorDefense.com? (Support, since these are engaged clients.)
2. Discrepancy 5 (72-hour wording): keep the question? (Keep.)
3. Rate limiting rule capacity on the zone's plan. (I document it; you confirm in the dashboard.)
4. Should results show "Book a review"? (No; quiet contact line only.)

# AdvisorDefense IRP and Reg S-P Readiness Assessment

A password-protected assessment for AdvisorDefense clients at `irp.advisordefense.com`. It does two things in one flow:

- **IRP knowledge check.** Does the firm's CSIRT know what its written Incident Response Plan says and what to do?
- **Reg S-P readiness check.** Does the firm's program meet amended Regulation S-P (17 CFR 248.30, Release No. 34-100155)?

Every question shows the IRP section it tests and the Reg S-P requirement that section satisfies, so the client sees that their IRP is how they meet Reg S-P. It supports the **Incident Response Risk Assessment** service: run it after the IRP is delivered, and again at each annual IRP review. The PDF is a dated training and readiness record for the client's compliance file.

It is for CSIRT members and firm leadership only: 15 questions (8 IRP knowledge, 7 program readiness), about 10 minutes. There is no staff path.

Answers stay in the browser, in memory only, until the person downloads their report. Then the name, work email, role and answers are saved for AdvisorDefense for six years, scored on the server, and AdvisorDefense gets an email with a dashboard link (see [Completed assessments](#completed-assessments)). The PDF is built on the device. No analytics, trackers or third-party fonts. The only third-party request is Cloudflare Turnstile.

Built from the Reg S-P Readiness Score app (`regsp.advisordefense.com`): same stack, design system, PDF engine, headers and copy rules. See `docs/plan.md` for the build plan and `docs/design-spec.md` for the design system.

## Before launch

1. Review and sign off every question in `docs/question-review.md` (regenerate with `npm run review:export`; your marks are kept).
2. Decide each item in `docs/irp-template-discrepancies.md`. Three questions are held out until you do.
3. Clear the `[VERIFY]` items in `src/content/sources.md`.

## Run locally

Requires Node 22.13 or later (the unit tests use the built-in `node:sqlite`).

```
npm install
npm run dev:setup      # once: creates .dev.vars and prints your local access code
npm run dev            # starts the API (port 8799) and Vite (port 5173) together
```

Open http://localhost:5173 and sign in with the code `dev:setup` printed. Lost it? Run `npm run dev:setup` again for a new one (your other settings are kept).

`npm run dev` runs two labeled processes in one terminal:

- `[api]`: the Pages Functions (sign-in, session, `/api/client`, `/api/completion`) in Wrangler on 127.0.0.1:8799, with secrets from `.dev.vars`.
- `[vite]`: the app with live reload on localhost:5173. Vite forwards `/api/*` to the API and starts only once the API answers. If either process stops with an error, both stop.

For debugging, run them separately with `npm run dev:api` and `npm run dev:vite`. If Vite runs without the API, `/api/*` returns 502 with `API server not running, use npm run dev`, and the terminal shows one line instead of a stack trace.

What is different locally (all set in `.dev.vars` by `dev:setup`; production does not change):

- `LOCAL_DEV=1` skips Turnstile verification and names the session cookie `irp_session` without `Secure`, so it works over plain http (Safari rejects Secure cookies on http://localhost). It is ignored unless every `ALLOWED_ORIGINS` entry is http localhost or 127.0.0.1, so it can never take effect in production.
- `RESEND_API_KEY=re_local_dev_dummy` means completion notices are never sent. The API logs `dry_run_would_send` (no personal data) and returns 200.
- `.env.development` holds Cloudflare's public Turnstile test site key, so the report screen's disclosure shows in dev.
- Vite serves files without the access gate. Only the Pages runtime enforces it. To check the real gate and CSP, use `npm run build` and `npm run pages` (the production build plus Functions on http://127.0.0.1:8799).

Ports live in `scripts/dev-ports.mjs`. Set `DEV_API_PORT` to move the API, then rerun `npm run dev:setup` so `ALLOWED_ORIGINS` matches.

## Tests

```
npm run test:unit
```

Node's test runner, no network. Covers the middleware and sessions (including local dev mode), sign-in, the completion Function (Turnstile and Resend mocked, plus the dry run), the content schema and copy lint, scoring for both question types, roles, client overrides and the login page's copies of the design system.

```
npx playwright install chromium                                  # first time only
npm run dev:setup                                                # once, registers the smoke-test code
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run build
npm run pages                                                    # one terminal
npm run test:smoke                                               # another
```

The smoke test runs against the Pages runtime, so the access gate, the Functions and the CSP in `public/_headers` all apply. It signs in as four different CSIRT roles at 320px, phone and desktop widths (two runs keyboard only, one with forced colors and reduced motion), runs axe on every screen state, checks scores, the crosswalk and the PDF text, checks that exactly one completion notice is sent with only the disclosed fields, that the report still downloads when the notice fails, and that the bundle and APIs are blocked before sign-in. It uses the local secrets, so it runs in local dev mode; the production cookie and Turnstile paths are covered by the unit tests. Screenshots, PDFs and PDF text go to `smoke-output/` (git-ignored). The test serves a stand-in for the Turnstile script and answers `/api/completion` itself.

## Access control

`functions/_middleware.js` gates every request: HTML, JS, CSS, images and `/api/*`. Before sign-in, only the login page (`public/login/`), `POST /api/login`, `POST /api/logout` and the favicon are served. The JS bundle that holds the question bank is never served without a session. Pages get a redirect to `/login/`; everything else gets 401.

- **Access codes.** Each client gets a random 20-character code (about 99 bits). The `clients` table in D1 (binding `DB`, schema in `migrations/`) holds the SHA-256 hash of each code with the client ID, firm name, expiry, a code version and a revoked date. No plaintext codes exist in the repo, the database or the logs. The firm name prefills from the code. A code works through the end of its `expires` date (UTC) unless the client is revoked.
- **Sessions.** A valid code sets `__Host-irp_session`: `HttpOnly; Secure; SameSite=Strict; Path=/`, 8 hours or until the code expires, whichever is first. It carries only the client ID, code version and expiry, signed with HMAC-SHA256 (`SESSION_SECRET`). Every request rechecks the signature, the session expiry and the client's row in D1, so expiring, revoking or replacing a code ends live sessions at the next request.
- **Brute force.** Turnstile on the sign-in form, one generic error for every failure, and a rate limiting rule (below).
- **Caching.** Gated responses are `Cache-Control: private` so no shared cache can serve them to someone not signed in.

### Onboard a client

```
npm run add-client acme-wealth "Acme Wealth Partners" 2027-12-31
```

It prints the code once and the `wrangler d1 execute` command that adds the client to the production database (the SQL file holds only the code's hash). Then:

1. Run that command. The code works as soon as it finishes; no redeploy.
2. Delete the SQL file it names.
3. Send the code to the client separately from the link, for example by phone or a separate email.

To issue a new code for the same client, run the script again with the same `clientId`. The old code and every session made with it stop working. To revoke a client: `npx wrangler d1 execute irp-assessment --remote --command "UPDATE clients SET revoked_at = datetime('now') WHERE client_id = 'acme-wealth'"`.

### Rate limiting rule (dashboard)

Security, WAF, Rate limiting rules, Create rule on the `advisordefense.com` zone:

- If incoming requests match: Hostname equals `irp.advisordefense.com` AND URI Path equals `/api/login` AND Request Method equals `POST`
- Characteristics: IP. Rate: 10 requests per 1 minute. Action: Block for 10 minutes.

[VERIFY] The Free plan allows one rate limiting rule per zone. If the Reg S-P app's `/api/lead` rule already uses it, either combine both paths into one rule (URI Path is in `/api/login /api/lead`) or upgrade the plan.

### Switching to Cloudflare Access

If you would rather use email one-time PINs than access codes:

1. Zero Trust, Access, Applications, Add a self-hosted application for `irp.advisordefense.com`. Session duration 8 hours.
2. Add one policy per client: Include, Emails ending in `@clientdomain.com`. Login method: One-time PIN.
3. In `functions/_middleware.js`, replace the `currentClient()` check with a check of the `Cf-Access-Jwt-Assertion` header against your team's Access certificates, and map the email domain to a `clientId` (a small `ACCESS_DOMAINS` JSON secret works). Delete `public/login/`, `functions/api/login.js`, `functions/api/logout.js`, `scripts/add-client.mjs` and the `clients` table's code columns.
4. Point the header's Sign out link at `/cdn-cgi/access/logout`.

Access gives per-person identity and audit logs; codes are simpler for a firm to share with all its staff. Codes are the default because staff often do not have a client-domain email the firm wants to register.

## Per-client tailoring

Client IRPs are tailored, so a client can have `src/content/clients/<clientId>.json`. It is merged over the default bank after sign-in. Overrides are compiled into the Functions at build time and served one client at a time by `/api/client`, so one client never sees another's. The repo ships with none.

```json
{
  "irpVersion": "Acme Wealth Partners IRP, version 2.1 (March 2027)",
  "facts": {
    "carrier": "Acme Mutual Cyber"
  },
  "hide": ["roles_tabletop"],
  "replace": {
    "notice_template": { "irp_ref": "Appendix G Client Breach Notice" }
  },
  "add": [ { "id": "acme_wire_callback", "section": 4, "type": "knowledge", "...": "full question object" } ]
}
```

- `facts` fill the `{{placeholders}}` in the default questions (today only `{{carrier}}`). Add a placeholder to a question when a client's IRP differs on a fact it tests, and `replace` the options too if the tailored fact would make a distractor correct.
- `hide` removes questions by ID. `replace` merges fields into a question. `add` appends full questions, placed at the end of their section.
- `npm run test:unit` validates every override file (one correct option, 2/1/0 points, required references, no unfilled placeholders).

## Edit content

| File | What it controls |
|---|---|
| `src/content/questions.json` | Sections (with crosswalk text), questions, options, explanations, exam findings, IRP and rule references, tie-ins, default facts |
| `src/content/config.json` | Product name, report title, IRP version, contact details, disclaimer, knowledge band thresholds, next steps by audience |
| `src/content/sources.md` | Verification log for every rule reference, date and number |
| `docs/question-review.md` | Generated review and sign-off file (`npm run review:export`) |
| `docs/irp-template-discrepancies.md` | Where the IRP template and the rule disagree, with held-out question drafts |

Question rules (enforced by `tests/content.test.mjs`):

- Every question needs `id`, `section` (1 to 8), `type`, `title`, `question`, `options`, `irp_ref`, `regsp_ref` (a CFR cite, or `none:` with a reason), `tie_in` and `mapped_service`.
- `knowledge`: four options, exactly one `"correct": true`, plus `explanation`. The correct answer must not stand out by length. Options are shuffled per visit. No feedback during the quiz.
- `readiness`: options score 2, 1, 0 in order, plus `help` and `exam_finding`.
- Size: keep the bank at 13 to 17 questions with at least one per section and at least six of each type. Everyone answers every question; there is no audience routing.
- Copy: plain English, short sentences. Use "aligned" and "exam-ready". Never "compliant", "certified", "pass" or "fail". No em dashes, en dashes or double hyphens. Role titles, never personal names.

Scoring: Program Readiness uses the Reg S-P app's math (section percent, averaged over sections with readiness questions; 85 Exam-ready, 60 Gaps an examiner would note). IRP Knowledge is percent correct (90 Ready to respond, 70 Refresher recommended, below that Retraining needed; thresholds in `config.json`).

To refresh the IRP text after the template changes: put the new .docx in `reference/` and run `npm run extract:irp reference/<file>.docx reference/irp-template.md`.

The login page cannot load the gated bundle, so `public/login/` carries copies of `brand.css`, `base.css`, `components.css`, the fonts and the logo. `npm run build` refreshes them (`npm run sync:login` does it alone), and a unit test fails if they drift.

## Completed assessments

When someone clicks Download my report, the browser posts their name, work email, role and answers (question ID to option index) to `/api/completion`. The Function rebuilds that client's question bank, scores the answers itself and saves the record in D1 (`submissions`: the answers, the server's scores and section scores, and a snapshot of the bank as shown). Scores sent by a browser are ignored. Then it emails AdvisorDefense through Resend: firm, role, both scores and a link to the record in the admin dashboard. The email carries no name, email address or answers. The client comes from the session cookie, never from the request. The report screen names every field and the retention period before download. One save per visit; the PDF never waits for it, and downloads even if it fails. If the email fails, the record is still saved.

Records are kept for `retentionYears` in `src/content/config.json` (6).

Security model: POST only, allowed origins only, JSON only, 4 KB cap, a signed-in session, every answer validated against that client's bank (every question answered, valid option index, nothing extra), Turnstile (action `completion`), the record stored before the email, HTML-escaped email with no line breaks in the subject, recipient from configuration, outcome-only logs.

## Deploy to Cloudflare Pages

1. Workers and Pages, Create, Pages, Import an existing Git repository. Grant the Cloudflare GitHub app access to this repository only. Project name: `irp-assessment` (if you choose another, update `DEFAULT_ORIGINS` in `functions/_lib/http.js` or set `ALLOWED_ORIGINS`).
2. Production branch `main`. Framework preset None. Build command `npm run build`. Output directory `dist`.
3. Create the D1 database and its tables, and bind it to the project:
   - `npx wrangler d1 create irp-assessment`
   - `npx wrangler d1 migrations apply irp-assessment --remote` (from this repo; run it again whenever `migrations/` gains a file, before deploying)
   - Pages project, Settings, Bindings, Add, D1 database: variable name `DB`, database `irp-assessment`.
   - Moving from the old `ACCESS_CODES` secret: `npm run import-codes <saved-access-codes.json>`, run the command it prints, sign in with one existing code, then delete the secret.
4. Set every variable and secret in the table below, then deploy.
5. Custom domains: add `irp.advisordefense.com`. The zone is in the same account, so DNS is created automatically.
6. Settings, Builds, Branch control: Preview branch None. Only `main` is published.
7. On GitHub, protect `main` with a ruleset: pull request required, no force pushes, no deletion.
8. Create the rate limiting rule above and the Turnstile widget (hostnames `irp.advisordefense.com` and `irp-assessment.pages.dev`).

### Zone settings that must keep excluding this site

The site runs on the `advisordefense.com` zone with the main website. Two zone settings broke the Reg S-P app on 2026-10-29 and must exclude this host too:

- **Response Header Transform Rule** that sets the main website's Content-Security-Policy. Add `irp.advisordefense.com` to its exclusion (Hostname is not in `regsp.advisordefense.com irp.advisordefense.com`). Browsers enforce every CSP they receive, so the main site's policy would break the PDF logo.
- **Web Analytics (RUM) automatic injection** must stay off for the zone. It injects a script this CSP blocks and conflicts with the no-analytics rule.

After any zone or deploy change, sign in, open the browser console and run `fetch(location.href).then(r => r.headers.get('content-security-policy'))`. It must return exactly the policy in `public/_headers`. Also confirm, signed out, that `https://irp.advisordefense.com/assets/<bundle>.js` returns 401 (check the bundle name in View Source after signing in). [VERIFY] after the first deploy that the zone's cache rules do not cache `/assets/*` in front of the Pages Function; the responses are marked `private`, but a "Cache Everything" rule would override that.

### Variables and secrets (Production)

| Name | Type | Value |
|---|---|---|
| `NODE_VERSION` | Plaintext | `22` |
| `DB` | D1 binding | The `irp-assessment` database (step 3). Sign-in fails closed without it. Clients are added with `npm run add-client`. |
| `SESSION_SECRET` | Secret | At least 32 random bytes, for example `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `VITE_TURNSTILE_SITE_KEY` | Plaintext | Turnstile site key (public). Read at build time by the app and at runtime by the login page. Without it, the completion notice and its disclosure are off. |
| `TURNSTILE_SITE_KEY` | Plaintext, optional | Overrides the site key served to the login page. Normally leave unset. |
| `TURNSTILE_SECRET_KEY` | Secret | Turnstile secret key. Sign-in refuses to run without it. |
| `RESEND_API_KEY` | Secret | Resend key with Sending access, restricted to the sending domain |
| `RESEND_FROM_EMAIL` | Plaintext | Sender on the verified Resend domain, for example `IRP Readiness <notify@notify.advisordefense.com>` |
| `COMPLETION_NOTIFY_EMAIL` | Plaintext | Inbox for completion notices with the dashboard link (comma-separated for more than one). The link uses the first `ALLOWED_ORIGINS` entry. |
| `ALLOWED_ORIGINS` | Plaintext, optional | Origins allowed to post. Default `https://irp.advisordefense.com,https://irp-assessment.pages.dev` |
| `LOCAL_DEV` | Local only | Never set in Cloudflare. In `.dev.vars` it turns on local dev mode (no Turnstile check, session cookie without Secure). Ignored unless every allowed origin is http localhost. |
| `DEV_API_PORT` | Local only, optional | Port for the local API (default 8799). |

### Rotating keys

- **Resend** (every 90 days, or at once if exposed): create a new key in Resend, update `RESEND_API_KEY`, redeploy, complete a test assessment, then revoke the old key.
- **Turnstile secret**: rotate on the widget's page in the Turnstile dashboard, update `TURNSTILE_SECRET_KEY`, redeploy, sign in to confirm.
- **SESSION_SECRET** (yearly, or at once if exposed): set a new random value and redeploy. Everyone currently signed in is signed out. Saved assessments are not affected.
- **Access codes**: issue a new code with `npm run add-client` (same `clientId`) for each annual review, run the command it prints and send the new code. The old code stops working at once. Revoke former clients. A code that may have been shared too widely is replaced the same way.

## Design and accessibility

Same tokens, type scale, motion and QA checklist as the Reg S-P app (`docs/design-spec.md`). Colors are plain hex variables in `src/styles/brand.css`; the PDF reads them at runtime. Before release, run the design-spec QA checklist: axe on every screen state, keyboard-only run, 320px and 200% zoom, Windows forced colors, reduced motion, no `style=""` or `<style>` in HTML strings, copy lint, and the PDF opened in Acrobat and macOS Preview. The smoke test automates all but the last item and a visual check of forced colors.

## Out of scope for v1

See `docs/roadmap.md`.

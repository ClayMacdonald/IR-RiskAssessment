# Handoff: IRP and Reg S-P Readiness Assessment

Prepared 2026-11-03 for the Founder and CEO, who takes ownership of hosting, email and every deploy step from here.

## What this is

A password-protected assessment for AdvisorDefense clients. Each client's CSIRT answers 20 questions (12 IRP knowledge, 8 program readiness) and downloads a dated PDF for their compliance file. AdvisorDefense staff manage clients, codes and results in an admin dashboard.

Live addresses once deployed:

- Client assessment: `https://irp.advisordefense.com`
- Admin dashboard: `https://irp.advisordefense.com/admin/` (AdvisorDefense emails only, through Cloudflare Access)

`README.md` is the full technical reference. Its Deploy section is the source of truth for setup steps.

## Status today

The code is finished and tested (108 unit tests, 785 browser checks, all passing). **Nothing is deployed.** No Cloudflare project, database, Access application or Resend account exists yet. Nothing in the code points to anyone's computer or personal account: there are no account IDs, personal emails or local addresses in tracked files.

## What you own after handoff

| Item | Where it lives | Status today | Who sets it up |
|---|---|---|---|
| Source code | GitHub repository `IR-RiskAssessment` | On the developer's GitHub account. Transfers to yours at handoff. | Developer transfers, you accept |
| Hosting | Cloudflare Pages project `irp-assessment` | Not created | You |
| Database (clients, results, activity log) | Cloudflare D1 database `irp-assessment`, bound as `DB` | Not created | You |
| Admin sign-in | Cloudflare Zero Trust, Access application "IRP Assessment Admin" | Not created | You |
| Bot check on sign-in | Cloudflare Turnstile widget | Not created | You |
| Sign-in rate limit | Cloudflare WAF rate limiting rule on `advisordefense.com` | Not created | You |
| Web address | `irp.advisordefense.com` custom domain on the Pages project | Not created | You |
| Completion emails | Resend account, verified sending domain, API key | Not created | You |
| Completion inbox | A shared mailbox (recommended), not one person's inbox | Not chosen | You |
| IRP template source files | `reference/` folder (not in GitHub by design) | On the developer's machine | Developer sends through the company file store |

## What does not carry over

These exist only on the developer's machine and are not needed in production:

- `.dev.vars`: local test settings. `npm run dev:setup` creates a fresh one on any machine.
- The local database in `.wrangler/` and its test clients and codes. None of them work in production.
- No production secret, API key or access code was ever created, so there is nothing to rotate or revoke.

## Developer's handoff steps

1. Push all work to GitHub. (Done before this document was shared.)
2. GitHub: repository Settings, General, Danger Zone, Transfer ownership. Enter the CEO's GitHub username. The CEO accepts from the email GitHub sends.
3. Share the `reference/` folder (the IRP template .docx and its .md extract) through the company file store. Place it at `reference/` in the cloned repository. It is git-ignored and must stay out of GitHub.
4. Confirm the CEO can clone the repository and run `npm install`, `npm run dev:setup` and `npm run dev`.
5. After the transfer, confirm the developer's own access level on the repository (collaborator or removed) as the CEO decides.

## Access checklist for the CEO

You need each of these before starting the setup prompt below:

- [ ] Owner of the GitHub repository (after the transfer).
- [ ] Super Administrator on the Cloudflare account that holds the `advisordefense.com` zone.
- [ ] Zero Trust enabled on that account (the free plan covers up to 50 users). Note the team domain, for example `advisordefense.cloudflareaccess.com`.
- [ ] A Resend account owned by AdvisorDefense (company email, not personal).
- [ ] DNS edit rights on `advisordefense.com` (Resend domain verification adds DNS records).
- [ ] The shared inbox that receives completion notices.
- [ ] Node 22.13 or later and Git on your computer, and Claude Code if you use the prompt below.

## Open decisions (not blockers for setup)

- **Retention.** Records are kept six years, then deleted automatically. [VERIFY] with compliance counsel that six years fits AdvisorDefense's record-keeping obligations and client agreements.
- **Who gets admin.** The default is anyone with an `@advisordefense.com` email. The Access policy can list named people instead.
- **Content sign-off.** See "Before launch" in `README.md`: question review, template discrepancies and the remaining `[VERIFY]` items in `src/content/sources.md`.
- **Client contact inbox.** The footer and PDF show Support@AdvisorDefense.com. Confirm it is the right inbox for client questions.

## Setup prompt for Claude Code

Open a terminal in the cloned repository, start Claude Code, and paste everything inside the box.

```text
I am the Founder and CEO of AdvisorDefense and I now own this repository: the IRP and Reg S-P
Readiness Assessment. Nothing is deployed yet. Walk me through deploying it to production on
Cloudflare Pages, one step at a time.

First, read README.md (especially "Deploy to Cloudflare Pages", "Admin access", "Zone settings",
"Variables and secrets" and "Rate limiting rule") and docs/handoff.md. Treat the README as the
source of truth. Then confirm I have everything in the "Access checklist" in docs/handoff.md
before we start.

Steps, in this order. After each one, tell me exactly what to click or run, wait for me to
confirm it worked, and check what you can (for example with wrangler) before moving on:

1. Run npm install and the unit tests (npm run test:unit) so we know the code is healthy.
2. Log in with npx wrangler login, on the AdvisorDefense Cloudflare account.
3. Create the D1 database irp-assessment and apply the migrations remotely.
4. Create the Pages project irp-assessment from the GitHub repository (Cloudflare GitHub app
   limited to this repository only). Production branch main, build command npm run build,
   output dist, preview branches off. Bind the D1 database as DB.
5. Create the Turnstile widget for irp.advisordefense.com and irp-assessment.pages.dev.
6. Set up Resend: verify a sending domain (for example notify.advisordefense.com) with the DNS
   records it gives, and create an API key with Sending access limited to that domain.
7. Set every production variable and secret from the README table. Generate SESSION_SECRET
   locally with the README command and paste it straight into Cloudflare as an encrypted secret.
   COMPLETION_NOTIFY_EMAIL is our shared inbox. VITE_TURNSTILE_SITE_KEY must be set, or the
   completion notice and its disclosure are off.
8. Add the custom domain irp.advisordefense.com, and check the two zone settings in the README
   (the CSP transform rule exclusion and Web Analytics injection off).
9. Create the rate limiting rule on /api/login (check whether the Reg S-P app already uses the
   free plan's one rule, and combine the paths if so).
10. Create the Cloudflare Access application and policy for /admin and /api/admin, then set
    ACCESS_TEAM_DOMAIN, ACCESS_AUD and ADMIN_EMAIL_DOMAIN, and redeploy.
11. Protect main on GitHub with a ruleset (pull request required, no force push, no deletion).
12. Verify, and show me each result:
    - Signed out, https://irp.advisordefense.com/admin/ asks for an Access sign-in.
    - https://irp-assessment.pages.dev/admin/ returns 403.
    - The response CSP equals public/_headers exactly, and signed out the JS bundle returns 401.
    - In /admin/, add a test client and note its code (it shows once).
    - With that code, in a private window, complete the assessment and download the PDF.
    - The completion email reaches our inbox and its link opens the record in /admin/.
    - The admin PDF download works.
    - A client code cannot open /admin/.
    - Then delete the test record and revoke the test client.

Rules you must follow:
- Never set LOCAL_DEV or ADMIN_DEV_EMAIL in Cloudflare.
- Never commit secrets, never put production secrets in .dev.vars, and never print a secret
  back to me after I enter it. Secrets go in Cloudflare as encrypted variables.
- Do not change application code unless a step cannot work without it. If it must change, explain
  why first, and run npm run test:unit before committing.
- Cloudflare and Resend dashboards change. If what I see differs from the README, say so, mark it
  [VERIFY], and work it out with me rather than guessing.
- Do not use em dashes or double hyphens in anything you write into this repository.

When everything is verified, update README.md and docs/handoff.md to record what was set up and
when (no secrets), and list anything still open, including the retention check with compliance
counsel.
```

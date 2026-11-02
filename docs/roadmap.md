# Roadmap (out of scope for v1)

Each item lists the clean path from the v1 design. None is built.

## Year-over-year comparison (without storing answers)

The completion notice already gives AdvisorDefense each person's scores, section scores and missed question IDs, dated. A small script could turn those emails (or a Resend webhook into a spreadsheet) into a per-client trend table for the annual IRP review. No server-side answer storage needed.

## Multi-year trend charts in the app

Let a person upload last year's PDF, or paste a short summary code printed in it, and show change by section on the results screen. The data stays on the device. Needs a stable, signed summary block in the PDF so it cannot be edited.

## Firm-level rollup for the CCO

A CCO view that combines several people's results into one firm report. Clean path: each person's report screen offers a "summary file" (scores and missed IDs only), and the CCO drops the files into a rollup screen that builds a firm PDF on the device. Still no server storage.

## Server-side storage and an admin dashboard

Would change the privacy model ("answers stay in your browser") and the disclosures, and adds data retention, access control and breach exposure for AdvisorDefense itself. If wanted, use Cloudflare D1 behind the same session, store scores and missed IDs only (never answer text), add a retention period, and update the README, the report disclosure and the design-spec QA item on what is sent.

## User accounts

Replace access codes with Cloudflare Access (see README, "Switching to Cloudflare Access"). That gives per-person identity and logs without building accounts.

## LMS integration

Export a SCORM or xAPI completion statement (person, date, knowledge score, pass mark from `config.json` bands) for firms that track training in an LMS. The bands use "Ready to respond", not a pass or fail, so the LMS mapping needs a decision.

## Per-client IRP extraction

Generate a client override file directly from a client's tailored IRP .docx (CSIRT titles, criticality table, carrier) with `scripts/extract-irp.mjs`, then review it by hand.

## Staff knowledge path

Removed 2026-11-02 so the tool serves the CSIRT only. The 11-question staff path (Appendix E, the Supervised Person FAQ) is in git history before that date: the `audience` field, the staff role and the questions cut in that change. If AdvisorDefense later wants staff training records, restore it as a separate, shorter flow with its own report title, rather than mixing it back into the CSIRT readiness report.

## Held-out questions

Add `records_retention`, `notice_contents` and `notice_unknown_individuals` once the template fixes in `docs/irp-template-discrepancies.md` are decided.

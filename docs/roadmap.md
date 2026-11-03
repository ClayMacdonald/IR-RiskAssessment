# Roadmap (out of scope for v1)

Each item lists the clean path from the v1 design. None is built.

## Year-over-year comparison in the dashboard

Completed assessments are stored in D1 for six years (built 2026-11-02). A per-client trend view in the admin dashboard (scores and section scores by year) needs no new data, only a screen.

## Multi-year trend charts in the app

Let a person upload last year's PDF, or paste a short summary code printed in it, and show change by section on the results screen. The data stays on the device. Needs a stable, signed summary block in the PDF so it cannot be edited.

## Firm-level rollup for the CCO

A firm report that combines several people's results. The records are already in D1, so the admin dashboard can build it for AdvisorDefense to share with the CCO. A self-service CCO view would need per-person sign-in for the client (see "User accounts").

## User accounts

Replace access codes with Cloudflare Access (see README, "Switching to Cloudflare Access"). That gives per-person identity and logs without building accounts.

## LMS integration

Export a SCORM or xAPI completion statement (person, date, knowledge score, pass mark from `config.json` bands) for firms that track training in an LMS. The bands use "Ready to respond", not a pass or fail, so the LMS mapping needs a decision.

## Per-client IRP extraction

Generate a client override file directly from a client's tailored IRP .docx (CSIRT titles, criticality table, carrier) with `scripts/extract-irp.mjs`, then review it by hand.

## Staff knowledge path

Removed 2026-11-02 so the tool serves the CSIRT only. The 11-question staff path (Appendix E, the Supervised Person FAQ) is in git history before that date: the `audience` field, the staff role and the questions cut in that change. If AdvisorDefense later wants staff training records, restore it as a separate, shorter flow with its own report title, rather than mixing it back into the CSIRT readiness report.

## Held-out questions

Add `records_retention`, `notice_contents` and `notice_unknown_individuals` once the template fixes in `docs/irp-template-discrepancies.md` are decided. The bank was trimmed to 15 questions on 2026-11-02 and set at 20 on 2026-11-03, so each one should replace an existing question rather than add to the total.
